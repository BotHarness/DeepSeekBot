import {
  subscribeMessagingDefaults,
  openSharedChannel,
  type ChannelEventSource,
} from './messaging-defaults-live.js';
import { parseContentRedactions } from './content-redactions.js';
import { parseChannelMessage } from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { ChannelDraft, ClientStore } from './store.js';

const EVENT_NAME = 'channel/message';
const ADMISSION_EVENT = 'channel/admission';
const HUMAN_READ_EVENT = 'channel/human-read';
const DRAFT_EVENT = 'channel/draft';
const DRAFT_BASELINE_EVENT = 'channel/draft-baseline';
const DRAFT_SETTLED_EVENT = 'channel/draft-settled';
const DRAFT_ABANDONED_EVENT = 'channel/draft-abandoned';

interface ChannelFrame {
  channelId: string;
  revision: number;
  message: ReturnType<typeof parseChannelMessage>;
}

function parseFrame(value: string): ChannelFrame | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof decoded !== 'object' || decoded === null) return undefined;
  const record = decoded as Record<string, unknown>;
  const revision = record['revision'];
  const message = parseChannelMessage(record['message']);
  if (
    typeof record['channelId'] !== 'string' ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    message === undefined
  ) {
    return undefined;
  }
  return { channelId: record['channelId'], revision, message };
}

function parseDraft(value: string): ChannelDraft | undefined {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    return undefined;
  }
  if (typeof decoded !== 'object' || decoded === null) return undefined;
  const item = decoded as Record<string, unknown>;
  if (
    typeof item['channelId'] !== 'string' ||
    typeof item['draftId'] !== 'string' ||
    typeof item['attemptId'] !== 'string' ||
    typeof item['revision'] !== 'number' ||
    !Number.isSafeInteger(item['revision']) ||
    item['revision'] < 1 ||
    typeof item['botSlug'] !== 'string' ||
    typeof item['body'] !== 'string'
  )
    return undefined;
  return {
    channelId: item['channelId'],
    draftId: item['draftId'],
    attemptId: item['attemptId'],
    revision: item['revision'],
    botSlug: item['botSlug'],
    body: item['body'],
  };
}

interface DraftLifecycle {
  channelId: string;
  draftId: string;
  attemptId: string;
  revision: number;
  reason?: 'retargeted' | 'interrupted' | 'expired';
}

function parseDraftLifecycle(value: string): DraftLifecycle | undefined {
  try {
    const decoded: unknown = JSON.parse(value);
    if (typeof decoded !== 'object' || decoded === null) return undefined;
    const item = decoded as Record<string, unknown>;
    if (
      typeof item['channelId'] !== 'string' ||
      typeof item['draftId'] !== 'string' ||
      typeof item['attemptId'] !== 'string' ||
      typeof item['revision'] !== 'number' ||
      !Number.isSafeInteger(item['revision']) ||
      item['revision'] < 1
    )
      return undefined;
    const reason = item['reason'];
    if (
      reason !== undefined &&
      reason !== 'retargeted' &&
      reason !== 'interrupted' &&
      reason !== 'expired'
    )
      return undefined;
    return {
      channelId: item['channelId'],
      draftId: item['draftId'],
      attemptId: item['attemptId'],
      revision: item['revision'],
      ...(reason === undefined ? {} : { reason }),
    };
  } catch {
    return undefined;
  }
}

function parseDraftBaseline(
  value: string,
): { channelId: string; revision: number; drafts: ChannelDraft[] } | undefined {
  try {
    const decoded: unknown = JSON.parse(value);
    if (typeof decoded !== 'object' || decoded === null) return undefined;
    const item = decoded as Record<string, unknown>;
    if (
      typeof item['channelId'] !== 'string' ||
      typeof item['revision'] !== 'number' ||
      !Number.isSafeInteger(item['revision']) ||
      item['revision'] < 0 ||
      !Array.isArray(item['drafts'])
    )
      return undefined;
    const drafts = item['drafts'].map((draft) => parseDraft(JSON.stringify(draft)));
    if (drafts.some((draft) => draft === undefined)) return undefined;
    return {
      channelId: item['channelId'],
      revision: item['revision'],
      drafts: drafts as ChannelDraft[],
    };
  } catch {
    return undefined;
  }
}

