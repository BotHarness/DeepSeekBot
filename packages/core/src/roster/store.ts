import { randomUUID } from 'node:crypto';

import type { Domain, DomainSpec } from '@deepseek-ai/dsh-storage-domain';

import { z } from 'zod';

import {
  attachOperationalModule,
  OperationalDatabaseError,
  type OperationalDatabaseOwner,
  type OperationalDatabaseModulePort,
} from '../database/owner.js';
import {
  rosterDomainSpec,
  rosterDomainState,
  rosterSectionRecord,
  type RosterDomainState,
  type RosterSectionRecord,
} from './spec.js';
import type { TopOrderEntry } from './spec.js';

export interface RosterSection {
  id: string;
  name: string;
  channelIds: string[];
}

export interface RosterSnapshot {
  pins: string[];

  hidden: string[];
  muted: string[];
  sectionOrder: string[];
  sections: RosterSection[];

  topOrder: TopOrderEntry[] | undefined;
}

export const MAX_ROSTER_BATCH_SIZE = 100;

export interface RosterBatchChange {
  action: 'pin' | 'unpin' | 'hide' | 'move';
  channelIds: readonly string[];

  sectionId?: string;
}

export interface RosterDomainFacility {
  open<S extends DomainSpec>(spec: S): Promise<Domain<S>>;
}

export class RosterUnavailableError extends Error {
  constructor() {
    super('roster storage is unavailable');
    this.name = 'RosterUnavailableError';
  }
}

export class RosterUnknownSectionError extends Error {
  constructor(readonly sectionId: string) {
    super(`unknown Channel section: ${sectionId}`);
    this.name = 'RosterUnknownSectionError';
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (value.length === 0 || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function entryKey(entry: TopOrderEntry): string {
  return `${entry.kind}:${entry.id}`;
}

function sameEntries(left: readonly TopOrderEntry[], right: readonly TopOrderEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index] as TopOrderEntry;
      return entry.kind === other.kind && entry.id === other.id;
    })
  );
}

function sanitizeTopOrder(entries: readonly TopOrderEntry[], table: SectionTable): TopOrderEntry[] {
  const sectioned = new Set<string>();
  for (const [, record] of table.entries()) {
    for (const channelId of record.channelIds) sectioned.add(channelId);
  }
  const seen = new Set<string>();
  const next: TopOrderEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'section') {
      if (table.get(entry.id) === undefined) continue;
    } else if (sectioned.has(entry.id)) {
      continue;
    }
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push({ kind: entry.kind, id: entry.id });
  }
  return next;
}

function nextGlobalState(
  state: RosterDomainState,
  patch: {
    pins?: readonly string[];
    hidden?: readonly string[];
    muted?: readonly string[];
    sectionOrder?: readonly string[];
    topOrder?: readonly TopOrderEntry[] | undefined;
  },
): RosterDomainState {
  const next: RosterDomainState = {
    pins: patch.pins === undefined ? [...state.pins] : [...patch.pins],
    sectionOrder:
      patch.sectionOrder === undefined ? [...state.sectionOrder] : [...patch.sectionOrder],
  };
  const hidden = patch.hidden ?? state.hidden;
  if (hidden !== undefined) next.hidden = [...hidden];
  const muted = patch.muted ?? state.muted;
  if (muted !== undefined) next.muted = [...muted];
  const topOrder = patch.topOrder ?? state.topOrder;
  if (topOrder !== undefined) next.topOrder = [...topOrder];
  return next;
}

export interface RosterStoreOptions {
  database: OperationalDatabaseOwner;
  warn?: ((message: string) => void) | undefined;
  onCommitted?: (() => void) | undefined;
}

const arrangementRecord = z.object({
  state: rosterDomainState,
  sections: z.array(z.tuple([z.string().min(1), rosterSectionRecord])),
});

type ArrangementRecord = z.infer<typeof arrangementRecord>;
interface ArrangementDraft {
  state: RosterDomainState;
  sections: Map<string, RosterSectionRecord>;
}
interface SectionTable {
  get(id: string): RosterSectionRecord | undefined;
  entries(): IterableIterator<[string, RosterSectionRecord]>;
  put(id: string, record: RosterSectionRecord): void;
  delete(id: string): boolean;
}

