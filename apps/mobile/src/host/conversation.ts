import type { HostClient } from './client';
import type {
  ChannelLiveFrame,
  ChannelNotification,
  ChannelWireMessage,
  JournalEntry,
  JournalPage,
  WireDraft,
} from './wire';

export type DeliveryState = 'pending' | 'committed' | 'failed';

export interface ConversationMessage {
  id: string;
  revision?: number;
  at: string;
  author: 'human' | 'bot' | 'system';
  body: string;
  attachments: number;
  card: boolean;
  delivery: DeliveryState;
  error?: string;
}

export interface ConversationDraft {
  draftId: string;
  botSlug: string;
  body: string;
}

export type ConversationStatus = 'opening' | 'live' | 'interrupted' | 'refused';

export interface ConversationSnapshot {
  status: ConversationStatus;
  reason?: string;
  messages: ConversationMessage[];
  drafts: ConversationDraft[];
  hasOlder: boolean;
  loadingOlder: boolean;
  fromCache: boolean;
}

export interface CachedConversation {
  entries: JournalEntry[];
  hasOlder: boolean;
}

export interface ConversationCache {
  read(botSlug: string): Promise<CachedConversation | undefined>;
  write(botSlug: string, value: CachedConversation): void;
}

export interface Conversation {
  getSnapshot(): ConversationSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  loadOlder(): Promise<void>;
  send(body: string): string;
  retry(messageId: string): void;
}

export interface ConversationOptions {
  host: Pick<HostClient, 'call' | 'follow'>;
  botSlug: string;
  displayName?: string;
  channelId?: string;
  cache?: ConversationCache;
  pageSize?: number;
  olderPageSize?: number;
  cachedEntries?: number;
  messageId?: () => string;
}

const MAX_PAGE = 200;

