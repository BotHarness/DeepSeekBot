import type { HostClient, RemoteSource } from './client';
import type {
  AttachmentRef,
  ChannelLiveFrame,
  ChannelNotification,
  ChannelWireMessage,
  JournalEntry,
  JournalPage,
  ToolApprovalOutcome,
  WireDraft,
} from './wire';

export type DeliveryState = 'pending' | 'committed' | 'failed';

export type CardKind = 'tool-approval' | 'user-question' | 'private-input' | 'grant';

export interface MessageCard {
  kind: CardKind;
  channelId: string;
  subject?: string;
}

export type CardResolution =
  | { kind: 'tool-approval'; outcome: ToolApprovalOutcome }
  | { kind: 'user-question'; state: 'answered' | 'cancelled' };

export interface MessageAttachment {
  key: string;
  kind: 'image' | 'file' | 'audio';
  name: string;
  mime?: string;
  size?: number;
  source?: RemoteSource;
  local: boolean;
}

export interface ConversationMessage {
  id: string;
  revision?: number;
  at: string;
  author: 'human' | 'bot' | 'system';
  body: string;
  attachments: MessageAttachment[];
  card?: MessageCard;
  resolves?: { requestId: string; resolution: CardResolution };
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
  send(body: string, files?: OutgoingFile[]): string;
  retry(messageId: string): void;
}

export interface ConversationOptions {
  host: Pick<HostClient, 'call' | 'follow' | 'upload' | 'resource'>;
  botSlug: string;
  displayName?: string;
  channelId?: string;
  cache?: ConversationCache;
  pageSize?: number;
  olderPageSize?: number;
  cachedEntries?: number;
  messageId?: () => string;
  draftDelayMs?: number;
}

const MAX_PAGE = 200;

export interface OutgoingFile {
  name: string;
  kind?: 'image' | 'file';
  uri?: string;
  read(): Promise<Blob>;
}

const PREVIEWABLE = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export const ATTACHMENT_PATH = '/api/botharness/attachment';

interface Outgoing {
  id: string;
  at: string;
  body: string;
  files: OutgoingFile[];
  refs: Array<AttachmentRef | undefined>;
  delivery: DeliveryState;
  error?: string;
}

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/gu, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

function cardOf(channelId: string, message: ChannelWireMessage): MessageCard | undefined {
  if (message.toolApprovalRequest !== undefined) {
    const subject = text(field(message.toolApprovalRequest, 'toolName'));
    return { kind: 'tool-approval', channelId, ...(subject === undefined ? {} : { subject }) };
  }
  if (message.userQuestionRequest !== undefined) {
    const questions = field(message.userQuestionRequest, 'questions');
    const subject = Array.isArray(questions) ? text(field(questions[0], 'question')) : undefined;
    return { kind: 'user-question', channelId, ...(subject === undefined ? {} : { subject }) };
  }
  if (message.privateInputRequest !== undefined) return { kind: 'private-input', channelId };
  if (message.grantRequest === true) return { kind: 'grant', channelId };
  return undefined;
}

const OUTCOMES = new Set<string>([
  'allowed-once',
  'allowed-always-exact',
  'allowed-always-all',
  'rejected',
]);

function resolvesOf(message: ChannelWireMessage): ConversationMessage['resolves'] {
  const decision = message.toolApprovalDecision;
  const decided = text(field(decision, 'requestMessageId'));
  const outcome = field(decision, 'outcome');
  if (decided !== undefined && typeof outcome === 'string' && OUTCOMES.has(outcome))
    return {
      requestId: decided,
      resolution: { kind: 'tool-approval', outcome: outcome as ToolApprovalOutcome },
    };
  const resolution = message.userQuestionResolution;
  const answered = text(field(resolution, 'requestMessageId'));
  const state = field(resolution, 'state');
  if (answered !== undefined && (state === 'answered' || state === 'cancelled'))
    return { requestId: answered, resolution: { kind: 'user-question', state } };
  return undefined;
}

function attachmentPath(params: Record<string, string>): string {
  return `${ATTACHMENT_PATH}?${new URLSearchParams(params)}`;
}

function attachmentsOf(
  entry: JournalEntry,
  resolve: (path: string) => RemoteSource,
  picked: readonly (OutgoingFile | undefined)[],
): MessageAttachment[] {
  const message = entry.message;
  const owner = { channelId: entry.channelId, messageId: message.id };
  const stored = (message.attachments ?? []).map((ref, index): MessageAttachment => {
    const file = picked[index];
    return {
      key: `${message.id}:${index}`,
      kind: PREVIEWABLE.has(ref.mime) ? 'image' : 'file',
      name: ref.name,
      mime: ref.mime,
      size: ref.size,
      ...(file?.uri === undefined
        ? {
            source: resolve(
              attachmentPath(
                ref.fileId === undefined
                  ? { hash: ref.hash ?? '', name: ref.name, ...owner }
                  : { ...owner, fileId: ref.fileId },
              ),
            ),
          }
        : { source: { uri: file.uri, headers: {} } }),
      local: file?.uri !== undefined,
    };
  });
  const sourceEventId = message.bridgeOrigin?.sourceEventId;
  const bridged = (message.bridgeMedia?.items ?? []).map((item): MessageAttachment => ({
    key: `${message.id}:bridge:${item.id}`,
    kind: item.kind,
    name: item.name,
    ...(item.sizeBytes === undefined ? {} : { size: item.sizeBytes }),
    ...(sourceEventId === undefined
      ? {}
      : {
          source: resolve(
            attachmentPath({
              channelId: entry.channelId,
              sourceEventId,
              attachmentId: item.id,
            }),
          ),
        }),
    local: false,
  }));
  return [...stored, ...bridged];
}