export function mountChannelLive(
  store: ClientStore,
  actions: Pick<BridgeActions, 'refreshChannelMessages'>,
  makeSource: (url: string) => ChannelEventSource = openSharedChannel,
): () => void {
  let activeChannelId: string | undefined;
  let source: ChannelEventSource | undefined;
  let recovering = false;
  let disposed = false;
  let baselineSeen = false;
  let draftCursor = 0;
  let visibleDrafts: ChannelDraft[] = [];
  let activeAttempts = new Map<string, string>();
  let renderFrame: number | undefined;
  let noticeTimer: ReturnType<typeof setTimeout> | undefined;

  const cancelRender = (): void => {
    if (renderFrame !== undefined) cancelAnimationFrame(renderFrame);
    renderFrame = undefined;
  };

  const flushDrafts = (): void => {
    renderFrame = undefined;
    if (activeChannelId === undefined) return;
    if (store.getSnapshot().conversation.channel?.id !== activeChannelId) return;
    store.setConversation({ drafts: visibleDrafts, draftRevision: draftCursor });
  };

  const scheduleDrafts = (): void => {
    if (renderFrame !== undefined) return;
    if (typeof requestAnimationFrame !== 'function') {
      flushDrafts();
      return;
    }
    renderFrame = requestAnimationFrame(flushDrafts);
  };

  const close = (): void => {
    cancelRender();
    source?.close();
    source = undefined;
    activeChannelId = undefined;
    baselineSeen = false;
    draftCursor = 0;
    visibleDrafts = [];
    activeAttempts.clear();
    if (noticeTimer !== undefined) clearTimeout(noticeTimer);
    noticeTimer = undefined;
  };

  const recover = async (channelId: string): Promise<void> => {
    if (recovering || disposed) return;
    recovering = true;
    close();
    store.setConversation({ drafts: [], draftRevision: 0, draftNotice: undefined });
    try {
      await actions.refreshChannelMessages(channelId);
    } catch (error) {
      console.warn('botharness: Channel live refresh failed', error);
    } finally {
      recovering = false;
      sync();
    }
  };

  const acceptRevision = (channelId: string, revision: number): boolean => {
    if (!baselineSeen || channelId !== activeChannelId || revision !== draftCursor + 1) {
      if (activeChannelId === channelId) void recover(channelId);
      return false;
    }
    draftCursor = revision;
    return true;
  };

  const showAbandoned = (reason: DraftLifecycle['reason']): void => {
    if (reason === undefined || reason === 'retargeted') return;
    if (noticeTimer !== undefined) clearTimeout(noticeTimer);
    store.setConversation({ draftNotice: reason });
    noticeTimer = setTimeout(() => {
      noticeTimer = undefined;
      store.setConversation({ draftNotice: undefined });
    }, 5_000);
  };

  const sync = (): void => {
    if (disposed || recovering) return;
    const snapshot = store.getSnapshot();
    const channel =
      snapshot.mode === 'bot' && snapshot.conversation.status === 'ready'
        ? snapshot.conversation.channel
        : undefined;
    if (channel?.id === activeChannelId) return;
    close();
    if (channel === undefined) return;
    activeChannelId = channel.id;
    const query = new URLSearchParams({
      channelId: channel.id,
      after: String(snapshot.conversation.revision),
    });
    let next: ChannelEventSource;
    try {
      next = makeSource('/api/botharness/stream?' + query.toString());
    } catch {
      close();
      console.warn('botharness: Channel live stream construction refused');
      return;
    }
    source = next;
    next.addEventListener(EVENT_NAME, (event) => {
      if (!(event instanceof MessageEvent)) return;
      const frame = parseFrame(event.data as string);
      if (frame === undefined || frame.channelId !== activeChannelId) return;
      const latest = store.getSnapshot();
      if (latest.conversation.channel?.id !== frame.channelId) return;
      if (frame.revision <= latest.conversation.revision) return;
      if (frame.revision !== latest.conversation.revision + 1) {
        void recover(frame.channelId);
        return;
      }
      const message = frame.message;
      if (message === undefined) return;
      const updatedChannel = {
        ...latest.conversation.channel,
        updatedAt: message.at,
        latestMessage: message,
      };
      if (message.author.kind === 'bot') {
        const botSlug = message.author.slug;
        const candidates = visibleDrafts.filter((draft) => draft.botSlug === botSlug);
        const matching = candidates.filter((draft) => message.body.startsWith(draft.body));
        const settled = matching.length > 0 ? matching : candidates.length === 1 ? candidates : [];
        if (settled.length > 0) {
          const settledIds = new Set(settled.map((draft) => draft.draftId));
          visibleDrafts = visibleDrafts.filter((draft) => !settledIds.has(draft.draftId));
          activeAttempts.delete(botSlug);
          cancelRender();
        }
      }
      store.upsertChannel(updatedChannel);
      store.setConversation({
        channel: updatedChannel,
        revision: frame.revision,
        drafts: visibleDrafts,
        draftRevision: draftCursor,
        draftNotice: undefined,
        messages: latest.conversation.timeline.hasNewer
          ? latest.conversation.messages
          : [...latest.conversation.messages.filter((item) => item.id !== message.id), message],
      });
    });
    next.addEventListener(ADMISSION_EVENT, (event) => {
      if (!(event instanceof MessageEvent)) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (typeof payload !== 'object' || payload === null) return;
      const item = payload as Record<string, unknown>;
      if (
        item['channelId'] !== activeChannelId ||
        typeof item['messageId'] !== 'string' ||
        !Array.isArray(item['deliveries'])
      )
        return;
      const latest = store.getSnapshot();
      if (latest.conversation.channel?.id !== activeChannelId) return;
      const message = latest.conversation.messages.find(
        (candidate) => candidate.id === item['messageId'],
      );
      if (message === undefined) return;
      const parsed = parseChannelMessage({
        ...message,
        deliveries: item['deliveries'],
        humanReceipts: item['humanReceipts'] ?? message.humanReceipts ?? [],
      });
      if (parsed?.deliveries === undefined || parsed.humanReceipts === undefined) return;
      store.setConversation({
        messages: latest.conversation.messages.map((candidate) =>
          candidate.id === parsed.id
            ? {
                ...candidate,
                deliveries: parsed.deliveries ?? [],
                humanReceipts: parsed.humanReceipts ?? [],
              }
            : candidate,
        ),
      });
    });
    next.addEventListener(HUMAN_READ_EVENT, (event) => {
      if (!(event instanceof MessageEvent)) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (typeof payload !== 'object' || payload === null) return;
      const item = payload as Record<string, unknown>;
      const revision = item['revision'];
      const humanId = item['humanId'];
      if (
        item['channelId'] !== activeChannelId ||
        typeof humanId !== 'string' ||
        typeof revision !== 'number' ||
        !Number.isSafeInteger(revision) ||
        revision < 1
      )
        return;
      const latest = store.getSnapshot();
      if (latest.conversation.channel?.id !== activeChannelId) return;
      store.setConversation({
        messages: latest.conversation.messages.map((message) => {
          if (
            message.channelRevision === undefined ||
            message.channelRevision > revision ||
            message.author.kind === 'human' ||
            !message.humanReceipts?.some(
              (receipt) => receipt.humanId === humanId && receipt.state === 'unread',
            )
          )
            return message;
          return {
            ...message,
            humanReceipts: message.humanReceipts.map((receipt) =>
              receipt.humanId === humanId ? { ...receipt, state: 'read' as const } : receipt,
            ),
          };
        }),
      });
    });
    next.addEventListener(DRAFT_BASELINE_EVENT, (event) => {
      if (!(event instanceof MessageEvent)) return;
      const baseline = parseDraftBaseline(event.data as string);
      if (baseline === undefined || baseline.channelId !== activeChannelId) return;
      baselineSeen = true;
      draftCursor = baseline.revision;
      visibleDrafts = baseline.drafts.filter(
        (draft) => draft.channelId === baseline.channelId && draft.revision <= draftCursor,
      );
      activeAttempts = new Map(visibleDrafts.map((draft) => [draft.botSlug, draft.attemptId]));
      scheduleDrafts();
    });
    next.addEventListener(DRAFT_EVENT, (event) => {
      if (!(event instanceof MessageEvent)) return;
      const draft = parseDraft(event.data as string);
      if (draft === undefined || !acceptRevision(draft.channelId, draft.revision)) return;
      const previous = visibleDrafts.find((item) => item.draftId === draft.draftId);
      const priorAttempt = activeAttempts.get(draft.botSlug);
      if (
        (previous !== undefined && previous.attemptId !== draft.attemptId) ||
        (priorAttempt !== undefined && priorAttempt !== draft.attemptId)
      ) {
        void recover(draft.channelId);
        return;
      }
      activeAttempts.set(draft.botSlug, draft.attemptId);
      visibleDrafts = [...visibleDrafts.filter((item) => item.draftId !== draft.draftId), draft];
      store.setConversation({ draftNotice: undefined });
      scheduleDrafts();
    });
    const onLifecycle = (event: Event, abandoned: boolean): void => {
      if (!(event instanceof MessageEvent)) return;
      const ended = parseDraftLifecycle(event.data as string);
      if (ended === undefined || !acceptRevision(ended.channelId, ended.revision)) return;
      const ending = visibleDrafts.find((item) => item.draftId === ended.draftId);
      visibleDrafts = visibleDrafts.filter(
        (item) => item.draftId !== ended.draftId || item.attemptId !== ended.attemptId,
      );
      if ((!abandoned || ended.reason === 'expired') && ending !== undefined) {
        activeAttempts.delete(ending.botSlug);
      }
      scheduleDrafts();
      if (abandoned) showAbandoned(ended.reason);
    };
    next.addEventListener(DRAFT_SETTLED_EVENT, (event) => onLifecycle(event, false));
    next.addEventListener(DRAFT_ABANDONED_EVENT, (event) => onLifecycle(event, true));
    next.onerror = () => {
      if (next.readyState === 2 && activeChannelId === channel.id) {
        void recover(channel.id);
      } else if (activeChannelId === channel.id) {
        visibleDrafts = [];
        activeAttempts.clear();
        baselineSeen = false;
        scheduleDrafts();
      }
    };
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    disposed = true;
    unsubscribe();
    close();
  };
}

