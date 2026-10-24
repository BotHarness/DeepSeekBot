import type { RemoteSource, RosterBot } from './client';

export interface ChannelCandidate extends Pick<
  RosterBot,
  'slug' | 'displayName' | 'appearance' | 'avatarSeed'
> {
  avatarSource?: RemoteSource;
}
export type ChannelCreationRecord = {
  hostId: string;
  name: string;
  members: string[];
} & ({ kind: 'draft' } | { kind: 'submitted'; deviceId: string; operationKey: string });
export type ChannelCreationOperation = Extract<ChannelCreationRecord, { kind: 'submitted' }>;
export interface ChannelCreationSnapshot {
  record: ChannelCreationRecord;
  candidates: ChannelCandidate[];
  loading: boolean;
  busy: boolean;
  loaded: boolean;
  selectionReset: boolean;
  error?: string | undefined;
  result?: string | undefined;
}
export interface ChannelCreationPort {
  deviceId(hostId: string): string | undefined;
  candidates(hostId: string): Promise<ChannelCandidate[]>;
  create(operation: Omit<ChannelCreationOperation, 'kind'>): Promise<string>;
}

export class ChannelCreationNotAccepted extends Error {}

function savedRecord(value: unknown): ChannelCreationRecord | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('hostId' in value) ||
    typeof value.hostId !== 'string' ||
    !('name' in value) ||
    typeof value.name !== 'string' ||
    !('members' in value) ||
    !Array.isArray(value.members) ||
    !value.members.every((member): member is string => typeof member === 'string')
  )
    return;
  const input = { hostId: value.hostId, name: value.name, members: value.members };
  if ('kind' in value && value.kind === 'draft') return { ...input, kind: 'draft' };
  if (
    'kind' in value &&
    value.kind === 'submitted' &&
    'deviceId' in value &&
    typeof value.deviceId === 'string' &&
    'operationKey' in value &&
    typeof value.operationKey === 'string'
  )
    return {
      ...input,
      kind: 'submitted',
      deviceId: value.deviceId,
      operationKey: value.operationKey,
    };
}

export function createChannelCreation(options: {
  key(): string;
  storage: { read(): Promise<unknown>; write(record: ChannelCreationRecord): Promise<void> };
  port: ChannelCreationPort;
}) {
  let state: ChannelCreationSnapshot = {
    record: { kind: 'draft', hostId: '', name: '', members: [] },
    candidates: [],
    loading: false,
    busy: false,
    loaded: false,
    selectionReset: false,
  };
  let generation = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ChannelCreationSnapshot>) => {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  };
  const ready = options.storage
    .read()
    .then((value) => {
      const record = savedRecord(value);
      if (value !== undefined && !record) throw new Error('storage-invalid');
      publish({ ...(record ? { record } : {}), loaded: true });
    })
    .catch(() => publish({ error: 'storage-invalid' }));
  const load = async () => {
    const version = ++generation;
    const hostId = state.record.hostId;
    if (!hostId || state.record.kind !== 'draft') return;
    publish({ loading: true, error: undefined });
    try {
      const candidates = await options.port.candidates(hostId);
      if (version !== generation) return;
      publish({
        candidates,
        loading: false,
        record: {
          ...state.record,
          members: state.record.members.filter((id) => candidates.some((bot) => bot.slug === id)),
        },
      });
    } catch (error) {
      if (version === generation)
        publish({
          candidates: [],
          loading: false,
          error: error instanceof Error ? error.message : 'unreachable',
        });
    }
  };
  return {
    ready,
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async selectHost(hostId: string) {
      if (!state.loaded || state.record.kind !== 'draft' || state.busy) return;
      if (hostId !== state.record.hostId) {
        generation++;
        publish({
          record: { ...state.record, hostId, members: [] },
          candidates: [],
          loading: false,
          selectionReset: state.record.members.length > 0,
          error: undefined,
        });
      }
      await load();
    },
    refresh: load,
    rename(name: string) {
      if (state.loaded && state.record.kind === 'draft' && !state.busy)
        publish({ record: { ...state.record, name } });
    },
    toggle(slug: string) {
      if (
        !state.loaded ||
        state.record.kind !== 'draft' ||
        state.busy ||
        state.loading ||
        !state.candidates.some((bot) => bot.slug === slug)
      )
        return;
      const members = state.record.members.includes(slug)
        ? state.record.members.filter((id) => id !== slug)
        : [...state.record.members, slug];
      publish({ record: { ...state.record, members }, selectionReset: false });
    },
    async submit() {
      await ready;
      if (!state.loaded || state.busy || state.loading || state.result) return;
      let record = state.record;
      const fresh = record.kind === 'draft';
      if (record.kind === 'draft') {
        if (state.error) return;
        const deviceId = options.port.deviceId(record.hostId);
        if (!deviceId || !record.name.trim()) return;
        record = {
          ...record,
          name: record.name.trim(),
          kind: 'submitted',
          deviceId,
          operationKey: options.key(),
        };
      }
      const operation = record;
      generation++;
      publish({ busy: true, error: undefined });
      try {
        await options.storage.write(operation);
        publish({ record: operation });
        if (options.port.deviceId(operation.hostId) !== operation.deviceId)
          throw new Error('target-unpaired');
        const { kind: _kind, ...input } = operation;
        const result = await options.port.create(input);
        publish({ result });
      } catch (error) {
        if (fresh && error instanceof ChannelCreationNotAccepted) {
          const draft: ChannelCreationRecord = {
            kind: 'draft',
            hostId: operation.hostId,
            name: operation.name,
            members: operation.members,
          };
          try {
            await options.storage.write(draft);
            publish({ record: draft });
          } catch {
            publish({ error: 'storage-invalid' });
            return;
          }
        }
        publish({ error: error instanceof Error ? error.message : 'unreachable' });
      } finally {
        publish({ busy: false });
      }
    },
    async reset() {
      if (state.busy || (state.record.kind === 'submitted' && !state.result)) return false;
      const record: ChannelCreationRecord = { kind: 'draft', hostId: '', name: '', members: [] };
      try {
        await options.storage.write(record);
        generation++;
        publish({
          record,
          candidates: [],
          result: undefined,
          error: undefined,
          selectionReset: false,
        });
        return true;
      } catch {
        publish({ error: 'storage-invalid' });
        return false;
      }
    },
  };
}
