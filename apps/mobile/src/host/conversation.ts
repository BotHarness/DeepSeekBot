import type { HostClient, RemoteSource } from './client';
import { activityOf, type ChannelActivity } from './channel-activity';
import { approvalCommand } from './requests';
import type {
  AttachmentRef,
  WireAllBotMention,
  WireMention,
  ChannelLiveFrame,
  ChannelNotification,
  ChannelWireMessage,
  JournalEntry,
  JournalPage,
  ToolApprovalOutcome,
  WireDraft,
  WireDraftAppend,
  WireReaction,
} from './wire';

export type DeliveryState = 'pending' | 'committed' | 'failed';

export type CardKind = 'tool-approval' | 'user-question' | 'private-input' | 'grant';

export interface MessageCard {
  kind: CardKind;
  channelId: string;
  subject?: string;
  command?: string;
  resolved?: true;
}

export type CardResolution =
  | { kind: 'tool-approval'; outcome: ToolApprovalOutcome }
  | { kind: 'user-question'; state: 'answered' | 'cancelled' }
  | { kind: 'grant' }
  | { kind: 'private-input' };

export interface MessageAttachment {
  key: string;
  kind: 'image' | 'file' | 'audio';
  name: string;
  mime?: string;
  size?: number;
  source?: RemoteSource;
  local: boolean;
}

export const LOCAL_HUMAN = 'local-human';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const;

export const MENU_REACTIONS = [
  ...QUICK_REACTIONS,
  '🙏',
  '🔥',
  '💯',
  '😮',
  '😢',
  '👎',
  '🙌',
  '🤔',
] as const;

export type ConversationReaction = WireReaction;

export function reactedByMe(reaction: ConversationReaction): boolean {
  return reaction.actors.some((actor) => actor.kind === 'human' && actor.id === LOCAL_HUMAN);
}

export function toggledReactions(
  reactions: readonly ConversationReaction[] | undefined,
  emoji: string,
  active: boolean,
): ConversationReaction[] {
  const me = { kind: 'human' as const, id: LOCAL_HUMAN };
  const current = [...(reactions ?? [])];
  const index = current.findIndex((reaction) => reaction.emoji === emoji);
  if (!active) {
    if (index === -1) return current;
    const actors = current[index]!.actors.filter(
      (actor) => actor.kind !== 'human' || actor.id !== LOCAL_HUMAN,
    );
    return actors.length === 0
      ? current.filter((_, position) => position !== index)
      : current.map((reaction, position) => (position === index ? { emoji, actors } : reaction));
  }
  if (index === -1) return [...current, { emoji, actors: [me] }];
  if (reactedByMe(current[index]!)) return current;
  return current.map((reaction, position) =>
    position === index ? { emoji, actors: [...reaction.actors, me] } : reaction,
  );
}

export function reactable(message: ConversationMessage): boolean {
  return (
    message.author !== 'system' &&
    message.revision !== undefined &&
    message.delivery === 'committed' &&
    message.card === undefined &&
    message.activity === undefined
  );
}

export function shownInChat(message: ConversationMessage): boolean {
  const resolution = message.resolves?.resolution;
  if (
    resolution?.kind === 'tool-approval' ||
    resolution?.kind === 'grant' ||
    resolution?.kind === 'private-input' ||
    (resolution?.kind === 'user-question' && resolution.state === 'cancelled')
  )
    return false;
  if (message.welcome === true) return false;
  return (
    message.activity !== undefined ||
    message.body.trim() !== '' ||
    message.attachments.length > 0 ||
    message.card !== undefined ||
    message.resolves !== undefined
  );
}

export interface ConversationMessage {
  id: string;
  revision?: number;
  at: string;
  author: 'human' | 'bot' | 'system';
  bot?: string;
  body: string;
  mentions?: WireMention[];
  attachments: MessageAttachment[];
  card?: MessageCard;
  resolves?: { requestId: string; resolution: CardResolution };
  reactions?: ConversationReaction[];
  delivery: DeliveryState;
  error?: string;
  welcome?: true;
  activity?: ChannelActivity;
}

export interface ConversationDraft {
  draftId: string;
  botSlug: string;
  body: string;
}

export type ConversationDraftReference = Pick<ConversationDraft, 'draftId' | 'botSlug'>;

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

export interface ConversationTimelineSnapshot extends Omit<ConversationSnapshot, 'drafts'> {
  drafts: ConversationDraftReference[];
}

