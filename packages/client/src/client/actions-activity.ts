import type {
  BotAttentionPage,
  HumanAttentionPage,
  ActivityListState,
  ChannelMessage,
  ClientStore,
  ConversationSelection,
  HumanAttentionItem,
  ActivityListCategory,
  ActivityListFilters,
} from './store.js';
import {
  errorMessage,
  loadBotAttention,
  loadHumanAttention,
  loadHumanAttentionStatus,
  loadChannelUnreadCounts,
  loadHumanAssignmentContext,
  type HumanAssignmentContext,
  ignoreHumanAssignmentReport,
  dismissActivityListItem,
  dismissAllActivityListItems,
  overrideAutoRejection,
  snoozeActivityListItem,
  type TimelinePage,
  type TimelinePageRequest,
  loadTimelinePage,
  markReadPosition,
  markAllReadPositions,
  sendChannelMessage,
  type BridgeCall,
} from './bridge.js';
import type { BridgeActions } from './actions.js';
import type { createSessionActions } from './actions-sessions.js';

export interface ActivityActions {
  refreshBotInbox(slug: string): Promise<void>;
  openActivityCenter(): Promise<void>;
  attachActivityCenterPanel(): () => void;
  activityPage(
    category: ActivityListCategory,
    filters: ActivityListFilters & { search?: string; mentionsFirst?: boolean },
    cursor?: string,
  ): Promise<HumanAttentionPage>;
  openActivityList(): Promise<void>;
  refreshActivityListStatus(): Promise<void>;
  refreshActivityList(category?: ActivityListCategory, background?: boolean): Promise<void>;
  setActivityListFilters(filters: ActivityListFilters): Promise<void>;
  loadMoreActivityList(): Promise<void>;
  dismissActivityList(item: HumanAttentionItem): Promise<void>;
  dismissAllActivityList(filter: {
    kind?: HumanAttentionItem['kind'] | undefined;
    categories: ReadonlyArray<'action' | 'info' | 'replies' | 'unread'>;
    botSlug?: string | undefined;
    channelId?: string | undefined;
  }): Promise<{ dismissed: number; more: boolean }>;
  allowAutoRejectionOnce(item: HumanAttentionItem): Promise<void>;
  snoozeActivityList(item: HumanAttentionItem, until: string | null): Promise<void>;
  activityListContextPage(
    channelId: string,
    request: TimelinePageRequest,
    signal?: AbortSignal,
  ): Promise<TimelinePage>;
  ignoreHumanReport(sourceEventId: string): Promise<void>;
  loadMoreBotInbox(slug: string): Promise<void>;
  botInboxPage(slug: string, cursor?: string): Promise<BotAttentionPage>;
  activityListContext(
    channelId: string,
    messageId: string,
    signal?: AbortSignal,
  ): Promise<ChannelMessage[]>;
  replyFromActivityList(
    channelId: string,
    messageId: string,
    body: string,
    clientMessageId: string,
  ): Promise<ChannelMessage>;
  humanAssignmentContext(
    slug: string,
    sessionId: string,
    sourceEventId: string,
    signal?: AbortSignal,
  ): Promise<HumanAssignmentContext>;
  replyToHumanAssignment(
    slug: string,
    sessionId: string,
    sourceEventId: string,
    body: string,
    clientMessageId: string,
  ): Promise<ChannelMessage>;
  markAllRead(scope?: {
    channelId?: string | undefined;
    botSlug?: string | undefined;
  }): Promise<void>;
  markRead(channelId: string, messageId: string): Promise<void>;
}