function present(
  entry: JournalEntry,
  resolve: (path: string) => RemoteSource,
  picked: readonly (OutgoingFile | undefined)[],
): ConversationMessage {
  const message = entry.message;
  const kind = message.author.kind;
  const card = cardOf(entry.channelId, message);
  const resolves = resolvesOf(message);
  return {
    id: message.id,
    revision: entry.revision,
    at: message.at,
    author: kind === 'human' ? 'human' : kind === 'bot' ? 'bot' : 'system',
    body: message.body,
    attachments: attachmentsOf(entry, resolve, picked),
    ...(card === undefined ? {} : { card }),
    ...(resolves === undefined ? {} : { resolves }),
    delivery: 'committed',
  };
}

export function createConversation(options: ConversationOptions): Conversation {
  const pageSize = options.pageSize ?? 50;
  const olderPageSize = options.olderPageSize ?? 30;
  const cachedEntries = options.cachedEntries ?? 50;
  const newMessageId = options.messageId ?? (() => `human-${uuid()}`);
  const draftDelayMs = options.draftDelayMs ?? 50;
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
  const sentFiles = new Map<string, OutgoingFile[]>();
  let running = false;
  let session = 0;
  let unfollow: (() => void) | undefined;
  let frames: Promise<void> = Promise.resolve();
  const presented = new WeakMap<JournalEntry, ConversationMessage>();
  let messages: ConversationMessage[] = [];
  let snapshot: ConversationSnapshot = build(true);
  let cacheTimer: ReturnType<typeof setTimeout> | undefined;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  function build(withMessages: boolean): ConversationSnapshot {
    return {
      status,
      ...(reason === undefined ? {} : { reason }),
      messages: withMessages ? (messages = buildMessages()) : messages,
      drafts: [...drafts.values()],
      hasOlder,
      loadingOlder,
      fromCache,
    };
  }

  function presentEntry(entry: JournalEntry): ConversationMessage {
    let message = presented.get(entry);
    if (message === undefined) {
      message = present(entry, options.host.resource, sentFiles.get(entry.message.id) ?? []);
      presented.set(entry, message);
    }
    return message;
  }

  function buildMessages(): ConversationMessage[] {
    const committed = new Set(window.map((entry) => entry.message.id));
    const pending: ConversationMessage[] = [];
    for (const item of outgoing.values()) {
      if (committed.has(item.id)) continue;
      pending.push({
        id: item.id,
        at: item.at,
        author: 'human',
        body: item.body,
        attachments: item.files.map((file, index) => ({
          key: `${item.id}:${index}`,
          kind: file.kind ?? 'file',
          name: file.name,
          ...(item.refs[index] === undefined ? {} : { size: item.refs[index].size }),
          ...(file.uri === undefined ? {} : { source: { uri: file.uri, headers: {} } }),
          local: file.uri !== undefined,
        })),
        delivery: item.delivery,
        ...(item.error === undefined ? {} : { error: item.error }),
      });
    }
    return [...window.map(presentEntry), ...pending];
  }

  const publish = (withMessages = true): void => {
    clearTimeout(draftTimer);
    draftTimer = undefined;
    snapshot = build(withMessages);
    for (const listener of listeners) listener();
  };

  const publishDrafts = (): void => {
    draftTimer ??= setTimeout(() => publish(false), draftDelayMs);
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
    } else {
      applyNotification(frame.notification);
      if (frame.notification.kind === 'draft') publishDrafts();
      else publish(false);
      return;
    }
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
      for (const [index, file] of item.files.entries())
        item.refs[index] ??= await options.host.upload(file.name, await file.read());
      const attachments = item.refs.filter((ref) => ref !== undefined);
      await options.host.call('channelSend', {
        channelId: id,
        body: item.body,
        messageId: item.id,
        ...(attachments.length === 0 ? {} : { attachments }),
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
      clearTimeout(draftTimer);
      draftTimer = undefined;
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
    send(body, files = []) {
      const item: Outgoing = {
        id: newMessageId(),
        at: new Date().toISOString(),
        body,
        files,
        refs: files.map(() => undefined),
        delivery: 'pending',
      };
      outgoing.set(item.id, item);
      if (files.some((file) => file.uri !== undefined)) sentFiles.set(item.id, files);
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
