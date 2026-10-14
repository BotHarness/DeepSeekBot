import type { BotModeSortMode } from '../bot-mode-settings.js';
import { reconcileOrder, sameIds } from './roster.js';
import type { TopOrderEntry } from './roster.js';
import type { ChannelSummary } from './store.js';

export function resolvedSortMode(
  override: BotModeSortMode | undefined,
  global: BotModeSortMode,
): BotModeSortMode {
  return override ?? global;
}

function updatedAtTime(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

export function recencyTime(channel: ChannelSummary): number {
  return updatedAtTime(channel.latestMessage?.at ?? channel.updatedAt);
}

function byRecency(left: ChannelSummary, right: ChannelSummary): number {
  const leftTime = recencyTime(left);
  const rightTime = recencyTime(right);
  if (leftTime !== rightTime) return rightTime - leftTime;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

export function orderScopeChannels(
  channels: readonly ChannelSummary[],
  mode: BotModeSortMode,
  manualOrder?: readonly string[] | undefined,
): ChannelSummary[] {
  if (mode === 'updated') return [...channels].sort(byRecency);
  if (manualOrder === undefined) return [...channels];
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  return reconcileOrder(
    manualOrder,
    channels.map((channel) => channel.id),
  ).flatMap((id) => {
    const channel = byId.get(id);
    return channel === undefined ? [] : [channel];
  });
}

export function rowDropHalf(
  clientY: number,
  rect: { top: number; height: number },
): 'before' | 'after' {
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

export function moveWithinOrder(
  order: readonly string[],
  sourceId: string,
  targetId: string,
  half: 'before' | 'after',
): string[] | undefined {
  if (sourceId === targetId) return undefined;
  const hasSource = order.includes(sourceId);
  const hasTarget = order.includes(targetId);
  if (!hasSource || !hasTarget) return undefined;
  const withoutSource = order.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  const insertAt = half === 'before' ? targetIndex : targetIndex + 1;
  const next = [...withoutSource.slice(0, insertAt), sourceId, ...withoutSource.slice(insertAt)];
  if (next.length === order.length && next.every((id, index) => id === order[index])) {
    return undefined;
  }
  return next;
}

export interface ScopeReorder {
  order: string[];
  setManualOverride: boolean;
}

export function commitScopeReorder(
  displayedOrder: readonly string[],
  sourceId: string,
  targetId: string,
  half: 'before' | 'after',
  manualOverride: boolean,
): ScopeReorder | undefined {
  const order = moveWithinOrder(displayedOrder, sourceId, targetId, half);
  if (order === undefined) return undefined;
  return { order, setManualOverride: !manualOverride };
}

export type ScopeDropTarget =
  | { kind: 'row'; channelId: string; half: 'before' | 'after' }
  | {
      kind: 'scope';
      position?: 'first' | 'last';
    };

export interface ChannelMoveDrop {
  targetScopeId: string | undefined;
  target: ScopeDropTarget;
  targetOrder: readonly string[];
  targetManualOverride: boolean;
}

export type ChannelMovePlan =
  | { kind: 'ungrouped'; setManualOverride: false }
  | { kind: 'section'; sectionId: string; order: string[]; setManualOverride: boolean };

export function planChannelMove(
  sourceScopeId: string | undefined,
  channelId: string,
  drop: ChannelMoveDrop,
): ChannelMovePlan | undefined {
  if (drop.target.kind === 'row' && drop.target.channelId === channelId) return undefined;
  const sameScope = sourceScopeId === drop.targetScopeId;
  if (drop.target.kind === 'scope' && sameScope && drop.targetOrder.includes(channelId))
    return undefined;
  const without = drop.targetOrder.filter((id) => id !== channelId);
  let order: string[];
  if (drop.target.kind === 'scope') {
    order = drop.target.position === 'first' ? [channelId, ...without] : [...without, channelId];
  } else {
    const targetIndex = without.indexOf(drop.target.channelId);
    if (targetIndex === -1) return undefined;
    const insertAt = drop.target.half === 'before' ? targetIndex : targetIndex + 1;
    order = [...without.slice(0, insertAt), channelId, ...without.slice(insertAt)];
  }
  if (sameScope && sameIds(drop.targetOrder, order)) return undefined;
  if (drop.targetScopeId === undefined) {
    return { kind: 'ungrouped', setManualOverride: false };
  }
  return {
    kind: 'section',
    sectionId: drop.targetScopeId,
    order,
    setManualOverride: !drop.targetManualOverride,
  };
}

export interface ChannelMoveSink {
  assignToUngrouped: (channelId: string) => void;
  moveToSection: (channelId: string, sectionId: string, order: readonly string[]) => void;
  setSectionManual: (sectionId: string) => void;
}

export function applyChannelMove(
  sink: ChannelMoveSink,
  channelId: string,
  plan: ChannelMovePlan,
): void {
  if (plan.kind === 'ungrouped') {
    sink.assignToUngrouped(channelId);
    return;
  }
  if (plan.setManualOverride) sink.setSectionManual(plan.sectionId);
  sink.moveToSection(channelId, plan.sectionId, plan.order);
}

export function completeFlatEntries(
  topOrder: readonly TopOrderEntry[] | undefined,
  sectionIds: readonly string[],
  groupChannelIds: readonly string[],
  sectionedIds: ReadonlySet<string>,
): TopOrderEntry[] {
  const knownSections = new Set(sectionIds);
  const entries: TopOrderEntry[] = [];
  const placed = new Set<string>();
  if (topOrder !== undefined) {
    for (const entry of topOrder) {
      if (entry.kind === 'section') {
        if (!knownSections.has(entry.id) || placed.has(`section:${entry.id}`)) continue;
        placed.add(`section:${entry.id}`);
        entries.push({ kind: 'section', id: entry.id });
      } else {
        if (sectionedIds.has(entry.id) || placed.has(`channel:${entry.id}`)) continue;
        placed.add(`channel:${entry.id}`);
        entries.push({ kind: 'channel', id: entry.id });
      }
    }
  } else {
    for (const id of sectionIds) {
      placed.add(`section:${id}`);
      entries.push({ kind: 'section', id });
    }
  }
  for (const id of groupChannelIds) {
    if (sectionedIds.has(id) || placed.has(`channel:${id}`)) continue;
    placed.add(`channel:${id}`);
    entries.push({ kind: 'channel', id });
  }
  return entries;
}

export function orderFlatEntries(
  entries: readonly TopOrderEntry[],
  channels: ReadonlyMap<string, ChannelSummary>,
  mode: BotModeSortMode,
): TopOrderEntry[] {
  if (mode === 'manual') return [...entries];
  const ordered: TopOrderEntry[] = [];
  let run: ChannelSummary[] = [];
  const flush = (): void => {
    for (const channel of [...run].sort(byRecency))
      ordered.push({ kind: 'channel', id: channel.id });
    run = [];
  };
  for (const entry of entries) {
    const channel = entry.kind === 'channel' ? channels.get(entry.id) : undefined;
    if (channel !== undefined) {
      run.push(channel);
      continue;
    }
    flush();
    ordered.push(entry);
  }
  flush();
  return ordered;
}

function flatEntryKey(entry: TopOrderEntry): string {
  return `${entry.kind}:${entry.id}`;
}

function sameFlatEntries(left: readonly TopOrderEntry[], right: readonly TopOrderEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) => flatEntryKey(entry) === flatEntryKey(right[index] as TopOrderEntry),
    )
  );
}