function validateArrangement(value: unknown): ArrangementRecord {
  const parsed = arrangementRecord.parse(value);
  const sectionIds = new Set<string>();
  const membership = new Set<string>();
  for (const [id, section] of parsed.sections) {
    if (sectionIds.has(id)) throw new Error('Duplicate roster section');
    sectionIds.add(id);
    for (const channelId of section.channelIds) {
      if (channelId.length === 0 || membership.has(channelId))
        throw new Error('Invalid roster membership');
      membership.add(channelId);
    }
  }
  return parsed;
}

export class RosterStore {
  private readonly database: OperationalDatabaseModulePort;
  private imported = false;
  private draft: ArrangementDraft | undefined;
  private opening: Promise<void> | undefined;
  private closing = false;
  private warned = false;
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly options: RosterStoreOptions) {
    this.database = attachOperationalModule(options.database, 'roster');
    if (options.database.mode === 'ready') {
      this.imported = this.database.read(
        (database) =>
          database
            .prepare('SELECT singleton FROM roster_arrangement_import WHERE singleton = 1')
            .get() !== undefined,
      );
      if (this.imported) this.readData();
    }
  }

  get available(): boolean {
    return this.imported && !this.closing && this.options.database.mode === 'ready';
  }

  async attach(facility: RosterDomainFacility): Promise<void> {
    this.closing = false;
    if (this.imported) return;
    if (this.opening !== undefined) return this.opening;
    if (this.options.database.mode !== 'ready') throw new RosterUnavailableError();
    const opening = this.importLegacy(facility);
    this.opening = opening;
    try {
      await opening;
    } finally {
      if (this.opening === opening) this.opening = undefined;
    }
  }

  private async importLegacy(facility: RosterDomainFacility): Promise<void> {
    const started = performance.now();
    let domain: Domain<typeof rosterDomainSpec> | undefined;
    try {
      domain = await facility.open(rosterDomainSpec);
      if (this.closing) return;
      const record = validateArrangement({
        state: domain.global.get(),
        sections: [...domain.table('sections').entries()],
      });
      this.database.transaction((database) => {
        if (
          database.prepare('SELECT singleton FROM roster_arrangement WHERE singleton = 1').get() !==
          undefined
        )
          throw new Error('Roster target exists without an import marker');
        database
          .prepare('INSERT INTO roster_arrangement(singleton, body) VALUES (1, ?)')
          .run(JSON.stringify(record));
        database
          .prepare('INSERT INTO roster_arrangement_import(singleton, imported_at) VALUES (1, ?)')
          .run(new Date().toISOString());
      });
      this.imported = true;
      this.warned = false;
      this.notifyCommitted();
      this.warn(
        `roster-import initiator=host-startup phase=completed count=${record.sections.length} durationMs=${Math.round(performance.now() - started)}`,
      );
    } catch {
      this.warn(
        `roster-import initiator=host-startup phase=failed durationMs=${Math.round(performance.now() - started)}`,
      );
      throw new RosterUnavailableError();
    } finally {
      if (domain !== undefined) {
        await domain
          .close()
          .catch(() => this.warn('roster-import initiator=host-startup phase=source-close-failed'));
      }
    }
  }

  async detach(): Promise<void> {
    this.closing = true;
    if (this.opening !== undefined) await this.opening.catch(() => {});
    await this.tail;
  }

  snapshot(): RosterSnapshot {
    const table = this.requireTable();
    const state = this.requireGlobal().get();
    const topOrder =
      state.topOrder === undefined ? undefined : sanitizeTopOrder(state.topOrder, table);
    const order =
      topOrder === undefined
        ? state.sectionOrder
        : [
            ...topOrder.flatMap((entry) => (entry.kind === 'section' ? [entry.id] : [])),
            ...state.sectionOrder,
          ];
    const sections = this.orderedSections(order);
    return {
      pins: [...state.pins],
      hidden: [...(state.hidden ?? [])],
      muted: [...(state.muted ?? [])],
      sectionOrder: sections.map((section) => section.id),
      sections,
      topOrder,
    };
  }

  sectionCreate(name: string): Promise<RosterSection> {
    return this.enqueue(() => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const id = randomUUID();
      table.put(id, { name, channelIds: [] });
      const state = global.get();
      global.set(
        nextGlobalState(state, {
          sectionOrder: [id, ...state.sectionOrder],
          topOrder:
            state.topOrder === undefined ? undefined : [{ kind: 'section', id }, ...state.topOrder],
        }),
      );
      return { id, name, channelIds: [] };
    });
  }

  sectionRename(sectionId: string, name: string): Promise<RosterSection> {
    return this.enqueue(() => {
      const table = this.requireTable();
      const current = table.get(sectionId);
      if (current === undefined) throw new RosterUnknownSectionError(sectionId);
      if (current.name !== name) {
        table.put(sectionId, { name, channelIds: [...current.channelIds] });
      }
      return { id: sectionId, name, channelIds: [...current.channelIds] };
    });
  }

  sectionRemove(sectionId: string): Promise<boolean> {
    return this.enqueue(() => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const removed = table.get(sectionId);
      const deleted = table.delete(sectionId);
      if (!deleted) return false;
      const state = global.get();
      const members = removed === undefined ? [] : [...removed.channelIds];
      global.set(
        nextGlobalState(state, {
          sectionOrder: state.sectionOrder.filter((id) => id !== sectionId),
          topOrder:
            state.topOrder === undefined
              ? undefined
              : sanitizeTopOrder(
                  state.topOrder.flatMap((entry) =>
                    entry.kind === 'section' && entry.id === sectionId
                      ? members.map((id) => ({ kind: 'channel' as const, id }))
                      : [entry],
                  ),
                  table,
                ),
        }),
      );
      return true;
    });
  }

  channelAssign(channelId: string, sectionId: string | undefined, index?: number): Promise<void> {
    return this.enqueue(() => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      if (sectionId !== undefined && table.get(sectionId) === undefined) {
        throw new RosterUnknownSectionError(sectionId);
      }
      const removals: Array<[string, RosterSectionRecord]> = [];
      let target: [string, RosterSectionRecord] | undefined;
      for (const [id, record] of table.entries()) {
        const without = record.channelIds.filter((candidate) => candidate !== channelId);
        if (id === sectionId) {
          const at =
            index === undefined ? without.length : Math.max(0, Math.min(index, without.length));
          const channelIds = [...without.slice(0, at), channelId, ...without.slice(at)];
          if (!sameIds(channelIds, record.channelIds)) {
            target = [id, { name: record.name, channelIds }];
          }
          continue;
        }
        if (without.length !== record.channelIds.length) {
          removals.push([id, { name: record.name, channelIds: without }]);
        }
      }
      for (const [id, record] of removals) table.put(id, record);
      if (target !== undefined) table.put(target[0], target[1]);
      const state = global.get();
      if (state.topOrder === undefined) return;
      const topOrder =
        sectionId === undefined
          ? [...state.topOrder, { kind: 'channel' as const, id: channelId }]
          : state.topOrder.filter((entry) => entry.kind !== 'channel' || entry.id !== channelId);

      const next = sanitizeTopOrder(topOrder, table);
      if (!sameEntries(next, state.topOrder)) {
        global.set(nextGlobalState(state, { topOrder: next }));
      }
    });
  }

  sectionReorder(order: readonly string[]): Promise<string[]> {
    return this.enqueue(() => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const current = this.orderedSections(global.get().sectionOrder).map((section) => section.id);
      const known = new Set(current);
      const next: string[] = [];
      for (const id of order) {
        if (known.has(id) && !next.includes(id)) next.push(id);
      }
      for (const id of current) {
        if (!next.includes(id)) next.push(id);
      }
      const state = global.get();
      let topOrder: TopOrderEntry[] | undefined;
      if (state.topOrder !== undefined) {
        const placed = new Set(
          state.topOrder.flatMap((entry) => (entry.kind === 'section' ? [entry.id] : [])),
        );
        const queue = next.filter((id) => placed.has(id));
        const rest = next.filter((id) => !placed.has(id));
        const merged: TopOrderEntry[] = [];
        for (const entry of state.topOrder) {
          if (entry.kind === 'section') {
            merged.push({ kind: 'section', id: queue.shift() as string });
          } else {
            merged.push({ kind: entry.kind, id: entry.id });
          }
        }
        for (const id of rest) merged.push({ kind: 'section', id });
        topOrder = sanitizeTopOrder(merged, table);
      }
      const storedTop = state.topOrder;
      if (
        sameIds(next, state.sectionOrder) &&
        (topOrder === undefined || (storedTop !== undefined && sameEntries(topOrder, storedTop)))
      ) {
        return next;
      }
      global.set(nextGlobalState(state, { sectionOrder: next, topOrder }));
      return next;
    });
  }

  topReorder(order: readonly TopOrderEntry[]): Promise<TopOrderEntry[]> {
    return this.enqueue(() => {
      const table = this.requireTable();
      const global = this.requireGlobal();
      const state = global.get();
      const next = sanitizeTopOrder(order, table);
      const current =
        state.topOrder === undefined ? undefined : sanitizeTopOrder(state.topOrder, table);
      if (current !== undefined && sameEntries(next, current)) return next;
      global.set(nextGlobalState(state, { topOrder: next }));
      return next;
    });
  }

  applyBatch(
    change: RosterBatchChange,
    resolvePin: (pin: string) => string = (pin) => pin,
  ): Promise<RosterSnapshot> {
    return this.enqueue(() => {
      const ids = uniqueStrings(change.channelIds);
      if (
        ids.length === 0 ||
        change.channelIds.length > MAX_ROSTER_BATCH_SIZE ||
        ids.length !== change.channelIds.length
      ) {
        throw new RangeError(
          `roster batch must contain 1–${MAX_ROSTER_BATCH_SIZE} distinct channels`,
        );
      }
      const table = this.requireTable();
      const global = this.requireGlobal();
      const state = global.get();
      const selected = new Set(ids);
      const pins = uniqueStrings(state.pins.map(resolvePin));
      if (change.action === 'pin') {
        const existing = new Set(pins);
        const next = [...pins, ...ids.filter((id) => !existing.has(id))];
        if (!sameIds(next, state.pins)) {
          global.set(nextGlobalState(state, { pins: next }));
        }
        return this.snapshot();
      }
      if (change.action === 'hide') {
        const hidden = uniqueStrings(state.hidden ?? []);
        const existing = new Set(hidden);
        const next = [...hidden, ...ids.filter((id) => !existing.has(id))];
        if (!sameIds(next, state.hidden ?? [])) {
          global.set(nextGlobalState(state, { hidden: next }));
        }
        return this.snapshot();
      }
      const nextPins = pins.filter((id) => !selected.has(id));
      if (change.action === 'unpin') {
        if (!sameIds(nextPins, state.pins)) {
          global.set(nextGlobalState(state, { pins: nextPins }));
        }
        return this.snapshot();
      }

      const sectionId = change.sectionId;
      if (sectionId !== undefined && table.get(sectionId) === undefined) {
        throw new RosterUnknownSectionError(sectionId);
      }
      const updates: Array<[string, RosterSectionRecord]> = [];
      for (const [id, record] of table.entries()) {
        const remaining = record.channelIds.filter((candidate) => !selected.has(candidate));
        const channelIds = id === sectionId ? [...remaining, ...ids] : remaining;
        if (!sameIds(channelIds, record.channelIds)) {
          updates.push([id, { name: record.name, channelIds }]);
        }
      }
      for (const [id, record] of updates) table.put(id, record);
      const topOrder =
        state.topOrder === undefined
          ? undefined
          : sanitizeTopOrder(
              [
                ...state.topOrder.filter(
                  (entry) => entry.kind !== 'channel' || !selected.has(entry.id),
                ),
                ...(sectionId === undefined
                  ? ids.map((id) => ({ kind: 'channel' as const, id }))
                  : []),
              ],
              table,
            );
      if (
        !sameIds(nextPins, state.pins) ||
        (topOrder !== undefined &&
          (state.topOrder === undefined || !sameEntries(topOrder, state.topOrder)))
      ) {
        global.set(nextGlobalState(state, { pins: nextPins, topOrder }));
      }
      return this.snapshot();
    });
  }

  pinsSet(pins: readonly string[]): Promise<string[]> {
    return this.enqueue(() => {
      const global = this.requireGlobal();
      const next = uniqueStrings(pins);
      const state = global.get();
      if (!sameIds(next, state.pins)) {
        global.set(nextGlobalState(state, { pins: next }));
      }
      return next;
    });
  }

  hiddenSet(hidden: readonly string[]): Promise<string[]> {
    return this.enqueue(() => {
      const global = this.requireGlobal();
      const next = uniqueStrings(hidden);
      const state = global.get();
      if (!sameIds(next, state.hidden ?? [])) {
        global.set(nextGlobalState(state, { hidden: next }));
      }
      return next;
    });
  }

  mutedSet(channelId: string, muted: boolean): Promise<string[]> {
    return this.enqueue(() => {
      const global = this.requireGlobal();
      const state = global.get();
      const current = uniqueStrings(state.muted ?? []);
      const next = muted
        ? uniqueStrings([...current, channelId])
        : current.filter((id) => id !== channelId);
      if (!sameIds(next, state.muted ?? [])) {
        global.set(nextGlobalState(state, { muted: next }));
      }
      return next;
    });
  }

  private orderedSections(order: readonly string[]): RosterSection[] {
    const table = this.requireTable();
    const seen = new Set<string>();
    const sections: RosterSection[] = [];
    const project = (id: string, record: RosterSectionRecord): RosterSection => ({
      id,
      name: record.name,
      channelIds: [...record.channelIds],
    });
    for (const id of order) {
      if (seen.has(id)) continue;
      const record = table.get(id);
      if (record === undefined) continue;
      seen.add(id);
      sections.push(project(id, record));
    }
    for (const [id, record] of table.entries()) {
      if (seen.has(id)) continue;
      seen.add(id);
      sections.push(project(id, record));
    }
    return sections;
  }

  private enqueue<T>(operation: () => T): Promise<T> {
    const result = this.tail.then(() => {
      if (!this.available) {
        this.reportUnavailable();
        throw new RosterUnavailableError();
      }
      let value: T;
      try {
        value = this.database.transaction(
          (database) => {
            this.draft = this.readData();
            const before = JSON.stringify({
              state: this.draft.state,
              sections: [...this.draft.sections],
            });
            try {
              const outcome = operation();
              const after = JSON.stringify({
                state: this.draft.state,
                sections: [...this.draft.sections],
              });
              if (before !== after)
                database
                  .prepare('UPDATE roster_arrangement SET body = ? WHERE singleton = 1')
                  .run(after);
              return outcome;
            } finally {
              this.draft = undefined;
            }
          },
          ['roster'],
        );
      } catch (error) {
        if (
          error instanceof OperationalDatabaseError &&
          this.options.database.mode === 'ready' &&
          (error.cause instanceof RosterUnknownSectionError || error.cause instanceof RangeError)
        )
          throw error.cause;
        if (error instanceof OperationalDatabaseError) throw new RosterUnavailableError();
        throw error;
      }
      this.notifyCommitted();
      return value;
    });
    this.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  private notifyCommitted(): void {
    try {
      this.options.onCommitted?.();
    } catch {
      this.warn('roster-notification initiator=host phase=observer-failed');
    }
  }

  private warn(message: string): void {
    try {
      this.options.warn?.(message);
    } catch {}
  }

  private reportUnavailable(): void {
    if (this.warned) return;
    this.warned = true;
    this.warn('roster-storage initiator=host phase=unavailable arrangement=read-only');
  }

  private readData(): ArrangementDraft {
    if (this.draft !== undefined) return this.draft;
    if (!this.available) {
      this.reportUnavailable();
      throw new RosterUnavailableError();
    }
    try {
      return this.database.read((database) => {
        const row = database
          .prepare('SELECT body FROM roster_arrangement WHERE singleton = 1')
          .get();
        if (typeof row?.body !== 'string') throw new RosterUnavailableError();
        const record = validateArrangement(JSON.parse(row.body));
        return { state: record.state, sections: new Map(record.sections) };
      });
    } catch {
      throw new RosterUnavailableError();
    }
  }

  private requireDraft(): ArrangementDraft {
    if (this.draft === undefined) throw new RosterUnavailableError();
    return this.draft;
  }

  private requireTable(): SectionTable {
    const sections = this.readData().sections;
    return {
      get: (id) => sections.get(id),
      entries: () => sections.entries(),
      put: (id, record) => {
        this.requireDraft().sections.set(id, record);
      },
      delete: (id) => this.requireDraft().sections.delete(id),
    };
  }

  private requireGlobal(): { get(): RosterDomainState; set(state: RosterDomainState): void } {
    return {
      get: () => this.readData().state,
      set: (state) => {
        this.requireDraft().state = state;
      },
    };
  }
}

export function createRosterStore(options: RosterStoreOptions): RosterStore {
  return new RosterStore(options);
}
