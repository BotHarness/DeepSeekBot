import { openBotDm } from './channel-management';
import { forgetGenuiDocumentViews } from './genui/view';
import { forgetMedia } from './media-cache';
import { replyPreviewOf } from '../../core/src/channels/reply-preview';
import type {
  AttachmentRef,
  ChannelLiveFrame,
  ChannelNotification,
  ChannelWireMessage,
  JournalEntry,
  JournalPage,
  WireDraft,
  WireDelivery,
  WireDraftAppend,
  WireMessageVoice,
  WireReaction,
  WireReplyPreview,
} from '@botharness/host-protocol/wire';
import {
  loadChannelChangeCursor,
  readChannelChanges,
  reactToMessage,
  readChannelJournal,
  sendToChannel,
  wireMessage,
} from './channel-messages';
import type {
  DeliveryState,
  ConversationMessage,
  ConversationDraft,
  ConversationStatus,
  ConversationSnapshot,
  ChangeCursor,
  SendObservation,
  Conversation,
  ConversationOptions,
  OutgoingFile,
  MessageTags,
} from './conversation-contract';
import { LOCAL_HUMAN, toggledReactions } from './conversation-reactions';
import { timelineOf, previewFor, present } from './conversation-timeline';
import { mediaCacheKey, replyThumbnailOf, withReplyThumbnail } from './conversation-media';

export type {
  DeliveryState,
  CardKind,
  MessageCard,
  CardResolution,
  MessageAttachment,
  ConversationReaction,
  MessageVoice,
  ReplyThumbnail,
  ConversationMessage,
  ConversationDraft,
  ConversationDraftReference,
  ConversationStatus,
  ConversationSnapshot,
  ConversationTimelineSnapshot,
  ChangeCursor,
  CachedConversation,
  CachedChanges,
  OlderPage,
  ConversationCache,
  SendObservation,
  Conversation,
  ConversationOptions,
  OutgoingFile,
  MessageTags,
} from './conversation-contract';
export {
  LOCAL_HUMAN,
  QUICK_REACTIONS,
  MENU_REACTIONS,
  reactedByMe,
  toggledReactions,
  reactable,
} from './conversation-reactions';
export {
  ATTACHMENT_PATH,
  mediaCacheKey,
  THUMBNAIL_VARIANT,
  PREVIEW_VARIANT,
  attachmentsOf,
  replyThumbnailOf,
  voiceOf,
} from './conversation-media';
export { shownInChat } from './conversation-timeline';

const MAX_CHANGE_PAGES = 20;
const CACHE_WAIT_MS = 200;

const MAX_PAGE = 200;

interface Outgoing {
  observation?: SendObservation;
  acceptanceObserved?: boolean;
  id: string;
  at: string;
  attemptStartedAt: number;
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

const REOPEN_FIRST_MS = 1_000;
const REOPEN_MAX_MS = 60_000;

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
  let loadingOlderSession: number | undefined;
  let olderError = false;
  let olderOffline = false;
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
  let openedSession: number | undefined;
  let unfollow: (() => void) | undefined;
  let frames: Promise<void> = Promise.resolve();
  const presented = new WeakMap<JournalEntry, ConversationMessage>();
  let messages: ConversationMessage[] = [];
  let snapshot: ConversationSnapshot = build(true);
  let timelineSnapshot = timelineOf(snapshot);
  let cacheTimer: ReturnType<typeof setTimeout> | undefined;
  let changeCursor: ChangeCursor | undefined;
  let changesSupported = true;
  let bareOpen = false;
  let windowGeneration = 0;
  let draftTimer: ReturnType<typeof setTimeout> | undefined;

  function build(withMessages: boolean): ConversationSnapshot {
    return {
      status,
      ...(reason === undefined ? {} : { reason }),
      messages: withMessages ? (messages = buildMessages()) : messages,
      drafts: [...drafts.values()],
      hasOlder,
      loadingOlder: loadingOlderSession === session,
      ...(olderError ? { olderError: true } : {}),
      fromCache,
    };
  }