export function createActivityActions(
  call: BridgeCall,
  clientStore: ClientStore,
  getActions: () => Pick<
    BridgeActions,
    'openActivityList' | 'telemetryEvent' | 'refreshActivityList' | 'refreshActivityListStatus'
  >,
  currentSelection: ReturnType<typeof createSessionActions>['currentSelection'],
) {
  let botInboxRequestSeq = 0;
  const loadBotInboxFor = async (
    slug: string,
    selection: ConversationSelection,
    cursor?: string,
  ): Promise<void> => {
    const requestSeq = ++botInboxRequestSeq;
    if (cursor === undefined && clientStore.getSnapshot().botInbox.status === 'idle')
      clientStore.setBotInbox({ status: 'loading', error: undefined });
    try {
      const page = await loadBotAttention(call, slug, 50, cursor);
      if (currentSelection() !== selection || requestSeq !== botInboxRequestSeq) return;
      const priorState = clientStore.getSnapshot().botInbox;
      const prior = priorState.items;
      const seen = new Set(page.items.map((item) => item.id));
      const items =
        cursor === undefined
          ? [...page.items, ...prior.filter((item) => !seen.has(item.id))]
          : [...prior, ...page.items.filter((item) => !prior.some((seen) => seen.id === item.id))];
      const nextCursor =
        cursor === undefined && prior.length > 50 ? priorState.nextCursor : page.nextCursor;
      clientStore.setBotInbox({
        status: 'ready',
        items,
        nextCursor,
        error: undefined,
      });
    } catch (error) {
      if (currentSelection() !== selection || requestSeq !== botInboxRequestSeq) return;
      clientStore.setBotInbox({ status: 'error', error: errorMessage(error) });
    }
  };
  let activityPanelScope: object | undefined;
  const activityListScope = (): object | undefined => {
    const selection = currentSelection();
    return selection?.kind === 'inbox' ? selection : activityPanelScope;
  };
  let activityListHeadSeq = 0;
  let activityListPageSeq = 0;
  let activityListPagesPending = 0;
  let activityListScopeVersion = 0;
  const loadInboxStatus = async (): Promise<
    Partial<
      Pick<
        ActivityListState,
        'unreadCount' | 'hasAction' | 'channelUnread' | 'messageCounts' | 'attentionStatus'
      >
    >
  > => {
    const [status, channelUnread] = await Promise.allSettled([
      loadHumanAttentionStatus(call),
      loadChannelUnreadCounts(call),
    ]);
    if (status.status === 'rejected') throw status.reason;
    return {
      ...status.value,
      attentionStatus: 'ready',
      ...(channelUnread.status === 'fulfilled' ? { channelUnread: channelUnread.value } : {}),
    };
  };
  let activityListStatusReading: Promise<void> | undefined;
  let activityListStatusAgain = false;
  const readActivityListStatus = async (): Promise<void> => {
    try {
      const status = await loadInboxStatus();
      if (!activityListStatusAgain) clientStore.setActivityList(status);
    } catch {
      if (!activityListStatusAgain) clientStore.setActivityList({ attentionStatus: 'error' });
    }
  };
  const refreshActivityListStatus = (): Promise<void> => {
    if (activityListStatusReading !== undefined) {
      activityListStatusAgain = true;
      return activityListStatusReading;
    }
    activityListStatusReading = (async () => {
      try {
        do {
          activityListStatusAgain = false;
          await readActivityListStatus();
        } while (activityListStatusAgain);
      } finally {
        activityListStatusReading = undefined;
      }
    })();
    return activityListStatusReading;
  };
  const loadActivityListFor = async (
    category: ActivityListCategory,
    scope: object,
    cursor?: string,
    retainedCount = clientStore.getSnapshot().activityList.items.length,
    background = false,
  ): Promise<void> => {
    const head = cursor === undefined;
    const requestSeq = head ? ++activityListHeadSeq : ++activityListPageSeq;
    const scopeVersion = activityListScopeVersion;
    const headVersion = activityListHeadSeq;
    const { botSlug, channelId, sort, snoozed } = clientStore.getSnapshot().activityList;
    const isCurrent = (): boolean =>
      activityListScope() === scope &&
      scopeVersion === activityListScopeVersion &&
      requestSeq === (head ? activityListHeadSeq : activityListPageSeq);
    if (cursor === undefined && clientStore.getSnapshot().activityList.status === 'idle')
      clientStore.setActivityList({ status: 'loading', error: undefined });
    try {
      const page = await loadHumanAttention(call, category, 50, cursor, {
        botSlug,
        channelId,
        sort,
        snoozed,
      });
      if (!isCurrent()) return;
      const priorState = clientStore.getSnapshot().activityList;
      if (priorState.category !== category) return;
      const prior = priorState.items;
      if (background && (activityListPagesPending > 0 || prior.length > 150)) return;
      if (!head && headVersion !== activityListHeadSeq) {
        await loadActivityListFor(category, scope, undefined, prior.length + page.items.length);
        return;
      }
      let canonicalItems = page.items;
      let nextCursor = page.nextCursor;

      const desiredCount = Math.min(150, Math.max(retainedCount, prior.length));
      for (
        let pageNumber = 1;
        head &&
        nextCursor !== undefined &&
        canonicalItems.length < desiredCount &&
        pageNumber < Math.ceil(desiredCount / 50);
        pageNumber++
      ) {
        const older = await loadHumanAttention(call, category, 50, nextCursor, {
          botSlug,
          channelId,
          sort,
          snoozed,
        });
        if (!isCurrent()) return;
        const seen = new Set(canonicalItems.map((item) => item.id));
        canonicalItems = [...canonicalItems, ...older.items.filter((item) => !seen.has(item.id))];
        nextCursor = older.nextCursor;
      }
      if (!isCurrent()) return;
      if (
        background &&
        (activityListPagesPending > 0 || clientStore.getSnapshot().activityList.items.length > 150)
      )
        return;
      const items = head
        ? canonicalItems
        : [
            ...prior,
            ...canonicalItems.filter((item) => !prior.some((seen) => seen.id === item.id)),
          ];
      clientStore.setActivityList({
        status: 'ready',
        items,
        nextCursor,
        error: undefined,
      });
    } catch (error) {
      if (!isCurrent() || clientStore.getSnapshot().activityList.category !== category) return;
      clientStore.setActivityList({
        status: 'error',
        error: errorMessage(error),
      });
    }
  };
  const settleNativeInboxAction = async (
    kind: 'tool-approval' | 'user-question' | 'workspace-grant-request',
    channelId: string,
    messageId: string,
    submit: () => Promise<void>,
    loadStatus: () => Promise<'pending' | 'submitted' | 'answered' | 'expired' | 'stopped'>,
  ): Promise<void> => {
    let resolved = false;
    try {
      await submit();
      resolved = true;
    } finally {
      if (!resolved) {
        try {
          const status = await loadStatus();
          resolved = status === 'expired' || status === 'stopped' || status === 'answered';
        } catch {}
      }
      if (resolved)
        clientStore.setActivityList({
          items: clientStore
            .getSnapshot()
            .activityList.items.filter(
              (item) =>
                item.kind !== kind || item.channelId !== channelId || item.messageId !== messageId,
            ),
        });
      const scope = activityListScope();
      await Promise.allSettled([
        refreshActivityListStatus(),
        ...(scope !== undefined
          ? [loadActivityListFor(clientStore.getSnapshot().activityList.category, scope)]
          : []),
      ]);
    }
  };

  const actions = {
    refreshBotInbox(slug) {
      const selection = currentSelection();
      if (selection?.kind !== 'bot' || selection.slug !== slug) return Promise.resolve();
      return loadBotInboxFor(slug, selection);
    },
    loadMoreBotInbox(slug) {
      const selection = currentSelection();
      const cursor = clientStore.getSnapshot().botInbox.nextCursor;
      if (selection?.kind !== 'bot' || selection.slug !== slug || cursor === undefined)
        return Promise.resolve();
      return loadBotInboxFor(slug, selection, cursor);
    },
    openActivityCenter() {
      return getActions().openActivityList();
    },
    attachActivityCenterPanel() {
      const scope = {};
      activityPanelScope = scope;
      activityListScopeVersion += 1;
      return () => {
        if (activityPanelScope !== scope) return;
        activityPanelScope = undefined;
        activityListScopeVersion += 1;
      };
    },
    botInboxPage: (slug, cursor) => loadBotAttention(call, slug, 50, cursor),
    activityPage: (category, filters, cursor) =>
      loadHumanAttention(call, category, 50, cursor, filters),
    openActivityList() {
      clientStore.select({ kind: 'inbox' });
      getActions().telemetryEvent('activity:inbox_open');
      void refreshActivityListStatus();
      const scope = activityListScope();
      if (scope === undefined) return Promise.resolve();
      return loadActivityListFor(clientStore.getSnapshot().activityList.category, scope);
    },
    refreshActivityListStatus,
    refreshActivityList(category, background = false) {
      const scope = activityListScope();
      if (scope === undefined) return Promise.resolve();
      const prior = clientStore.getSnapshot().activityList;
      if (background && (activityListPagesPending > 0 || prior.items.length > 150))
        return Promise.resolve();
      const nextCategory = category ?? prior.category;
      if (nextCategory !== prior.category) {
        activityListScopeVersion += 1;
        clientStore.setActivityList({
          category: nextCategory,
          sort: nextCategory === 'action' ? 'oldest' : 'newest',
          botSlug: nextCategory === 'unread' ? undefined : prior.botSlug,
          channelId: undefined,
          snoozed: nextCategory === 'unread' || nextCategory === 'handled' ? false : prior.snoozed,
          status: 'loading',
          items: [],
          nextCursor: undefined,
          error: undefined,
        });
      }
      return loadActivityListFor(nextCategory, scope, undefined, prior.items.length, background);
    },
    setActivityListFilters(filters) {
      const scope = activityListScope();
      if (scope === undefined) return Promise.resolve();
      const prior = clientStore.getSnapshot().activityList;
      if (
        prior.botSlug === filters.botSlug &&
        prior.channelId === filters.channelId &&
        prior.sort === filters.sort &&
        prior.snoozed === (filters.snoozed ?? prior.snoozed)
      )
        return Promise.resolve();
      activityListScopeVersion += 1;
      clientStore.setActivityList({
        ...filters,
        snoozed: filters.snoozed ?? prior.snoozed,
        status: 'loading',
        items: [],
        nextCursor: undefined,
        error: undefined,
      });
      return loadActivityListFor(prior.category, scope);
    },
    loadMoreActivityList() {
      const scope = activityListScope();
      const state = clientStore.getSnapshot().activityList;
      if (scope === undefined || state.nextCursor === undefined) return Promise.resolve();
      activityListPagesPending += 1;
      return loadActivityListFor(state.category, scope, state.nextCursor).finally(() => {
        activityListPagesPending -= 1;
      });
    },
    async allowAutoRejectionOnce(item) {
      await overrideAutoRejection(call, item.id);
      activityListScopeVersion += 1;
      activityListHeadSeq += 1;
      activityListPageSeq += 1;
      const state = clientStore.getSnapshot().activityList;
      clientStore.setActivityList({
        items: state.items.filter(
          (entry) => entry.id !== item.id || entry.sourceEventId !== item.sourceEventId,
        ),
      });
      void Promise.all([
        getActions().refreshActivityList(),
        getActions().refreshActivityListStatus(),
      ]).catch(() => undefined);
    },
    async dismissActivityList(item) {
      await dismissActivityListItem(call, item.id, item.sourceEventId ?? '');
      getActions().telemetryEvent('activity:inbox_item_dismiss');
      activityListScopeVersion += 1;
      activityListHeadSeq += 1;
      activityListPageSeq += 1;
      const state = clientStore.getSnapshot().activityList;
      clientStore.setActivityList({
        items: state.items.filter(
          (entry) => entry.id !== item.id || entry.sourceEventId !== item.sourceEventId,
        ),
      });
      void Promise.all([
        getActions().refreshActivityList(),
        getActions().refreshActivityListStatus(),
      ]).catch(() => undefined);
    },
    async dismissAllActivityList(filter) {
      let dismissed = 0;
      let more = false;
      try {
        for (const category of filter.categories) {
          const result = await dismissAllActivityListItems(call, {
            kind: filter.kind,
            category,
            botSlug: filter.botSlug,
            channelId: filter.channelId,
          });
          dismissed += result.dismissed;
          more ||= result.more;
        }
      } finally {
        activityListScopeVersion += 1;
        activityListHeadSeq += 1;
        activityListPageSeq += 1;
        void Promise.all([
          getActions().refreshActivityList(),
          getActions().refreshActivityListStatus(),
        ]).catch(() => undefined);
      }
      return { dismissed, more };
    },
    async activityListContextPage(channelId, request, signal) {
      const { page } = await loadTimelinePage(call, channelId, request, signal);
      if (
        request.direction === 'around' &&
        !page.entries.some(
          (message) => message.id === request.around && !message.pending && !message.failed,
        )
      )
        throw new Error('Source message is no longer available');
      return page;
    },
    async snoozeActivityList(item, until) {
      await snoozeActivityListItem(call, item.id, item.sourceEventId ?? '', until);
      getActions().telemetryEvent('activity:inbox_item_snooze');
      activityListScopeVersion += 1;
      activityListHeadSeq += 1;
      activityListPageSeq += 1;
      const state = clientStore.getSnapshot().activityList;
      clientStore.setActivityList({
        items: state.items.filter(
          (entry) => entry.id !== item.id || entry.sourceEventId !== item.sourceEventId,
        ),
      });
      void Promise.all([
        getActions().refreshActivityList(),
        getActions().refreshActivityListStatus(),
      ]).catch(() => undefined);
    },
    async ignoreHumanReport(sourceEventId) {
      await ignoreHumanAssignmentReport(call, sourceEventId);
      activityListScopeVersion += 1;
      activityListHeadSeq += 1;
      activityListPageSeq += 1;
      const state = clientStore.getSnapshot().activityList;
      clientStore.setActivityList({
        items: state.items.filter((item) => item.sourceEventId !== sourceEventId),
      });
    },
    async activityListContext(channelId, messageId, signal) {
      const { page } = await loadTimelinePage(
        call,
        channelId,
        {
          direction: 'around',
          around: messageId,
          olderLimit: 2,
          newerLimit: 2,
        },
        signal,
      );
      if (
        !page.entries.some(
          (message) => message.id === messageId && !message.pending && !message.failed,
        )
      )
        throw new Error('Source message is no longer available');
      return page.entries;
    },
    async replyFromActivityList(channelId, messageId, body, clientMessageId) {
      const text = body.trim();
      const message = await sendChannelMessage(
        call,
        channelId,
        text,
        messageId,
        undefined,
        clientMessageId,
      );
      if (
        message.id !== clientMessageId ||
        message.replyTo !== messageId ||
        message.body !== text ||
        message.author.kind !== 'human'
      )
        throw new Error('Channel reply could not be confirmed');
      getActions().telemetryEvent('activity:inbox_reply_send', {
        target: 'message',
      });
      return message;
    },
    async markAllRead(scope) {
      try {
        await markAllReadPositions(call, scope);
      } catch (error) {
        await refreshActivityListStatus();
        throw error;
      }
      await refreshActivityListStatus();
      if (activityListScope() !== undefined) await getActions().refreshActivityList();
    },
    async markRead(channelId, messageId) {
      await markReadPosition(call, channelId, messageId);
      await refreshActivityListStatus();
      if (activityListScope() !== undefined) await getActions().refreshActivityList();
    },
    humanAssignmentContext(slug, sessionId, sourceEventId, signal) {
      return loadHumanAssignmentContext(call, slug, sessionId, sourceEventId, signal);
    },
    async replyToHumanAssignment(slug, sessionId, sourceEventId, body, clientMessageId) {
      try {
        const text = body.trim();
        const message = await sendChannelMessage(
          call,
          'dm-' + slug,
          text,
          undefined,
          undefined,
          clientMessageId,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          { sessionId, sourceEventId },
        );
        if (
          message.id !== clientMessageId ||
          message.author.kind !== 'human' ||
          message.body !== text ||
          message.assignmentReply?.sessionId !== sessionId ||
          message.assignmentReply.sourceEventId !== sourceEventId
        )
          throw new Error('Assignment response could not be confirmed');
        getActions().telemetryEvent('activity:inbox_reply_send', {
          target: 'assignment',
        });
        return message;
      } finally {
        await Promise.allSettled([
          refreshActivityListStatus(),
          ...(activityListScope() !== undefined ? [getActions().refreshActivityList()] : []),
        ]);
      }
    },
  } satisfies ActivityActions;
  return { actions, loadBotInboxFor, settleNativeInboxAction };
}
