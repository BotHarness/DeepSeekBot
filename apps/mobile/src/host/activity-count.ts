import type { Inbox } from './inbox';
import type { HumanAttentionPage } from './wire';

export const ACTIVITY_COUNT_KINDS = [
  'approvals',
  'questions',
  'privateInput',
  'otherActions',
  'replies',
  'unread',
] as const;
export type ActivityCountKind = (typeof ACTIVITY_COUNT_KINDS)[number];
export const DEFAULT_ACTIVITY_COUNT: readonly ActivityCountKind[] = [
  'approvals',
  'questions',
  'privateInput',
  'otherActions',
];

export function createActivityCountPreferences(storage: {
  read(): Promise<unknown>;
  write(kinds: readonly ActivityCountKind[]): void;
}) {
  let snapshot = { kinds: DEFAULT_ACTIVITY_COUNT, loaded: false, storageError: false };
  let touched = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const persist = () => {
    try {
      storage.write(snapshot.kinds);
      snapshot = { ...snapshot, storageError: false };
    } catch {
      snapshot = { ...snapshot, storageError: true };
    }
  };
  const ready = storage
    .read()
    .then(
      (value) => {
        if (
          !touched &&
          Array.isArray(value) &&
          value.every((kind) => ACTIVITY_COUNT_KINDS.includes(kind))
        )
          snapshot = {
            ...snapshot,
            kinds: ACTIVITY_COUNT_KINDS.filter((kind) => value.includes(kind)),
          };
      },
      () => {
        snapshot = { ...snapshot, storageError: true };
      },
    )
    .then(() => {
      snapshot = { ...snapshot, loaded: true };
      if (touched) persist();
      notify();
    });
  return {
    ready,
    getSnapshot: () => snapshot,
    setKinds(kinds: readonly ActivityCountKind[]) {
      touched = true;
      snapshot = {
        ...snapshot,
        kinds: ACTIVITY_COUNT_KINDS.filter((kind) => kinds.includes(kind)),
      };
      if (snapshot.loaded) persist();
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

const actionKinds = {
  approvals: 'tool-approval',
  questions: 'user-question',
  privateInput: 'private-input',
} as const;

type ActivityCountClient = {
  call(method: string, args: Record<string, unknown>): Promise<HumanAttentionPage>;
};

export async function readActivityCount(
  client: ActivityCountClient,
  kinds: readonly ActivityCountKind[],
): Promise<number> {
  const ids = new Set<string>();
  for (const category of ['action', 'replies', 'unread'] as const) {
    const actions = kinds.filter((kind) => kind !== 'replies' && kind !== 'unread');
    if (category === 'action' ? actions.length === 0 : !kinds.includes(category)) continue;
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await client.call('humanAttention', {
        category,
        limit: 100,
        queryVersion: 1,
        ...(category === 'replies' ? { unreadOnly: true } : {}),
        ...(cursor ? { cursor } : {}),
      });
      if (page.queryVersion !== 1) throw new Error('ACTIVITY_COUNT_HOST_VERSION');
      for (const item of page.items) {
        if (
          category === 'action' &&
          !actions.some((kind) =>
            kind === 'otherActions'
              ? !Object.values(actionKinds).some((value) => value === item.kind)
              : actionKinds[kind] === item.kind,
          )
        )
          continue;
        if (category === 'replies' && item.isUnread === false) continue;
        ids.add(item.id);
        if (ids.size >= 100) return 100;
      }
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) throw new Error('ACTIVITY_COUNT_CURSOR_LOOP');
      if (cursor) cursors.add(cursor);
    } while (cursor);
  }
  return ids.size;
}

export function observeActivityCount(
  client: ActivityCountClient,
  inbox: Pick<Inbox, 'subscribe' | 'getSnapshot'>,
  preferences: ReturnType<typeof createActivityCountPreferences>,
) {
  type Snapshot = { count: number | undefined; stale: boolean };
  const cache = new Map<string, Snapshot>();
  let snapshot: Snapshot = { count: undefined, stale: false };
  const listeners = new Set<() => void>();
  let off: (() => void) | undefined;
  let reading = false;
  let again = false;
  let key = '';
  let generation = 0;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const refresh = async () => {
    if (listeners.size === 0 || !preferences.getSnapshot().loaded) return;
    const kinds = preferences.getSnapshot().kinds;
    const next = kinds.join(',');
    if (next !== key) {
      key = next;
      snapshot = cache.get(key) ?? { count: undefined, stale: false };
      notify();
    }
    if (reading) {
      again = true;
      return;
    }
    if (kinds.length === 0) {
      snapshot = { count: 0, stale: false };
      notify();
      return;
    }
    if (inbox.getSnapshot().status !== 'ready') return;
    reading = true;
    const at = generation;
    try {
      const count = await readActivityCount(client, kinds);
      if (at === generation && next === key) {
        snapshot = { count, stale: false };
        cache.set(key, snapshot);
      }
    } catch {
      if (at === generation && next === key) snapshot = { ...snapshot, stale: true };
    } finally {
      reading = false;
      if (at === generation) notify();
      if (again) {
        again = false;
        void refresh();
      }
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        const stopInbox = inbox.subscribe(() => {
          void refresh();
        });
        const stopPreferences = preferences.subscribe(() => {
          void refresh();
        });
        off = () => {
          stopInbox();
          stopPreferences();
        };
        void refresh();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          off?.();
          off = undefined;
          generation += 1;
        }
      };
    },
  };
}