export function mountRosterLive(
  store: ClientStore,
  actions: BridgeActions,
  makeSource?: (url: string) => EventSource,
): () => void {
  let stopSource: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dragging = false;
  let deferred = false;
  let disposed = false;
  let refreshController: AbortController | undefined;

  const refresh = (): void => {
    timer = undefined;
    if (disposed || store.getSnapshot().mode !== 'bot') return;
    if (dragging) {
      deferred = true;
      return;
    }
    refreshController?.abort();
    const controller = new AbortController();
    refreshController = controller;
    void actions.refreshRoster(controller.signal).finally(() => {
      if (refreshController === controller) refreshController = undefined;
    });
  };
  const schedule = (): void => {
    if (dragging) {
      deferred = true;
      return;
    }
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(refresh, 60);
  };
  const onDragStart = (): void => {
    dragging = true;
  };
  const onDragEnd = (): void => {
    dragging = false;
    if (deferred) {
      deferred = false;
      schedule();
    }
  };
  const sync = (): void => {
    if (store.getSnapshot().mode === 'bot') {
      if (stopSource !== undefined) return;
      if (makeSource) {
        const source = makeSource('/api/botharness/stream?scope=roster');
        source.onopen = schedule;
        source.addEventListener('roster/changed', schedule);
        source.addEventListener('content/purged', (event) => {
          store.purgeContent(parseContentRedactions(event));
          schedule();
        });
        stopSource = () => source.close();
      } else
        stopSource = subscribeMessagingDefaults(schedule, (placements) => {
          store.purgeContent(placements);
          schedule();
        });
      return;
    }
    stopSource?.();
    stopSource = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    refreshController?.abort();
    refreshController = undefined;
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('dragstart', onDragStart, true);
    document.addEventListener('dragend', onDragEnd, true);
    document.addEventListener('drop', onDragEnd, true);
  }
  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    disposed = true;
    unsubscribe();
    stopSource?.();
    if (timer !== undefined) clearTimeout(timer);
    refreshController?.abort();
    refreshController = undefined;
    if (typeof document !== 'undefined') {
      document.removeEventListener('dragstart', onDragStart, true);
      document.removeEventListener('dragend', onDragEnd, true);
      document.removeEventListener('drop', onDragEnd, true);
    }
  };
}