function timelineOf(
  current: ConversationSnapshot,
  previous?: ConversationTimelineSnapshot,
): ConversationTimelineSnapshot {
  const sameDrafts =
    previous !== undefined &&
    current.drafts.length === previous.drafts.length &&
    current.drafts.every(
      (draft, index) =>
        draft.draftId === previous.drafts[index]?.draftId &&
        draft.botSlug === previous.drafts[index]?.botSlug,
    );
  if (
    sameDrafts &&
    current.messages === previous.messages &&
    current.status === previous.status &&
    current.reason === previous.reason &&
    current.hasOlder === previous.hasOlder &&
    current.loadingOlder === previous.loadingOlder &&
    current.fromCache === previous.fromCache
  )
    return previous;
  return {
    ...current,
    drafts: sameDrafts
      ? previous.drafts
      : current.drafts.map(({ draftId, botSlug }) => ({ draftId, botSlug })),
  };
}

export interface CachedConversation {
  entries: JournalEntry[];
  hasOlder: boolean;
}

export interface ConversationCache {
  read(key: string): Promise<CachedConversation | undefined>;
  write(key: string, value: CachedConversation): void;
}

export interface SendObservation {
  accepted(): boolean;
  observed(): void;
}
export interface Conversation {
  setForeground?(visible: boolean): void;
  getSnapshot(): ConversationSnapshot;
  getTimelineSnapshot(): ConversationTimelineSnapshot;
  subscribe(listener: () => void): () => void;
  start(): void;
  stop(): void;
  loadOlder(): Promise<void>;
  send(body: string, files?: OutgoingFile[], tags?: MessageTags): string;
  retry(messageId: string): void;
  react(messageId: string, emoji: string, active: boolean): Promise<void>;
}

export interface ConversationOptions {
  telemetry?: { send(): SendObservation };
  host: Pick<HostClient, 'call' | 'follow' | 'upload' | 'resource'>;
  botSlug?: string;
  displayName?: string;
  channelId?: string;
  cacheKey?: string;
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

export interface MessageTags {
  mentions?: WireMention[];
  allBotMention?: WireAllBotMention;
}

interface Outgoing {
  observation?: SendObservation;
  acceptanceObserved?: boolean;
  id: string;
  at: string;
  body: string;
  tags: MessageTags;
  files: OutgoingFile[];
  refs: Array<AttachmentRef | undefined>;
  delivery: DeliveryState;
  error?: string;
}

export function uuid(): string {
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
    const input = text(field(message.toolApprovalRequest, 'input'));
    const command =
      subject === undefined || input === undefined ? undefined : approvalCommand(subject, input);
    return {
      kind: 'tool-approval',
      channelId,
      ...(subject === undefined ? {} : { subject }),
      ...(command === undefined ? {} : { command }),
    };
  }
  if (message.userQuestionRequest !== undefined) {
    const questions = field(message.userQuestionRequest, 'questions');
    const subject = Array.isArray(questions) ? text(field(questions[0], 'question')) : undefined;
    return { kind: 'user-question', channelId, ...(subject === undefined ? {} : { subject }) };
  }
  if (message.privateInputRequest !== undefined) {
    const subject = text(field(message.privateInputRequest, 'purpose'));
    return { kind: 'private-input', channelId, ...(subject === undefined ? {} : { subject }) };
  }
  if (message.grantRequest === true)
    return {
      kind: 'grant',
      channelId,
      ...(message.grantRequestResolved === true ? { resolved: true as const } : {}),
    };
  return undefined;
}

