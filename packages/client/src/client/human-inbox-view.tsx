import { useCallback, useId, useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  HumanInboxFilter,
  HumanInboxSnoozeButton,
  HumanInboxSourceButton,
} from './human-inbox-controls.js';
import { canSnoozeHumanInboxItem } from './human-inbox-snooze.js';

import type { BridgeActions } from './actions.js';
import {
  openHumanAttentionSource,
  openRepairBotInbox as openRepairBotInboxFor,
} from './human-attention-source.js';
import { useClientState } from './bot-sidebar.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { store } from './store.js';
import type { HumanAttentionItem, HumanInboxCategory, HumanInboxFilters } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { webModalOpen } from './channel-shortcuts.js';
import { HumanInboxReply } from './human-inbox-reply.js';
import { Modal } from './modal.js';
import { HumanInboxDismiss } from './human-inbox-detail-controls.js';
import { HumanInboxWorkspaceAction } from './human-inbox-workspace-action.js';
import { useHumanActionScope } from './human-inbox-scope.js';
import { HumanInboxAssignment } from './human-inbox-assignment.js';

const categoryCopy = {
  unread: { title: 'humanInbox.unread', empty: 'humanInbox.empty.unread' },
  replies: { title: 'humanInbox.replies', empty: 'humanInbox.empty.replies' },
  action: { title: 'humanInbox.action', empty: 'humanInbox.empty.action' },
  info: { title: 'humanInbox.info', empty: 'humanInbox.empty.info' },
  handled: { title: 'humanInbox.handled', empty: 'humanInbox.empty.handled' },
} as const;

const itemKey = (item: HumanAttentionItem): string =>
  item.id + '\u0000' + (item.sourceEventId ?? '');

const acknowledgeable = (item: HumanAttentionItem): boolean =>
  item.kind === 'bot-dm-message' ||
  item.kind === 'assignment-report' ||
  item.kind === 'channel-unread' ||
  ((item.kind === 'channel-reply' || item.kind === 'channel-mention') && item.isUnread === true);

const batchApprovable = (item: HumanAttentionItem): boolean =>
  item.kind === 'tool-approval' &&
  item.category === 'action' &&
  item.channelId !== undefined &&
  item.messageId !== undefined;