  function presentEntry(entry: JournalEntry): ConversationMessage {
    let message = presented.get(entry);
    if (message === undefined) {
      message = present(
        entry,
        options.host.resource,
        sentFiles.get(entry.message.id) ?? [],
        options.selfHumanId ?? LOCAL_HUMAN,
      );
      presented.set(entry, message);
      if (entry.message.contentPurge !== undefined)
        forgetGenuiDocumentViews(options.host, entry.channelId, entry.message.id);
    }
    return message;
  }

  function replyPreview(id: string): WireReplyPreview | null {
    const target = window.find((entry) => entry.message.id === id)?.message;
    if (target !== undefined) return replyPreviewOf(target);
    const pending = outgoing.get(id);
    return pending === undefined ? null : { author: { kind: 'human' }, body: pending.body };
  }

  function quote(
    replyTo: string,
  ): Pick<ConversationMessage, 'replyTo' | 'replyPreview' | 'replyThumbnail'> {
    const preview = previewFor(replyPreview(replyTo), options.selfHumanId ?? LOCAL_HUMAN);
    return {
      replyTo,
      replyPreview: preview,
      ...(channelId === undefined
        ? {}
        : withReplyThumbnail(replyThumbnailOf(channelId, replyTo, preview, options.host.resource))),
    };
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
        ...(item.tags.skillInvocations === undefined
          ? {}
          : { skillInvocations: item.tags.skillInvocations }),
        ...(item.tags.replyTo === undefined ? {} : quote(item.tags.replyTo)),
        attachments: item.files.map((file, index) => ({
          key: `${item.id}:${index}`,
          kind: file.kind ?? 'file',
          name: file.name,
          ...(item.refs[index] === undefined ? {} : { size: item.refs[index].size }),
          ...(file.uri === undefined ? {} : { source: { uri: file.uri, headers: {} } }),
          local: file.uri !== undefined,
        })),
        delivery: item.delivery,
        attemptStartedAt: item.attemptStartedAt,
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
        ...(changeCursor === undefined ? {} : { changes: changeCursor }),
      });
    }, 300);
  };

  const forgetReplaced = (before: JournalEntry | undefined, after: JournalEntry): void => {
    if (before === undefined || before.message.attachments === after.message.attachments) return;
    const kept = new Set(
      (after.message.attachments ?? []).map((ref) => `${ref.fileId}:${ref.version}`),
    );
    const scope = options.host.resource('/').scope;
    const stale = (before.message.attachments ?? []).flatMap((ref) =>
      ref.fileId === undefined ||
      ref.version === undefined ||
      kept.has(`${ref.fileId}:${ref.version}`)
        ? []
        : [mediaCacheKey(scope, ref.fileId, ref.version)],
    );
    if (stale.length > 0) forgetMedia(stale);
  };

  const merge = (entries: readonly JournalEntry[]): void => {
    if (entries.length === 0) return;
    const byRevision = new Map(window.map((entry) => [entry.revision, entry]));
    for (const entry of entries) {
      forgetReplaced(byRevision.get(entry.revision), entry);
      byRevision.set(entry.revision, entry);
    }
    const sorted = [...byRevision.values()].sort((a, b) => a.revision - b.revision);
    let start = sorted.length - 1;
    while (start > 0 && sorted[start - 1]!.revision === sorted[start]!.revision - 1) start -= 1;
    if (start > 0) hasOlder = true;
    window = sorted.slice(start);
  };

  const openChannel = (): string => {
    if (channelId === undefined) throw new Error('The conversation has no Channel yet.');
    return channelId;
  };

  const readPage = async (through: number, before?: number, limit?: number): Promise<JournalPage> =>
    readChannelJournal(
      options.host,
      openChannel(),
      {
        through,
        ...(before === undefined ? {} : { before }),
        ...(limit === undefined ? {} : { limit }),
      },
      wireMessage,
    );

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

  const blank = (entry: JournalEntry): JournalEntry => {
    const { attachments: _attachments, bridgeMedia: _bridgeMedia, ...message } = entry.message;
    return { ...entry, message: { ...message, body: '', contentPurge: { actor: 'local-human' } } };
  };

  const changeCall = async <T>(current: number, read: () => Promise<T>): Promise<T | undefined> => {
    try {
      return await read();
    } catch {
      if (current === session) {
        changesSupported = false;
        changeCursor = undefined;
      }
      return undefined;
    }
  };

  const reloadTail = async (current: number, through: number): Promise<boolean> => {
    windowGeneration += 1;
    const fresh = await readPage(through, undefined, pageSize);
    if (current !== session) return false;
    window = [...fresh.entries];
    hasOlder = fresh.hasOlder;
    windowGeneration += 1;
    return true;
  };

  const pullChanges = async (current: number, through: number): Promise<void> => {
    for (let page = 0; page < MAX_CHANGE_PAGES && changeCursor !== undefined; page += 1) {
      const since = changeCursor;
      const pulled = await changeCall(current, () =>
        readChannelChanges(options.host, openChannel(), since, wireMessage),
      );
      if (current !== session) return;
      if (pulled === undefined) {
        await reloadTail(current, through);
        return;
      }
      if (pulled.reset) {
        if (!(await reloadTail(current, through))) return;
        changeCursor = pulled.cursor;
        if (cacheKey !== undefined && channelId !== undefined)
          options.cache?.replace?.(cacheKey, channelId, {
            entries: window.slice(-cachedEntries),
            hasOlder: hasOlder || window.length > cachedEntries,
            changes: pulled.cursor,
          });
        return;
      }
      if (cacheKey !== undefined && channelId !== undefined)
        options.cache?.applyChanges?.(cacheKey, channelId, pulled);
      const tombstones = new Set(pulled.tombstones);
      const removed = new Set(pulled.removed);
      const updates = new Map(
        pulled.upserts
          .filter((entry) => entry.revision >= first() && entry.revision <= last())
          .map((entry) => [entry.revision, entry]),
      );
      window = window.flatMap((entry) => {
        if (removed.has(entry.message.id)) return [];
        if (tombstones.has(entry.message.id)) return [blank(entry)];
        const update = updates.get(entry.revision);
        if (update === undefined) return [entry];
        forgetReplaced(entry, update);
        return [update];
      });
      if (window.length > 0) {
        const newer = pulled.upserts
          .filter(
            (entry) =>
              entry.channelId === channelId && entry.revision > last() && entry.revision <= through,
          )
          .sort((a, b) => a.revision - b.revision);
        for (const entry of newer) {
          if (entry.revision !== last() + 1) break;
          window = [...window, entry];
        }
      }
      changeCursor = pulled.cursor;
      if (pulled.upserts.length + pulled.tombstones.length + pulled.removed.length > 0)
        windowGeneration += 1;
      if (!pulled.hasMore) return;
    }
    if (current !== session || changeCursor === undefined) return;
    changeCursor = undefined;
    await reloadTail(current, through);
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

  const setVoice = (
    messageId: string,
    voice: WireMessageVoice,
    attachments: readonly AttachmentRef[],
  ): void => {
    window = window.map((entry) =>
      entry.message.id !== messageId || entry.message.author.kind !== 'bot'
        ? entry
        : {
            ...entry,
            message: {
              ...entry.message,
              voice,
              ...(attachments.length === 0 ? {} : { attachments: [...attachments] }),
            },
          },
    );
  };

  const setAttachments = (
    messageId: string,
    attachments: readonly AttachmentRef[],
    cleared: NonNullable<ChannelWireMessage['clearedAttachments']>,
  ): void => {
    window = window.map((entry) => {
      if (entry.message.id !== messageId) return entry;
      const { attachments: _attachments, clearedAttachments: _cleared, ...message } = entry.message;
      const next = {
        ...entry,
        message: {
          ...message,
          ...(attachments.length === 0 ? {} : { attachments: [...attachments] }),
          ...(cleared.length === 0 ? {} : { clearedAttachments: [...cleared] }),
        },
      };
      forgetReplaced(entry, next);
      return next;
    });
  };

  const setDeliveries = (messageId: string, deliveries: readonly WireDelivery[]): boolean => {
    const signature = (list: readonly WireDelivery[] | undefined) =>
      (list ?? []).map((delivery) => delivery.botSlug + ':' + delivery.state).join('|');
    const index = window.findIndex((entry) => entry.message.id === messageId);
    const entry = window[index];
    if (entry === undefined || signature(entry.message.deliveries) === signature(deliveries))
      return false;
    const next = { ...entry, message: { ...entry.message, deliveries: [...deliveries] } };
    window = window.map((current, position) => (position === index ? next : current));
    return true;
  };

  const applyNotification = (notification: ChannelNotification, current: number): boolean => {
    if (notification.kind === 'admission')
      return (
        notification.channelId === channelId &&
        notification.deliveries !== undefined &&
        setDeliveries(notification.messageId, notification.deliveries)
      );
    if (notification.kind === 'reaction') {
      if (notification.channelId === channelId)
        setReactions(notification.messageId, notification.reactions);
    } else if (notification.kind === 'voice') {
      if (notification.channelId === channelId)
        setVoice(notification.messageId, notification.voice, notification.attachments);
    } else if (notification.kind === 'attachments') {
      if (notification.channelId === channelId)
        setAttachments(
          notification.messageId,
          notification.attachments,
          notification.clearedAttachments,
        );
    } else if (notification.kind === 'draft-baseline') {
      clearDrafts();
      for (const draft of notification.drafts) upsertDraft(draft);
    } else if (notification.kind === 'draft') upsertDraft(notification.draft);
    else if (notification.kind === 'draft-append') appendDraft(notification.append, current);
    else if (notification.kind === 'draft-settled' || notification.kind === 'draft-abandoned')
      deleteDraft(notification.event.draftId);
    return false;
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
      openedSession = current;
      const bare = bareOpen && (frame.page?.entries.length ?? 0) === 0;
      const page =
        bare && frame.cursor > 0 && (window.length === 0 || frame.cursor - last() > MAX_PAGE)
          ? await readPage(frame.cursor, undefined, pageSize)
          : frame.page;
      if (current !== session) return;
      const upToDate =
        frame.changes !== undefined &&
        changeCursor !== undefined &&
        changeCursor.epoch === frame.changes.epoch &&
        changeCursor.seq >= frame.changes.seq;
      const pull = bare && !upToDate;
      const pullFirst = pull && page === frame.page;
      if (pullFirst) await pullChanges(current, frame.cursor);
      if (current !== session) return;
      await advance(frame.cursor, page);
      if (current !== session) return;
      if (pull && !pullFirst) await pullChanges(current, frame.cursor);
      if (current !== session) return;
      fromCache = false;
      reopenFailures = 0;
      status = 'live';
      if (olderOffline) olderError = olderOffline = false;
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
      const admitted = applyNotification(frame.notification, current);
      const kind = frame.notification.kind;
      if (kind === 'draft' || kind === 'draft-append') return publishDrafts();
      if (kind !== 'reaction' && kind !== 'voice' && kind !== 'attachments' && !admitted)
        return publish(false);
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
    const channel = await openBotDm(options.host, {
      slug: options.botSlug,
      ...(options.displayName === undefined ? {} : { displayName: options.displayName }),
    });
    channelId = channel.id;
    return channelId;
  };

  let reopenFailures = 0;
  const reopen = (current: number): void => {
    unfollow?.();
    unfollow = undefined;
    const delay = Math.min(REOPEN_MAX_MS, REOPEN_FIRST_MS * 2 ** reopenFailures);
    reopenFailures += 1;
    setTimeout(() => {
      if (running && current === session) void open(current);
    }, delay);
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
    bareOpen = changesSupported && changeCursor !== undefined && window.length > 0;
    if (!bareOpen && changesSupported) {
      const cursor = await changeCall(current, () => loadChannelChangeCursor(options.host));
      if (current !== session) return;
      changeCursor = cursor;
    }
    unfollow = options.host.follow(
      'botharness/followChannel',
      {
        channelId: id,
        limit: bareOpen ? 0 : pageSize,
        ...(appendDrafts ? { drafts: 'append' } : {}),
      },
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
          if (
            bareOpen &&
            (error.code === 'invalid' || error.code === 'gateway/arguments-invalid')
          ) {
            changesSupported = false;
            changeCursor = undefined;
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
      await sendToChannel(
        options.host,
        {
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
          ...(item.tags.skillInvocations === undefined || item.tags.skillInvocations.length === 0
            ? {}
            : { skillInvocations: item.tags.skillInvocations }),
          ...(item.tags.replyTo === undefined ? {} : { replyTo: item.tags.replyTo }),
          ...(item.tags.genuiReply === undefined ? {} : { genuiReply: item.tags.genuiReply }),
        },
        wireMessage,
      );
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
    wireMessage: (messageId) => window.find((entry) => entry.message.id === messageId)?.message,
    redact(placements) {
      const purged = new Set(
        placements.map((placement) => `${placement.channelId}\u0000${placement.messageId}`),
      );
      let changed = false;
      window = window.map((entry) => {
        if (
          entry.message.contentPurge !== undefined ||
          !purged.has(`${entry.channelId}\u0000${entry.message.id}`)
        )
          return entry;
        changed = true;
        const { attachments: _attachments, bridgeMedia: _bridgeMedia, ...message } = entry.message;
        return {
          ...entry,
          message: { ...message, body: '', contentPurge: { actor: 'local-human' } },
        };
      });
      if (!changed) return;
      publish();
      persist();
    },
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
      let going = false;
      const go = (): void => {
        if (going || current !== session) return;
        going = true;
        void open(current);
      };
      void cached.then((value) => {
        if (current !== session || openedSession === current) return go();
        if (value !== undefined && window.length === 0 && value.entries.length > 0) {
          window = [];
          merge(value.entries);
          hasOlder = value.hasOlder || hasOlder;
          changeCursor = value.changes;
          fromCache = true;
          publish();
        }
        go();
      });
      setTimeout(go, options.cacheWaitMs ?? CACHE_WAIT_MS);
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
      if (loadingOlderSession === session || !hasOlder || window.length === 0) return;
      const offline = fromCache || status !== 'live';
      const current = session;
      const before = first();
      const generation = windowGeneration;
      const stale = () =>
        current !== session || first() !== before || generation !== windowGeneration;
      loadingOlderSession = current;
      olderError = false;
      publish();
      try {
        const local =
          cacheKey === undefined
            ? undefined
            : await options.cache
                ?.readOlder?.(cacheKey, before, olderPageSize)
                .catch(() => undefined);
        if (stale()) return;
        if (local !== undefined) {
          window = [...local.entries, ...window];
          hasOlder = local.hasOlder;
          return;
        }
        if (offline) {
          olderError = olderOffline = true;
          return;
        }
        const page = await readPage(last(), before, olderPageSize);
        if (stale()) return;
        const entries = page.entries.filter((entry) => entry.revision < before);
        if (cacheKey !== undefined && channelId !== undefined)
          options.cache?.writeOlder?.(cacheKey, channelId, before, {
            entries,
            hasOlder: page.hasOlder,
          });
        if (entries.length > 0 && entries.at(-1)!.revision === before - 1) {
          window = [...entries, ...window];
          hasOlder = page.hasOlder;
        } else if (entries.length === 0) hasOlder = false;
        persist();
      } catch {
        if (current === session) olderError = true;
      } finally {
        if (loadingOlderSession === current) {
          loadingOlderSession = undefined;
          publish();
        }
      }
    },
    send(body, files = [], tags = {}) {
      const item: Outgoing = {
        id: newMessageId(),
        at: new Date().toISOString(),
        attemptStartedAt: Date.now(),
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
        const reactions = await reactToMessage(options.host, {
          channelId: id,
          messageId,
          emoji,
          active,
        });
        if (id === channelId && setReactions(messageId, reactions)) publish();
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
      item.attemptStartedAt = Date.now();
      delete item.error;
      publish();
      void deliver(item);
    },
  };
}