interface Outgoing {
  id: string;
  at: string;
  body: string;
  delivery: DeliveryState;
  error?: string;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function hasCard(message: ChannelWireMessage): boolean {
  return (
    message.toolApprovalRequest !== undefined ||
    message.userQuestionRequest !== undefined ||
    message.privateInputRequest !== undefined ||
    message.grantRequest === true
  );
}

function present(entry: JournalEntry): ConversationMessage {
  const message = entry.message;
  const kind = message.author.kind;
  return {
    id: message.id,
    revision: entry.revision,
    at: message.at,
    author: kind === 'human' ? 'human' : kind === 'bot' ? 'bot' : 'system',
    body: message.body,
    attachments: (message.attachments?.length ?? 0) + (message.bridgeMedia?.items.length ?? 0),
    card: hasCard(message),
    delivery: 'committed',
  };
}

export function createConversation(options: ConversationOptions): Conversation {
  const pageSize = options.pageSize ?? 50;
  const olderPageSize = options.olderPageSize ?? 30;
  const cachedEntries = options.cachedEntries ?? 50;
  const newMessageId = options.messageId ?? (() => `human-${uuid()}`);
  const listeners = new Set<() => void>();
  let channelId = options.channelId;
  let window: JournalEntry[] = [];
  let hasOlder = false;
  let loadingOlder = false;
  let fromCache = false;
  let status: ConversationStatus = 'opening';
  let reason: string | undefined;
  const drafts = new Map<string, ConversationDraft>();
  const outgoing = new Map<string, Outgoing>();
  let running = false;
  let session = 0;
  let unfollow: (() => void) | undefined;
  let frames: Promise<void> = Promise.resolve();
  let snapshot: ConversationSnapshot = build();
  let cacheTimer: ReturnType<typeof setTimeout> | undefined;

  function build(): ConversationSnapshot {
    const committed = new Set(window.map((entry) => entry.message.id));
    const pending: ConversationMessage[] = [];
    for (const item of outgoing.values()) {
      if (committed.has(item.id)) continue;
      pending.push({
        id: item.id,
        at: item.at,
        author: 'human',
        body: item.body,
        attachments: 0,
        card: false,
        delivery: item.delivery,
        ...(item.error === undefined ? {} : { error: item.error }),
      });
    }
    return {
      status,
      ...(reason === undefined ? {} : { reason }),
      messages: [...window.map(present), ...pending],
      drafts: [...drafts.values()],
      hasOlder,
      loadingOlder,
      fromCache,
    };
  }

  const publish = (): void => {
    snapshot = build();
    for (const listener of listeners) listener();
  };

  const first = (): number => window[0]?.revision ?? 0;
  const last = (): number => window.at(-1)?.revision ?? 0;

  const settleOutgoing = (): void => {
    for (const entry of window) outgoing.delete(entry.message.id);
  };

  const persist = (): void => {
    const cache = options.cache;
    if (cache === undefined || fromCache) return;
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      const tail = window.slice(-cachedEntries);
      cache.write(options.botSlug, {
        entries: tail,
        hasOlder: hasOlder || tail.length < window.length,
      });
    }, 300);
  };

  const merge = (entries: readonly JournalEntry[]): void => {
    if (entries.length === 0) return;
    const byRevision = new Map(window.map((entry) => [entry.revision, entry]));
    for (const entry of entries) byRevision.set(entry.revision, entry);
    const sorted = [...byRevision.values()].sort((a, b) => a.revision - b.revision);
    let start = sorted.length - 1;
    while (start > 0 && sorted[start - 1]!.revision === sorted[start]!.revision - 1) start -= 1;
    if (start > 0) hasOlder = true;
    window = sorted.slice(start);
  };

  const readPage = (through: number, before?: number, limit?: number): Promise<JournalPage> =>
    options.host.call<JournalPage>('channelJournalPage', {
      channelId,
      through,
      ...(before === undefined ? {} : { before }),
      ...(limit === undefined ? {} : { limit }),
    });

  const advance = async (through: number, page: JournalPage | undefined): Promise<void> => {
    const tail = page?.entries ?? [];
    const tailFirst = tail[0]?.revision ?? through + 1;
    if (window.length === 0 || through < last()) {
      window = [...tail];
      hasOlder = page?.hasOlder ?? false;
      return;
    }
    const missing = tailFirst - 1 - last();
    if (missing > 0) {
      if (missing > MAX_PAGE) {
        window = [...tail];
        hasOlder = page?.hasOlder ?? true;
        return;
      }
      const repair = await readPage(tailFirst - 1, undefined, missing);
      merge(repair.entries);
    }
    merge(tail);
  };

  const applyNotification = (notification: ChannelNotification): void => {
    if (notification.kind === 'draft-baseline') {
      drafts.clear();
      for (const draft of notification.drafts) upsertDraft(draft);
    } else if (notification.kind === 'draft') upsertDraft(notification.draft);
    else if (notification.kind === 'draft-settled' || notification.kind === 'draft-abandoned')
      drafts.delete(notification.event.draftId);
  };

  const upsertDraft = (draft: WireDraft): void => {
    if (draft.channelId !== channelId) return;
    drafts.set(draft.draftId, { draftId: draft.draftId, botSlug: draft.botSlug, body: draft.body });
  };

  const applyFrame = async (frame: ChannelLiveFrame, current: number): Promise<void> => {
    if (current !== session) return;
    if (frame.type === 'opened') {
      await advance(frame.cursor, frame.page);
      if (current !== session) return;
      fromCache = false;
      status = 'live';
      reason = undefined;
    } else if (frame.type === 'entry') {
      const entry = frame.entry;
      if (entry.revision <= last()) {
        if (entry.revision >= first()) merge([entry]);
      } else if (entry.revision === last() + 1) merge([entry]);
      else {
        const repair = await readPage(entry.revision, undefined, Math.min(MAX_PAGE, pageSize));
        if (current !== session) return;
        await advance(entry.revision, repair);
      }
      if (entry.message.author.kind === 'bot')
        for (const [draftId, draft] of drafts)
          if (draft.botSlug === entry.message.author.slug) drafts.delete(draftId);
    } else applyNotification(frame.notification);
    settleOutgoing();
    publish();
    persist();
  };

  const enqueue = (frame: ChannelLiveFrame, current: number): void => {
    frames = frames
      .then(() => applyFrame(frame, current))
      .catch((error: unknown) => {
        if (current !== session) return;
        status = 'interrupted';
        reason = error instanceof Error ? error.message : 'The Channel could not be repaired.';
        publish();
        reopen(current);
      });
  };

  const ensureChannel = async (): Promise<string> => {
    if (channelId !== undefined) return channelId;
    const result = await options.host.call<{ channel: { id: string } }>('channelDm', {
      slug: options.botSlug,
      ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
    });
    channelId = result.channel.id;
    return channelId;
  };

  const reopen = (current: number): void => {
    unfollow?.();
    unfollow = undefined;
    setTimeout(() => {
      if (running && current === session) void open(current);
    }, 1_000);
  };

  const open = async (current: number): Promise<void> => {
    let id: string;
    try {
      id = await ensureChannel();
    } catch (error) {
      if (current !== session) return;
      status = 'interrupted';
      reason = error instanceof Error ? error.message : 'The DM could not be opened.';
      publish();
      reopen(current);
      return;
    }
    if (current !== session) return;
    unfollow = options.host.follow(
      'botharness/followChannel',
      { channelId: id, limit: pageSize },
      {
        item: (value) => enqueue(value as ChannelLiveFrame, current),
        interrupted: (why) => {
          if (current !== session) return;
          frames = frames.then(() => {
            if (current !== session) return;
            status = 'interrupted';
            reason = why;
            drafts.clear();
            publish();
          });
        },
        refused: (error) => {
          if (current !== session) return;
          status = 'refused';
          reason = error.message;
          publish();
        },
      },
    );
  };

  const deliver = async (item: Outgoing): Promise<void> => {
    try {
      const id = await ensureChannel();
      await options.host.call('channelSend', {
        channelId: id,
        body: item.body,
        messageId: item.id,
      });
      if (outgoing.get(item.id) !== item) return;
      item.delivery = 'committed';
      delete item.error;
    } catch (error) {
      if (outgoing.get(item.id) !== item) return;
      item.delivery = 'failed';
      item.error = error instanceof Error ? error.message : 'The message was not sent.';
    }
    publish();
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (running) return;
      running = true;
      session += 1;
      const current = session;
      status = 'opening';
      publish();
      const cached =
        options.cache?.read(options.botSlug).catch(() => undefined) ?? Promise.resolve(undefined);
      void cached.then((value) => {
        if (current !== session) return;
        if (value !== undefined && window.length === 0 && value.entries.length > 0) {
          window = [];
          merge(value.entries);
          hasOlder = value.hasOlder || hasOlder;
          fromCache = true;
          publish();
        }
        return open(current);
      });
    },
    stop() {
      running = false;
      session += 1;
      unfollow?.();
      unfollow = undefined;
      clearTimeout(cacheTimer);
    },
    async loadOlder() {
      if (loadingOlder || !hasOlder || window.length === 0 || fromCache) return;
      if (status !== 'live') return;
      const current = session;
      const before = first();
      loadingOlder = true;
      publish();
      try {
        const page = await readPage(last(), before, olderPageSize);
        if (current !== session || first() !== before) return;
        const entries = page.entries.filter((entry) => entry.revision < before);
        if (entries.length > 0 && entries.at(-1)!.revision === before - 1) {
          window = [...entries, ...window];
          hasOlder = page.hasOlder;
        } else if (entries.length === 0) hasOlder = false;
        persist();
      } catch {
      } finally {
        loadingOlder = false;
        publish();
      }
    },
    send(body) {
      const item: Outgoing = {
        id: newMessageId(),
        at: new Date().toISOString(),
        body,
        delivery: 'pending',
      };
      outgoing.set(item.id, item);
      publish();
      void deliver(item);
      return item.id;
    },
    retry(messageId) {
      const item = outgoing.get(messageId);
      if (item === undefined || item.delivery !== 'failed') return;
      item.delivery = 'pending';
      delete item.error;
      publish();
      void deliver(item);
    },
  };
}
