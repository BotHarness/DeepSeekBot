import type { CachedConversation } from './conversation';

export type ComputerCacheSource = { hostId: string; deviceId: string };
export type SearchSource = ComputerCacheSource & { name: string };
export type RetainedTarget = { kind: 'dm' | 'channel'; id: string; name: string };
export type RetainedConversation = CachedConversation & { target: RetainedTarget };
export type SearchHit = {
  key: string;
  source: SearchSource;
  target: RetainedTarget;
  message?: { id: string; body: string; at: string; author: string };
};
export type RetainedSearchSnapshot = {
  scope: string;
  query: string;
  scroll: number;
  status: 'idle' | 'loading' | 'ready';
  conversations: SearchHit[];
  messages: SearchHit[];
  unavailable: string[];
};

export const computerCacheKey = (source: ComputerCacheSource) =>
  JSON.stringify([source.hostId, source.deviceId]);

function excerpt(body: string, query: string): string {
  const index = body.toLocaleLowerCase().indexOf(query);
  const start = Math.max(0, index - 50);
  const end = Math.min(body.length, Math.max(index + query.length, start + 180));
  return `${start > 0 ? '…' : ''}${body.slice(start, end)}${end < body.length ? '…' : ''}`;
}

export function createRetainedSearch(port: {
  sources(): SearchSource[];
  list(source: ComputerCacheSource): Promise<RetainedConversation[]>;
  read(
    source: ComputerCacheSource,
    target: RetainedTarget,
  ): Promise<RetainedConversation | undefined>;
}) {
  let version = 0;
  let active = true;
  let snapshot: RetainedSearchSnapshot = {
    scope: 'all',
    query: '',
    scroll: 0,
    status: 'idle',
    conversations: [],
    messages: [],
    unavailable: [],
  };
  const listeners = new Set<() => void>();
  const publish = (next: Partial<RetainedSearchSnapshot>) => {
    snapshot = { ...snapshot, ...next };
    for (const listener of listeners) listener();
  };
  const sources = () =>
    port
      .sources()
      .filter(
        (source) =>
          snapshot.scope === 'all' ||
          snapshot.scope === JSON.stringify(['computer', source.hostId]),
      );
  const search = async (reset = false) => {
    const current = ++version;
    const query = snapshot.query.trim().toLocaleLowerCase();
    const allowedNow = new Set(sources().map(computerCacheKey));
    const keep = (hits: SearchHit[]) =>
      reset ? [] : hits.filter((hit) => allowedNow.has(computerCacheKey(hit.source)));
    const keptConversations = keep(snapshot.conversations);
    const keptMessages = keep(snapshot.messages);
    publish({
      conversations: keptConversations,
      messages: keptMessages,
      unavailable: [],
      status: !query
        ? 'idle'
        : !active || keptConversations.length + keptMessages.length > 0
          ? 'ready'
          : 'loading',
    });
    if (!query || !active) return;
    const conversations: SearchHit[] = [];
    const messages: SearchHit[] = [];
    const unavailable: string[] = [];
    await Promise.all(
      sources().map(async (source) => {
        try {
          for (const record of await port.list(source)) {
            const key = JSON.stringify([
              computerCacheKey(source),
              record.target.kind,
              record.target.id,
            ]);
            if (record.target.name.toLocaleLowerCase().includes(query))
              conversations.push({ key, source, target: record.target });
            for (const { message } of record.entries) {
              if (!message.body?.toLocaleLowerCase().includes(query) || message.onboardingWelcome)
                continue;
              if (
                message.toolApprovalDecision ||
                (typeof message.userQuestionResolution === 'object' &&
                  message.userQuestionResolution !== null &&
                  'state' in message.userQuestionResolution &&
                  message.userQuestionResolution.state === 'cancelled')
              )
                continue;
              messages.push({
                key: JSON.stringify([key, message.id]),
                source,
                target: record.target,
                message: {
                  id: message.id,
                  body: excerpt(message.body, query),
                  at: message.at,
                  author:
                    message.author.kind === 'bot'
                      ? message.author.slug
                      : message.author.kind === 'bridged'
                        ? message.author.source
                        : message.author.kind,
                },
              });
            }
          }
        } catch {
          unavailable.push(source.name);
          const belongs = (hit: SearchHit) =>
            computerCacheKey(hit.source) === computerCacheKey(source);
          conversations.push(...keptConversations.filter(belongs));
          messages.push(...keptMessages.filter(belongs));
        }
      }),
    );
    if (current !== version) return;
    const allowed = new Set(sources().map(computerCacheKey));
    publish({
      status: 'ready',
      unavailable,
      conversations: conversations
        .filter((hit) => allowed.has(computerCacheKey(hit.source)))
        .sort((a, b) => a.target.name.localeCompare(b.target.name)),
      messages: messages
        .filter((hit) => allowed.has(computerCacheKey(hit.source)))
        .sort((a, b) => b.message!.at.localeCompare(a.message!.at) || a.key.localeCompare(b.key)),
    });
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    enter(scope: string) {
      snapshot = { ...snapshot, scope, query: '', scroll: 0 };
      void search(true);
    },
    query(query: string) {
      snapshot = { ...snapshot, query, scroll: 0 };
      return search(true);
    },
    scroll(offset: number) {
      snapshot = { ...snapshot, scroll: offset };
    },
    refresh: () => search(),
    setActive(value: boolean) {
      active = value;
      if (value) void search();
      else version++;
    },
    remove(source: ComputerCacheSource, target: RetainedTarget) {
      const keep = (hit: SearchHit) =>
        computerCacheKey(hit.source) !== computerCacheKey(source) ||
        hit.target.kind !== target.kind ||
        hit.target.id !== target.id;
      publish({
        conversations: snapshot.conversations.filter(keep),
        messages: snapshot.messages.filter(keep),
      });
      void search();
    },
    async resolve(hit: SearchHit): Promise<'available' | 'missing' | 'detached'> {
      const current = version;
      const allowed = () =>
        sources().some((source) => computerCacheKey(source) === computerCacheKey(hit.source));
      if (!allowed()) return 'detached';
      const record = await port.read(hit.source, hit.target).catch(() => undefined);
      if (current !== version || !allowed()) return 'detached';
      return record &&
        (!hit.message || record.entries.some(({ message }) => message.id === hit.message!.id))
        ? 'available'
        : 'missing';
    },
  };
}