export interface BlockRowGeometry {
  id: string;
  top: number;
  height: number;
}

export type BlockDropResolution =
  | { kind: 'scope' }
  | { kind: 'row'; channelId: string; half: 'before' | 'after' };

export function resolveBlockDropTarget(
  rows: readonly BlockRowGeometry[],
  headerBottom: number,
  clientY: number,
): BlockDropResolution {
  if (rows.length === 0) return { kind: 'scope' };
  if (clientY <= headerBottom) {
    const first = rows[0] as BlockRowGeometry;
    return { kind: 'row', channelId: first.id, half: 'before' };
  }
  for (const row of rows) {
    if (clientY < row.top + row.height / 2) {
      return { kind: 'row', channelId: row.id, half: 'before' };
    }
  }
  const last = rows[rows.length - 1] as BlockRowGeometry;
  return { kind: 'row', channelId: last.id, half: 'after' };
}

export interface FlatAnchor {
  kind: 'section' | 'channel';
  id: string;
  side: 'before' | 'after';
}

export interface FlatInsertPlan {
  order: TopOrderEntry[];
  unassign: boolean;
}

export function resolvePinnedChannelIds(
  channels: readonly ChannelSummary[],
  pins: readonly string[],
): string[] {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const dmByBotSlug = new Map(
    channels.flatMap((channel) =>
      channel.type === 'dm' && channel.botSlug !== undefined ? [[channel.botSlug, channel]] : [],
    ),
  );
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const pin of pins) {
    const channel = byId.get(pin) ?? dmByBotSlug.get(pin);
    if (channel === undefined || seen.has(channel.id)) continue;
    if (channel.type === 'dm' && channel.botSlug === undefined) continue;
    seen.add(channel.id);
    resolved.push(channel.id);
  }
  return resolved;
}

export function flatRosterChannelIds(
  channels: readonly ChannelSummary[],
  pinnedChannelIds: ReadonlySet<string>,
): string[] {
  return channels.flatMap((channel) => {
    if (pinnedChannelIds.has(channel.id)) return [];
    if (channel.type === 'group') return [channel.id];
    if (channel.botSlug === undefined) return [];
    return [channel.id];
  });
}

export function planFlatInsert(
  flat: readonly TopOrderEntry[],
  channelId: string,
  fromSection: boolean,
  anchor: FlatAnchor,
): FlatInsertPlan | undefined {
  if (fromSection) {
    const without = flat.filter((entry) => entry.kind !== 'channel' || entry.id !== channelId);
    const anchorIndex = without.map(flatEntryKey).indexOf(`${anchor.kind}:${anchor.id}`);
    if (anchorIndex === -1) return undefined;
    const at = anchor.side === 'before' ? anchorIndex : anchorIndex + 1;
    return {
      order: [
        ...without.slice(0, at).map((entry) => ({ ...entry })),
        { kind: 'channel' as const, id: channelId },
        ...without.slice(at).map((entry) => ({ ...entry })),
      ],
      unassign: true,
    };
  }
  const keys = flat.map(flatEntryKey);
  const anchorIndex = keys.indexOf(`${anchor.kind}:${anchor.id}`);
  if (anchorIndex === -1) return undefined;
  const selfIndex = keys.indexOf(`channel:${channelId}`);
  if (selfIndex === -1) return undefined;
  const without = flat.filter((_, index) => index !== selfIndex);
  const at =
    anchor.side === 'before'
      ? anchorIndex - (selfIndex < anchorIndex ? 1 : 0)
      : anchorIndex + (selfIndex > anchorIndex ? 1 : 0);
  const next = [
    ...without.slice(0, at).map((entry) => ({ ...entry })),
    { kind: 'channel' as const, id: channelId },
    ...without.slice(at).map((entry) => ({ ...entry })),
  ];
  return sameFlatEntries(flat, next) ? undefined : { order: next, unassign: false };
}
