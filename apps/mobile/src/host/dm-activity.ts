import type { ConversationMessage } from './conversation';

export type DmActivityKind = 'posts' | 'memory';
export type DmActivitySettings = Record<string, Record<string, readonly DmActivityKind[]>>;

const NONE: readonly DmActivityKind[] = [];
const KINDS: readonly DmActivityKind[] = ['posts', 'memory'];

export function visibleDmActivity(
  messages: readonly ConversationMessage[],
  hidden: readonly DmActivityKind[],
): ConversationMessage[] {
  return messages.filter((message) => {
    const activity = message.activity;
    const kind =
      activity?.kind === 'channel-post'
        ? 'posts'
        : activity?.kind === 'memory' && activity.noticeOrigin !== undefined
          ? 'memory'
          : undefined;
    return kind === undefined || !hidden.includes(kind);
  });
}

export function createDmActivityPreferences(storage: {
  read(): Promise<unknown>;
  write(value: DmActivitySettings): void;
}) {
  const values = new Map<string, Map<string, readonly DmActivityKind[]>>();
  const touched = new Set<string>();
  const listeners = new Set<() => void>();
  let loaded = false;
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const put = (hostId: string, botSlug: string, kinds: readonly DmActivityKind[]) => {
    let bots = values.get(hostId);
    if (bots === undefined) {
      bots = new Map();
      values.set(hostId, bots);
    }
    bots.set(botSlug, kinds);
  };
  const persist = () =>
    storage.write(
      Object.fromEntries([...values].map(([hostId, bots]) => [hostId, Object.fromEntries(bots)])),
    );
  const read = storage.read().then(
    (value) => {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) return;
      for (const [hostId, bots] of Object.entries(value)) {
        if (typeof bots !== 'object' || bots === null || Array.isArray(bots)) continue;
        for (const [botSlug, kinds] of Object.entries(bots)) {
          if (!Array.isArray(kinds)) continue;
          put(
            hostId,
            botSlug,
            KINDS.filter((kind) =>
              touched.has(JSON.stringify([hostId, botSlug, kind]))
                ? values.get(hostId)?.get(botSlug)?.includes(kind)
                : kinds.includes(kind),
            ),
          );
        }
      }
    },
    () => undefined,
  );
  const ready = read.then(() => {
    loaded = true;
    if (touched.size > 0) persist();
    notify();
  });
  return {
    ready,
    hidden: (hostId: string, botSlug: string): readonly DmActivityKind[] =>
      values.get(hostId)?.get(botSlug) ?? NONE,
    setHidden(hostId: string, botSlug: string, kind: DmActivityKind, hidden: boolean) {
      const current = values.get(hostId)?.get(botSlug) ?? NONE;
      touched.add(JSON.stringify([hostId, botSlug, kind]));
      put(
        hostId,
        botSlug,
        KINDS.filter((entry) => (entry === kind ? hidden : current.includes(entry))),
      );
      if (loaded) persist();
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