const OUTCOMES = new Set<string>([
  'allowed-once',
  'allowed-always-tool',
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
  const granted = text(field(message.grantRequestResolution, 'requestMessageId'));
  if (granted !== undefined) return { requestId: granted, resolution: { kind: 'grant' } };
  const provided = text(field(message.privateInputResolution, 'requestMessageId'));
  if (provided !== undefined) return { requestId: provided, resolution: { kind: 'private-input' } };
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
  const activity = activityOf(message);
  return {
    id: message.id,
    revision: entry.revision,
    at: message.at,
    author: kind === 'human' ? 'human' : kind === 'bot' ? 'bot' : 'system',
    ...(message.author.kind === 'bot' ? { bot: message.author.slug } : {}),
    body: message.body,
    ...(message.mentions === undefined ? {} : { mentions: message.mentions }),
    attachments: attachmentsOf(entry, resolve, picked),
    ...(card === undefined ? {} : { card }),
    ...(resolves === undefined ? {} : { resolves }),
    ...(activity === undefined ? {} : { activity }),
    ...(message.reactions === undefined || message.reactions.length === 0
      ? {}
      : { reactions: message.reactions }),
    delivery: 'committed',
    ...(kind === 'system' && message.onboardingWelcome !== undefined ? { welcome: true } : {}),
  };
}

export function createConversation(options: ConversationOptions): Conversation {
  const pageSize = options.pageSize ?? 50;
  const olderPageSize = options.olderPageSize ?? 30;
  const cachedEntries = options.cachedEntries ?? 50;
  const newMessageId = options.messageId ?? (() => `human-${uuid()}`);
  const draftDelayMs = options.draftDelayMs ?? 50;
  const cacheKey = options.cacheKey ?? options.botSlug ?? options.channelId;
  const listeners = new Set<() => void>();
  let channelId = options.channelId;
  let window: JournalEntry[] = [];
  let hasOlder = false;
  let loadingOlder = false;
  let fromCache = false;
  let status: ConversationStatus = 'opening';
  let reason: string | undefined;
  const drafts = new Map<string, ConversationDraft>();
  const draftRevisions = new Map<string, number>();
  let appendDrafts = true;
  const outgoing = new Map<string, Outgoing>();
  const sentFiles = new Map<string, OutgoingFile[]>();
  let running = false;
  let foreground = false;
  let acceptedSend: SendObservation | undefined;
  let session = 0;
  let unfollow: (() => void) | undefined;
  let frames: Promise<void> = Promise.resolve();
  const presented = new WeakMap<JournalEntry, ConversationMessage>();
  let messages: ConversationMessage[] = [];
  let snapshot: ConversationSnapshot = build(true);
  let timelineSnapshot = timelineOf(snapshot);
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
        ...(item.tags.mentions === undefined ? {} : { mentions: item.tags.mentions }),
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
    timelineSnapshot = timelineOf(snapshot, timelineSnapshot);
    for (const listener of listeners) listener();
  };

  const publishDrafts = (): void => {
    draftTimer ??= setTimeout(() => publish(false), draftDelayMs);
  };

  const first = (): number => window[0]?.revision ?? 0;
  const last = (): number => window.at(-1)?.revision ?? 0;

  const accepted = (item: Outgoing): void => {
    if (item.acceptanceObserved) return;
    item.acceptanceObserved = true;
    if (item.observation?.accepted() && foreground) acceptedSend = item.observation;
  };
  const settleOutgoing = (): void => {
    for (const entry of window) {
      const item = outgoing.get(entry.message.id);
      if (item !== undefined) accepted(item);
      outgoing.delete(entry.message.id);
    }
  };

  const persist = (): void => {
    const cache = options.cache;
    if (cache === undefined || cacheKey === undefined || fromCache) return;
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => {
      const tail = window.slice(-cachedEntries);
      cache.write(cacheKey, {
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

  const clearDrafts = (): void => {
    drafts.clear();
    draftRevisions.clear();
  };

  const deleteDraft = (draftId: string): void => {
    drafts.delete(draftId);
    draftRevisions.delete(draftId);
  };

  const setReactions = (messageId: string, reactions: readonly WireReaction[]): boolean => {
    if (!window.some((entry) => entry.message.id === messageId)) return false;
    window = window.map((entry) => {
      if (entry.message.id !== messageId) return entry;
      const { reactions: _previous, ...message } = entry.message;
      return {
        ...entry,
        message: reactions.length === 0 ? message : { ...message, reactions: [...reactions] },
      };
    });
    return true;
  };

  const applyNotification = (notification: ChannelNotification, current: number): void => {
    if (notification.kind === 'reaction') {
      if (notification.channelId === channelId)
        setReactions(notification.messageId, notification.reactions);
    } else if (notification.kind === 'draft-baseline') {
      clearDrafts();
      for (const draft of notification.drafts) upsertDraft(draft);
    } else if (notification.kind === 'draft') upsertDraft(notification.draft);
    else if (notification.kind === 'draft-append') appendDraft(notification.append, current);
    else if (notification.kind === 'draft-settled' || notification.kind === 'draft-abandoned')
      deleteDraft(notification.event.draftId);
  };

  const upsertDraft = (draft: WireDraft): void => {
    if (draft.channelId !== channelId) return;
    drafts.set(draft.draftId, { draftId: draft.draftId, botSlug: draft.botSlug, body: draft.body });
    draftRevisions.set(draft.draftId, draft.revision);
  };

  const appendDraft = (append: WireDraftAppend, current: number): void => {
    const draft = drafts.get(append.draftId);
    if (
      draft === undefined ||
      draftRevisions.get(append.draftId) !== append.base ||
      draft.body.length !== append.offset
    ) {
      deleteDraft(append.draftId);
      refollow(current);
      return;
    }
    drafts.set(append.draftId, { ...draft, body: draft.body + append.append });
    draftRevisions.set(append.draftId, append.revision);
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
      const newlyObserved =
        foreground && status === 'live' && !fromCache && entry.revision > last();
      if (entry.revision <= last()) {
        if (entry.revision >= first()) merge([entry]);
      } else if (entry.revision === last() + 1) merge([entry]);
      else {
        const repair = await readPage(entry.revision, undefined, Math.min(MAX_PAGE, pageSize));
        if (current !== session) return;
        await advance(entry.revision, repair);
      }
      if (newlyObserved && entry.message.author.kind === 'bot') acceptedSend?.observed();
      if (entry.message.author.kind === 'bot')
        for (const [draftId, draft] of drafts)
          if (draft.botSlug === entry.message.author.slug) deleteDraft(draftId);
    } else {
      applyNotification(frame.notification, current);
      const kind = frame.notification.kind;
      if (kind === 'draft' || kind === 'draft-append') return publishDrafts();
      if (kind !== 'reaction') return publish(false);
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
    if (options.botSlug === undefined) throw new Error('The Channel could not be opened.');
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

  const refollow = (current: number): void => {
    if (!running || current !== session) return;
    unfollow?.();
    unfollow = undefined;
    session += 1;
    void open(session);
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
      { channelId: id, limit: pageSize, ...(appendDrafts ? { drafts: 'append' } : {}) },
      {
        item: (value) => enqueue(value as ChannelLiveFrame, current),
        interrupted: (why) => {
          if (current !== session) return;
          frames = frames.then(() => {
            if (current !== session) return;
            status = 'interrupted';
            reason = why;
            clearDrafts();
            publish();
          });
        },
        refused: (error) => {
          if (current !== session) return;
          if (appendDrafts && error.code === 'gateway/arguments-invalid') {
            appendDrafts = false;
            refollow(current);
            return;
          }
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
        ...(item.tags.mentions === undefined || item.tags.mentions.length === 0
          ? {}
          : { mentions: item.tags.mentions }),
        ...(item.tags.allBotMention === undefined
          ? {}
          : { allBotMention: item.tags.allBotMention }),
      });
      accepted(item);
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
    setForeground(visible) {
      foreground = visible;
      if (!visible) acceptedSend = undefined;
    },
    getSnapshot: () => snapshot,
    getTimelineSnapshot: () => timelineSnapshot,
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
        (cacheKey === undefined
          ? undefined
          : options.cache?.read(cacheKey).catch(() => undefined)) ?? Promise.resolve(undefined);
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
      acceptedSend = undefined;
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
    send(body, files = [], tags = {}) {
      const item: Outgoing = {
        id: newMessageId(),
        at: new Date().toISOString(),
        body,
        tags,
        files,
        refs: files.map(() => undefined),
        delivery: 'pending',
        ...(foreground && options.telemetry !== undefined
          ? { observation: options.telemetry.send() }
          : {}),
      };
      outgoing.set(item.id, item);
      if (files.some((file) => file.uri !== undefined)) sentFiles.set(item.id, files);
      publish();
      void deliver(item);
      return item.id;
    },
    async react(messageId, emoji, active) {
      const id = channelId;
      const before = window.find((entry) => entry.message.id === messageId)?.message.reactions;
      if (id === undefined || !setReactions(messageId, toggledReactions(before, emoji, active)))
        return;
      publish();
      try {
        const result = await options.host.call<{ reactions: WireReaction[] }>('channelReact', {
          channelId: id,
          messageId,
          emoji,
          active,
        });
        if (id === channelId && setReactions(messageId, result.reactions)) publish();
        persist();
      } catch (error) {
        if (id === channelId && setReactions(messageId, before ?? [])) publish();
        throw error;
      }
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