export function HumanInboxView({
  actions: sourceActions,
  actionBotSlug,
  t = zhTranslate,
  embedded = false,
}: {
  actions: BridgeActions;
  actionBotSlug?: string;
  embedded?: boolean;
  t?: BotHarnessTranslate | undefined;
}): ReactElement {
  const state = useClientState();
  const scope = useHumanActionScope(sourceActions, actionBotSlug);
  const actions = scope.actions;
  const inbox =
    actionBotSlug === undefined
      ? state.humanInbox
      : {
          ...state.humanInbox,
          ...scope.page,
          category: 'action' as const,
          botSlug: actionBotSlug,
          channelId: undefined,
          sort: 'oldest' as const,
        };
  const detailId = useId();
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [replySource, setReplySource] = useState<HumanAttentionItem>();
  const [actionSource, setActionSource] = useState<HumanAttentionItem>();
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [cursor, setCursor] = useState<string>();
  const [snoozeMenu, setSnoozeMenu] = useState<string>();
  const [batchBusy, setBatchBusy] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const selectable = actionBotSlug === undefined;
  const selectedItems = inbox.items.filter((item) => selected.has(itemKey(item)));

  const openAction = (item: HumanAttentionItem): void => {
    if (item.kind === 'private-input') {
      void actions
        .openChannelAtMessage(item.channelId!, item.messageId!)
        .catch(() => setActionError(t('humanInbox.failed')));
      return;
    }
    if (actionBotSlug !== undefined) setActionSource(item);
    else setReplySource(item);
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    if (actionBotSlug !== undefined) return;
    const timer = window.setInterval(() => {
      if (store.getSnapshot().humanInbox.items.length <= 150)
        void actions.refreshHumanInbox(undefined, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [actions, actionBotSlug]);

  const botName = (slug: string): string =>
    state.bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
  const bots = [...state.bots].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
  const channels = state.channels
    .filter((channel) =>
      inbox.category === 'action'
        ? channel.type === 'group' || (channel.type === 'dm' && channel.botSlug !== undefined)
        : inbox.category === 'replies'
          ? channel.type === 'group'
          : inbox.category === 'unread'
            ? channel.type === 'group' || (channel.type === 'dm' && channel.botSlug !== undefined)
            : channel.type === 'dm' && channel.botSlug !== undefined,
    )
    .sort((left, right) => left.name.localeCompare(right.name));

  const openRepairBotInbox = (item: HumanAttentionItem): Promise<void> =>
    openRepairBotInboxFor(actions, item);
  const openSource = (item: HumanAttentionItem): Promise<void> =>
    openHumanAttentionSource(actions, item);

  const decide = async (item: HumanAttentionItem, accept: boolean): Promise<void> => {
    if (item.requestId === undefined || item.channelId === undefined) return;
    setBusyId(item.id);
    setActionError(undefined);
    try {
      if (!(await actions.decideGroupJoin(item.channelId, item.requestId, accept)))
        throw new Error(t('humanInbox.failed'));
      await actions.refreshHumanInbox();
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const acknowledge = async (item: HumanAttentionItem): Promise<void> => {
    if (item.kind === 'assignment-report') {
      if (item.sourceEventId === undefined) return;
    } else if (item.messageId === undefined || item.channelId === undefined) {
      return;
    }
    setBusyId(item.id);
    setActionError(undefined);
    try {
      if (item.kind === 'assignment-report') {
        await actions.ignoreHumanReport(item.sourceEventId!);
        await actions.refreshHumanInbox();
      } else {
        await actions.markRead(item.channelId!, item.messageId!);
      }
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const settle = async (item: HumanAttentionItem): Promise<void> => {
    if (!acknowledgeable(item)) await actions.dismissHumanInbox(item);
    else if (item.kind === 'assignment-report') {
      if (item.sourceEventId === undefined) throw new Error(t('humanInbox.failed'));
      await actions.ignoreHumanReport(item.sourceEventId);
      await actions.refreshHumanInbox();
    } else {
      if (item.channelId === undefined || item.messageId === undefined)
        throw new Error(t('humanInbox.failed'));
      await actions.markRead(item.channelId, item.messageId);
    }
  };

  const settleOne = async (item: HumanAttentionItem): Promise<void> => {
    setBusyId(item.id);
    setActionError(undefined);
    try {
      await settle(item);
      if (replySource !== undefined && itemKey(replySource) === itemKey(item))
        setReplySource(undefined);
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const snooze = async (item: HumanAttentionItem, until: string | null): Promise<void> => {
    setBusyId(item.id);
    setActionError(undefined);
    try {
      await actions.snoozeHumanInbox(item, until);
      if (replySource !== undefined && itemKey(replySource) === itemKey(item))
        setReplySource(undefined);
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const runBatch = async (run: (item: HumanAttentionItem) => Promise<unknown>): Promise<void> => {
    const items = selectedItems;
    setBatchBusy(true);
    setActionError(undefined);
    let failed = 0;
    for (const item of items) {
      try {
        await run(item);
      } catch {
        failed += 1;
      }
    }
    setSelected(new Set());
    setBatchBusy(false);
    if (failed > 0) setActionError(t('humanInbox.batch.failed', { count: String(failed) }));
    await actions.refreshHumanInbox().catch(() => undefined);
  };

  const toggleSelected = (item: HumanAttentionItem): void =>
    setSelected((current) => {
      const next = new Set(current);
      const key = itemKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const moveCursor = (index: number): void => {
    const item = inbox.items[index];
    if (item === undefined) return;
    setCursor(itemKey(item));
    const row = root.current?.querySelectorAll<HTMLElement>('.bh-human-inbox-row-open')[index];
    row?.focus();
    row?.scrollIntoView?.({ block: 'nearest' });
  };

  const toggleDetail = (item: HumanAttentionItem): void => {
    if (actionBotSlug !== undefined) {
      setActionSource(item);
      return;
    }
    setReplySource(
      replySource?.id === item.id && replySource.sourceEventId === item.sourceEventId
        ? undefined
        : item,
    );
  };

  keyHandler.current = (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.isComposing || webModalOpen(document)) return;
    const container = root.current;
    if (container === null || actionSource !== undefined) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target !== null && target !== document.body && !container.contains(target)) return;
    if (
      target?.closest(
        'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], .bh-human-inbox-detail',
      ) != null
    )
      return;
    const items = inbox.items;
    const index = items.findIndex((item) => itemKey(item) === cursor);
    const current = index < 0 ? undefined : items[index];
    const onRow =
      target === null || target === document.body || target.matches('.bh-human-inbox-row-open');
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === 'j') moveCursor(index < 0 ? 0 : Math.min(index + 1, items.length - 1));
    else if (key === 'k') moveCursor(index < 0 ? 0 : Math.max(index - 1, 0));
    else if (key === 'Enter' && onRow && current !== undefined)
      void openSource(current).catch(() => setActionError(t('humanInbox.failed')));
    else if (key === 'o' && current !== undefined) toggleDetail(current);
    else if (key === 'e' && current !== undefined && current.category !== 'handled')
      void settleOne(current);
    else if (key === 'x' && selectable && current !== undefined && current.category !== 'handled')
      toggleSelected(current);
    else if (key === 's' && selectable && current !== undefined && canSnoozeHumanInboxItem(current))
      setSnoozeMenu(itemKey(current));
    else if (key === 'Escape' && selected.size > 0) setSelected(new Set());
    else if (key === 'Escape' && replySource !== undefined) setReplySource(undefined);
    else return;
    event.preventDefault();
  };

  const keysMount = useMountedResource<HTMLDivElement>(() => {
    const listener = (event: KeyboardEvent): void => keyHandler.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);
  const scopeMount = scope.mount;
  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      (actionBotSlug === undefined ? mount : scopeMount)(node);
      keysMount(node);
    },
    [actionBotSlug, mount, scopeMount, keysMount],
  );

  const itemTitle = (item: HumanAttentionItem): string =>
    item.kind === 'channel-unread'
      ? (item.channelName ?? item.botSlug)
      : item.kind === 'group-join-request'
        ? t('humanInbox.groupJoin', {
            bot: botName(item.botSlug),
            channel: item.channelName ?? '',
          })
        : item.kind === 'private-input'
          ? t('humanInbox.privateInput', { bot: botName(item.botSlug) })
          : item.kind === 'user-question'
            ? t('humanInbox.question', { bot: botName(item.botSlug) })
            : item.kind === 'tool-approval'
              ? t('humanInbox.approval', { bot: botName(item.botSlug) })
              : item.kind === 'workspace-grant-request'
                ? t('humanInbox.grant', { bot: botName(item.botSlug) })
                : item.kind === 'assignment-waiting-human'
                  ? t('humanInbox.assignmentWaiting', { bot: botName(item.botSlug) })
                  : item.kind === 'assignment-blocked'
                    ? t('humanInbox.assignmentBlocked', {
                        bot: botName(item.botSlug),
                      })
                    : item.kind === 'assignment-report'
                      ? t('humanInbox.assignmentReport', {
                          bot: botName(item.botSlug),
                        })
                      : item.kind === 'bot-message-needs-repair'
                        ? t('humanInbox.repair', { bot: botName(item.botSlug) })
                        : botName(item.botSlug);

  const changeCategory = (category: HumanInboxCategory): void => {
    if (category === inbox.category) return;
    setActionError(undefined);
    setReplySource(undefined);
    setSelected(new Set());
    void actions.refreshHumanInbox(category);
  };

  const changeFilters = (filters: HumanInboxFilters): void => {
    setReplySource(undefined);
    setActionError(undefined);
    setSelected(new Set());
    void actions.setHumanInboxFilters(filters);
  };

  const renderSource = (source: HumanAttentionItem, onClose: () => void): ReactElement =>
    source.kind === 'assignment-waiting-human' || source.kind === 'assignment-blocked' ? (
      <HumanInboxAssignment
        key={source.assignmentSessionId + ':' + source.sourceEventId}
        source={source}
        actions={actions}
        t={t}
        botName={botName}
        bots={state.bots}
        onClose={onClose}
      />
    ) : source.channelId !== undefined && source.messageId !== undefined ? (
      <>
        <HumanInboxReply
          key={source.channelId + ':' + source.messageId}
          source={source}
          actions={actions}
          t={t}
          botName={botName}
          bots={state.bots}
          humanMembers={
            state.channels.find((channel) => channel.id === source.channelId)?.humanMembers ?? []
          }
          onClose={onClose}
        />
        {source.kind === 'bot-message-needs-repair' ? (
          <div className="bh-human-inbox-reply-actions">
            <Button
              variant="primary"
              size="sm"
              type="button"
              onClick={() =>
                void openRepairBotInbox(source).catch(() => setActionError(t('humanInbox.failed')))
              }
            >
              {t('humanInbox.openBotInbox')}
            </Button>
          </div>
        ) : null}
      </>
    ) : (
      <section className="bh-human-inbox-reply" aria-label={itemTitle(source)}>
        <div className="bh-human-inbox-reply-header">
          <h2>{itemTitle(source)}</h2>
          <HumanInboxDismiss source={source} actions={actions} t={t} onClose={onClose} />
        </div>
        <p>{source.summary}</p>
        <HumanInboxSourceButton
          item={source}
          bots={state.bots}
          channels={state.channels}
          t={t}
          onClick={() =>
            void openSource(source).catch(() => setActionError(t('humanInbox.failed')))
          }
        />
      </section>
    );

  return (
    <div
      className={
        actionBotSlug !== undefined
          ? 'bh-human-inbox bh-overview-actions'
          : embedded
            ? 'bh-human-inbox'
            : 'bh-root bh-main bh-human-inbox'
      }
      ref={rootRef}
    >
      <main
        className={
          'bh-human-inbox-inner' + (replySource === undefined ? '' : ' bh-human-inbox-with-context')
        }
      >
        {embedded ? null : <h1>{t('humanInbox.title')}</h1>}
        {actionBotSlug !== undefined ? null : (
          <>
            <div className="bh-human-inbox-tabs" role="tablist" aria-label={t('humanInbox.title')}>
              {(['unread', 'replies', 'action', 'info', 'handled'] as const).map((category) => (
                <button
                  key={category}
                  type="button"
                  role="tab"
                  aria-selected={inbox.category === category}
                  onClick={() => changeCategory(category)}
                >
                  {t(categoryCopy[category].title)}
                </button>
              ))}
            </div>
            {inbox.items.length <= 150 ? null : (
              <div role="status">
                <p>{t('humanInbox.refresh.paused')}</p>
                <button type="button" onClick={() => void actions.refreshHumanInbox()}>
                  {t('humanInbox.refresh.current')}
                </button>
              </div>
            )}
            <div className="bh-human-inbox-filters">
              {inbox.category === 'unread' ? null : (
                <HumanInboxFilter
                  label={t('humanInbox.filter.bot')}
                  value={inbox.botSlug ?? ''}
                  options={[
                    { id: '', label: t('humanInbox.filter.allBots') },
                    ...bots.map((bot) => ({ id: bot.slug, label: bot.displayName })),
                  ]}
                  onChange={(value) =>
                    changeFilters({
                      botSlug: value || undefined,
                      channelId: inbox.channelId,
                      sort: inbox.sort,
                    })
                  }
                />
              )}
              <HumanInboxFilter
                label={t('humanInbox.filter.channel')}
                value={inbox.channelId ?? ''}
                options={[
                  { id: '', label: t('humanInbox.filter.allChannels') },
                  ...channels.map((channel) => ({ id: channel.id, label: channel.name })),
                ]}
                onChange={(value) =>
                  changeFilters({
                    botSlug: inbox.botSlug,
                    channelId: value || undefined,
                    sort: inbox.sort,
                  })
                }
              />
              <HumanInboxFilter
                label={t('humanInbox.filter.sort')}
                value={inbox.sort}
                options={[
                  { id: 'newest', label: t('humanInbox.filter.newest') },
                  { id: 'oldest', label: t('humanInbox.filter.oldest') },
                ]}
                onChange={(value) =>
                  changeFilters({
                    botSlug: inbox.botSlug,
                    channelId: inbox.channelId,
                    sort: value === 'oldest' ? 'oldest' : 'newest',
                  })
                }
              />
              {inbox.category === 'unread' || inbox.category === 'handled' ? null : (
                <Button
                  variant="outline"
                  type="button"
                  className="bh-human-inbox-snoozed-toggle"
                  aria-pressed={inbox.snoozed}
                  onClick={() =>
                    changeFilters({
                      botSlug: inbox.botSlug,
                      channelId: inbox.channelId,
                      sort: inbox.sort,
                      snoozed: !inbox.snoozed,
                    })
                  }
                >
                  {t('humanInbox.snoozed')}
                </Button>
              )}
            </div>
          </>
        )}
        {actionBotSlug !== undefined && inbox.items.length > 150 ? (
          <div role="status">
            <p>{t('humanInbox.refresh.paused')}</p>
            <button type="button" onClick={() => void actions.refreshHumanInbox()}>
              {t('humanInbox.refresh.current')}
            </button>
          </div>
        ) : null}
        {actionError === undefined ? null : <p role="alert">{actionError}</p>}
        {inbox.error === undefined ? null : <p role="alert">{inbox.error}</p>}
        {inbox.status === 'loading' ? <p>{t('humanInbox.loading')}</p> : null}
        {inbox.status === 'ready' && inbox.items.length === 0 ? (
          <p>
            {t(
              inbox.snoozed && actionBotSlug === undefined
                ? 'humanInbox.empty.snoozed'
                : categoryCopy[inbox.category].empty,
            )}
          </p>
        ) : null}
        {selectable && inbox.items.some((item) => item.category !== 'handled') ? (
          <div
            className="bh-human-inbox-batch"
            role="toolbar"
            aria-label={t('humanInbox.batch.label')}
          >
            <label className="bh-human-inbox-batch-all">
              <input
                type="checkbox"
                className="bh-human-inbox-row-check"
                checked={
                  selectedItems.length > 0 &&
                  selectedItems.length ===
                    inbox.items.filter((item) => item.category !== 'handled').length
                }
                disabled={batchBusy}
                onChange={(event) =>
                  setSelected(
                    event.currentTarget.checked
                      ? new Set(
                          inbox.items.filter((item) => item.category !== 'handled').map(itemKey),
                        )
                      : new Set(),
                  )
                }
              />
              {selectedItems.length === 0
                ? t('humanInbox.batch.all')
                : t('humanInbox.batch.selected', { count: String(selectedItems.length) })}
            </label>
            {selectedItems.length === 0 ? null : (
              <>
                {selectedItems.every(batchApprovable) ? (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      disabled={batchBusy}
                      onClick={() =>
                        void runBatch((item) =>
                          actions.decideToolApproval(
                            item.channelId!,
                            item.messageId!,
                            'allowed-once',
                          ),
                        )
                      }
                    >
                      {t('humanInbox.batch.allow', { count: String(selectedItems.length) })}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      type="button"
                      disabled={batchBusy}
                      onClick={() =>
                        void runBatch((item) =>
                          actions.decideToolApproval(item.channelId!, item.messageId!, 'rejected'),
                        )
                      }
                    >
                      {t('humanInbox.batch.reject')}
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={batchBusy}
                  onClick={() => void runBatch(settle)}
                >
                  {t('humanInbox.batch.handle')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  disabled={batchBusy}
                  onClick={() => setSelected(new Set())}
                >
                  {t('humanInbox.batch.clear')}
                </Button>
              </>
            )}
          </div>
        ) : null}
        <div className="bh-human-inbox-workspace">
          <div role="list" className="bh-human-inbox-list">
            {inbox.items.map((item) => (
              <article
                key={item.id}
                role="listitem"
                data-attention-id={item.id}
                className={
                  'bh-human-inbox-row' +
                  (item.kind === 'channel-reply' || item.kind === 'channel-mention'
                    ? ' bh-human-inbox-personal-row'
                    : '')
                }
                data-selected={replySource?.id === item.id ? 'true' : undefined}
                data-checked={selected.has(itemKey(item)) || undefined}
                data-cursor={cursor === itemKey(item) || undefined}
              >
                <button
                  type="button"
                  className="bh-human-inbox-row-open"
                  aria-label={t('humanInbox.details', { title: itemTitle(item) })}
                  aria-expanded={replySource?.id === item.id}
                  aria-controls={replySource?.id === item.id ? detailId : undefined}
                  onFocus={() => setCursor(itemKey(item))}
                  onClick={() => toggleDetail(item)}
                />

                <div className="bh-human-inbox-row-title">
                  {selectable && item.category !== 'handled' ? (
                    <input
                      type="checkbox"
                      className="bh-human-inbox-row-check"
                      aria-label={t('humanInbox.batch.select', { title: itemTitle(item) })}
                      checked={selected.has(itemKey(item))}
                      disabled={batchBusy}
                      onChange={() => toggleSelected(item)}
                    />
                  ) : null}
                  {itemTitle(item)}
                </div>
                <div className="bh-human-inbox-row-main">
                  {item.kind === 'channel-reply' || item.kind === 'channel-mention' ? (
                    <div className="bh-human-inbox-unread-meta">
                      <span>{item.channelName}</span>
                      {item.kind === 'channel-mention' ? (
                        <>
                          {' · '}
                          <span className="bh-inline-mention">{t('humanInbox.mention')}</span>
                        </>
                      ) : null}
                      {' · '}
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                      {item.isUnread ? (
                        <span className="bh-human-inbox-message-target">
                          {t('humanInbox.reply.unread')}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {item.category === 'handled' ? (
                    <div className="bh-human-inbox-unread-meta">
                      {item.channelName}
                      {' · '}
                      <time dateTime={item.createdAt}>
                        {new Date(item.createdAt).toLocaleString()}
                      </time>
                    </div>
                  ) : null}
                  {item.kind === 'channel-unread' ? (
                    <div className="bh-human-inbox-unread-meta">
                      {t('humanInbox.unreadCount', { count: String(item.unreadCount ?? 0) })}
                      {' · '}
                      {new Date(item.createdAt).toLocaleString()}
                      <p className="bh-human-inbox-row-summary">{item.summary}</p>
                    </div>
                  ) : null}
                  {item.kind === 'channel-reply' ||
                  item.kind === 'channel-mention' ||
                  item.kind === 'bot-dm-message' ||
                  item.kind === 'user-question' ||
                  item.kind === 'private-input' ||
                  item.kind === 'tool-approval' ||
                  item.kind === 'workspace-grant-request' ||
                  item.kind === 'assignment-waiting-human' ||
                  item.kind === 'assignment-blocked' ||
                  item.kind === 'assignment-report' ||
                  item.kind === 'bot-message-needs-repair' ? (
                    <div className="bh-human-inbox-row-summary" title={item.summary}>
                      {item.summary}
                    </div>
                  ) : null}
                  {item.snoozedUntil === undefined ? null : (
                    <div className="bh-human-inbox-unread-meta">
                      <time dateTime={item.snoozedUntil}>
                        {t('humanInbox.snooze.until', {
                          time: new Date(item.snoozedUntil).toLocaleString(undefined, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          }),
                        })}
                      </time>
                    </div>
                  )}
                  {item.kind === 'bot-message-needs-repair' &&
                  (!item.channelName || !item.messageId) ? (
                    <div className="bh-human-inbox-row-summary">
                      {t(
                        item.channelId && item.channelName
                          ? 'humanInbox.messageUnavailable'
                          : 'humanInbox.sourceUnavailable',
                      )}
                    </div>
                  ) : null}
                </div>
                <div className="bh-human-inbox-row-actions">
                  {item.kind === 'channel-unread' ||
                  item.kind === 'channel-reply' ||
                  item.kind === 'channel-mention' ||
                  item.kind === 'tool-approval' ||
                  item.kind === 'user-question' ||
                  item.kind === 'private-input' ||
                  item.kind === 'workspace-grant-request' ||
                  item.kind === 'assignment-waiting-human' ||
                  item.kind === 'assignment-blocked' ? (
                    item.kind === 'workspace-grant-request' && item.category !== 'handled' ? (
                      <HumanInboxWorkspaceAction source={item} actions={actions} t={t} />
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        onClick={() => openAction(item)}
                      >
                        {t(
                          item.category === 'handled'
                            ? 'humanInbox.handled.context'
                            : item.kind === 'tool-approval'
                              ? 'humanInbox.approval.handle'
                              : item.kind === 'private-input'
                                ? 'humanInbox.privateInput.handle'
                                : item.kind === 'user-question'
                                  ? 'humanInbox.question.handle'
                                  : item.kind === 'workspace-grant-request'
                                    ? 'humanInbox.grant.handle'
                                    : item.kind === 'assignment-waiting-human' ||
                                        item.kind === 'assignment-blocked'
                                      ? 'humanInbox.assignment.handle'
                                      : 'humanInbox.reply',
                        )}
                      </Button>
                    )
                  ) : null}
                  {item.category === 'handled' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      onClick={() =>
                        void actions
                          .openChannelAtMessage(item.channelId!, item.responseMessageId!)
                          .catch(() => setActionError(t('humanInbox.failed')))
                      }
                    >
                      {t('humanInbox.handled.response')}
                    </Button>
                  ) : null}
                  {item.kind === 'group-join-request' ? (
                    <>
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item, true)}
                      >
                        {t('humanInbox.accept')}
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() => void decide(item, false)}
                      >
                        {t('humanInbox.decline')}
                      </Button>
                    </>
                  ) : item.kind === 'bot-dm-message' ||
                    item.kind === 'assignment-report' ||
                    item.kind === 'channel-unread' ||
                    ((item.kind === 'channel-reply' || item.kind === 'channel-mention') &&
                      item.isUnread) ? (
                    <Button
                      variant="primary"
                      size="sm"
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => void acknowledge(item)}
                    >
                      {t(
                        item.kind === 'assignment-report'
                          ? 'humanInbox.ignore'
                          : item.kind === 'channel-unread' ||
                              item.kind === 'channel-reply' ||
                              item.kind === 'channel-mention'
                            ? 'humanInbox.markRead'
                            : 'humanInbox.acknowledge',
                      )}
                    </Button>
                  ) : null}
                  {selectable && canSnoozeHumanInboxItem(item) ? (
                    <HumanInboxSnoozeButton
                      item={item}
                      t={t}
                      open={snoozeMenu === itemKey(item)}
                      disabled={busyId === item.id || batchBusy}
                      onOpenChange={(open) => setSnoozeMenu(open ? itemKey(item) : undefined)}
                      onSnooze={(until) => void snooze(item, until)}
                    />
                  ) : null}
                  <HumanInboxSourceButton
                    item={item}
                    bots={state.bots}
                    channels={state.channels}
                    t={t}
                    onClick={() =>
                      void openSource(item).catch(() => setActionError(t('humanInbox.failed')))
                    }
                  />
                </div>
              </article>
            ))}
          </div>
          {replySource === undefined ? null : (
            <div id={detailId} className="bh-human-inbox-detail">
              {renderSource(replySource, () => setReplySource(undefined))}
            </div>
          )}
        </div>
        {inbox.nextCursor === undefined ? null : (
          <button
            type="button"
            className="bh-human-inbox-more"
            onClick={() => void actions.loadMoreHumanInbox()}
          >
            {t('humanInbox.more')}
          </button>
        )}
        {actionSource === undefined ? null : (
          <Modal
            open
            title={itemTitle(actionSource)}
            closeLabel={t('common.close')}
            onClose={() => setActionSource(undefined)}
            className="bh-root bh-human-inbox-action-dialog"
            contentClassName="bh-human-inbox-action-dialog-content"
          >
            {renderSource(actionSource, () => setActionSource(undefined))}
          </Modal>
        )}
      </main>
    </div>
  );
}
