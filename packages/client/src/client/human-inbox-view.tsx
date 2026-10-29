import { ActivityApproval, useActivityRows } from './activity-approval.js';
import { PanelEmptyState } from './ds/empty-state.js';
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { HumanInboxSnoozeButton, HumanInboxSourceButton } from './human-inbox-controls.js';
import { canSnoozeHumanInboxItem } from './human-inbox-snooze.js';

import type { BridgeActions } from './actions.js';
import {
  openHumanAttentionSource,
  openRepairBotInbox as openRepairBotInboxFor,
} from './human-attention-source.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import type { ClientState, HumanAttentionItem } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { keepClientState, sameBotFaces, useClientStore } from './use-client-store.js';
import { webModalOpen } from './channel-shortcuts.js';
import { HumanInboxReply } from './human-inbox-reply.js';
import { HumanInboxDismiss } from './human-inbox-detail-controls.js';
import { HumanInboxWorkspaceAction } from './human-inbox-workspace-action.js';
import { HumanInboxAssignment } from './human-inbox-assignment.js';
import {
  AllowAutoRejectionButton,
  HumanInboxAutoRejection,
  autoRejectionMeta,
} from './human-inbox-auto-rejection.js';

const categoryCopy = {
  unread: { title: 'humanInbox.unread', empty: 'humanInbox.empty.unread' },
  replies: { title: 'humanInbox.replies', empty: 'humanInbox.empty.replies' },
  action: { title: 'humanInbox.action', empty: 'humanInbox.empty.action' },
  info: { title: 'humanInbox.info', empty: 'humanInbox.empty.info' },
  handled: { title: 'humanInbox.handled', empty: 'humanInbox.empty.handled' },
} as const;

const overrideInputs = (left: ClientState, right: ClientState): boolean =>
  left.channels === right.channels && sameBotFaces(left.bots, right.bots);
const inboxInputs = (left: ClientState, right: ClientState): boolean =>
  left.humanInbox === right.humanInbox && overrideInputs(left, right);

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

export type HumanInboxCommands = Pick<
  BridgeActions,
  | 'decideGroupJoin'
  | 'refreshHumanInbox'
  | 'ignoreHumanReport'
  | 'markRead'
  | 'dismissHumanInbox'
  | 'snoozeHumanInbox'
  | 'decideToolApproval'
  | 'openChannelAtMessage'
  | 'allowAutoRejectionOnce'
>;

export interface HumanInboxSource {
  commands: HumanInboxCommands;
  detail(item: HumanAttentionItem, onClose: () => void): ReactElement;
  botName(slug: string): string;
  isDirect(channelId: string | undefined): boolean;
  open(item: HumanAttentionItem): Promise<void>;
  sourceButton(item: HumanAttentionItem, onOpen: () => void): ReactNode;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
}

export function HumanInboxView({
  actions,
  t = zhTranslate,
  inboxOverride,
  emptyMessage,
  sectionHeading,
  collapsed = false,
  hostSource,
}: {
  inboxOverride?: import('./store.js').HumanInboxState;
  sectionHeading?: ReactNode;
  emptyMessage?: string | undefined;
  collapsed?: boolean;
  t?: BotHarnessTranslate | undefined;
} & (
  | { actions: BridgeActions; hostSource?: never }
  | { actions?: never; hostSource: HumanInboxSource }
)): ReactElement {
  const state = useClientStore(
    keepClientState,
    inboxOverride === undefined ? inboxInputs : overrideInputs,
  );
  const inbox = inboxOverride ?? state.humanInbox;
  const [selectionMode, setSelectionMode] = useState(false);
  const detailId = useId();
  const [busyId, setBusyId] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [replySource, setReplySource] = useState<HumanAttentionItem>();
  const replyRows = useMemo(
    () =>
      replySource &&
      ['channel-unread', 'channel-reply', 'channel-mention'].includes(replySource.kind) &&
      !inbox.items.some((item) => itemKey(item) === itemKey(replySource))
        ? [...inbox.items, replySource]
        : inbox.items,
    [inbox.items, replySource],
  );
  const retained = useActivityRows(
    replyRows,
    JSON.stringify([inbox.category, inbox.botSlug, inbox.channelId, inbox.sort, inbox.snoozed]),
    !selectionMode,
  );

  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [cursor, setCursor] = useState<string>();
  const [snoozeMenu, setSnoozeMenu] = useState<string>();
  const [batchBusy, setBatchBusy] = useState(false);
  const root = useRef<HTMLDivElement | null>(null);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);
  const selectable = selectionMode;
  const commands = hostSource?.commands ?? actions!;
  const selectedItems = inbox.items.filter((item) => selected.has(itemKey(item)));

  const openAction = (item: HumanAttentionItem): void => {
    if (
      hostSource !== undefined &&
      item.kind !== 'tool-approval' &&
      item.kind !== 'user-question'
    ) {
      void hostSource.open(item).catch(() => setActionError(t('humanInbox.failed')));
      return;
    }
    if (item.kind === 'private-input') {
      void commands
        .openChannelAtMessage(item.channelId!, item.messageId!)
        .catch(() => setActionError(t('humanInbox.failed')));
      return;
    }
    setReplySource(item);
  };

  const botName = (slug: string): string =>
    hostSource === undefined
      ? (state.bots.find((bot) => bot.slug === slug)?.displayName ?? slug)
      : hostSource.botName(slug);
  const bots = [...state.bots].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
  const openRepairBotInbox = (item: HumanAttentionItem): Promise<void> =>
    hostSource === undefined ? openRepairBotInboxFor(actions, item) : hostSource.open(item);
  const openSource = (item: HumanAttentionItem): Promise<void> =>
    hostSource === undefined ? openHumanAttentionSource(actions, item) : hostSource.open(item);

  const decide = async (item: HumanAttentionItem, accept: boolean): Promise<void> => {
    if (item.requestId === undefined || item.channelId === undefined) return;
    setBusyId(item.id);
    setActionError(undefined);
    try {
      if (!(await commands.decideGroupJoin(item.channelId, item.requestId, accept)))
        throw new Error(t('humanInbox.failed'));
      await commands.refreshHumanInbox();
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
        await commands.ignoreHumanReport(item.sourceEventId!);
        await commands.refreshHumanInbox();
      } else {
        await commands.markRead(item.channelId!, item.messageId!);
      }
    } catch {
      setActionError(t('humanInbox.failed'));
    } finally {
      setBusyId(undefined);
    }
  };

  const settle = async (item: HumanAttentionItem): Promise<void> => {
    if (!acknowledgeable(item)) await commands.dismissHumanInbox(item);
    else if (item.kind === 'assignment-report') {
      if (item.sourceEventId === undefined) throw new Error(t('humanInbox.failed'));
      await commands.ignoreHumanReport(item.sourceEventId);
      await commands.refreshHumanInbox();
    } else {
      if (item.channelId === undefined || item.messageId === undefined)
        throw new Error(t('humanInbox.failed'));
      await commands.markRead(item.channelId, item.messageId);
    }
  };

  const settleOne = async (item: HumanAttentionItem, clear = false): Promise<void> => {
    setBusyId(item.id);
    setActionError(undefined);
    try {
      if (clear) await commands.dismissHumanInbox(item);
      else await settle(item);
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
      await commands.snoozeHumanInbox(item, until);
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
    await commands.refreshHumanInbox().catch(() => undefined);
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
    const row = root.current?.querySelectorAll<HTMLElement>(
      '.bh-human-inbox-row-open, .bh-activity-context-toggle',
    )[index];
    row?.focus();
    row?.scrollIntoView?.({ block: 'nearest' });
  };

  const toggleDetail = (item: HumanAttentionItem): void => {
    setReplySource(
      replySource?.id === item.id && replySource.sourceEventId === item.sourceEventId
        ? undefined
        : item,
    );
  };

  keyHandler.current = (event) => {
    if (
      event.target instanceof Element &&
      event.target.closest('.bh-tool-approval-card, .bh-human-inbox-reply')
    )
      return;
    if (collapsed) return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.isComposing || webModalOpen(document)) return;
    const container = root.current;
    if (container === null) return;
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
  const rootRef = useCallback(
    (node: HTMLDivElement | null) => {
      root.current = node;
      keysMount(node);
    },
    [keysMount],
  );

  const itemTitle = (item: HumanAttentionItem): string =>
    item.kind === 'channel-unread'
      ? (
          hostSource === undefined
            ? state.channels.find((channel) => channel.id === item.channelId)?.type === 'dm'
            : hostSource.isDirect(item.channelId)
        )
        ? botName(item.botSlug)
        : (item.channelName ?? botName(item.botSlug))
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
              : item.kind === 'auto-rejection'
                ? t('humanInbox.autoRejection', { bot: botName(item.botSlug) })
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

  const renderSource = (source: HumanAttentionItem, onClose: () => void): ReactElement =>
    hostSource !== undefined ? (
      hostSource.detail(source, onClose)
    ) : source.kind === 'auto-rejection' ? (
      <HumanInboxAutoRejection
        key={source.id}
        source={source}
        actions={actions}
        t={t}
        title={itemTitle(source)}
        onClose={onClose}
      />
    ) : source.kind === 'assignment-waiting-human' || source.kind === 'assignment-blocked' ? (
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
    <div className="bh-human-inbox" ref={rootRef}>
      <main className="bh-human-inbox-inner bh-activity-inbox">
        <div className="bh-activity-toolbar">
          <h2>
            {sectionHeading ??
              t(
                inbox.category === 'action'
                  ? 'activityInbox.needsYou'
                  : categoryCopy[inbox.category].title,
              )}
          </h2>
          {!collapsed && inbox.items.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={selectionMode}
              disabled={batchBusy}
              onClick={() => {
                setSelectionMode(!selectionMode);
                setSelected(new Set());
              }}
            >
              {t(selectionMode ? 'common.cancel' : 'activityInbox.select')}
            </Button>
          ) : null}
        </div>
        <div hidden={collapsed}>
          {actionError === undefined ? null : <p role="alert">{actionError}</p>}
          {inbox.error === undefined ? null : (
            <div role="alert">
              <p>{inbox.error}</p>
              <Button
                size="sm"
                onClick={() => void (hostSource?.refresh() ?? commands.refreshHumanInbox())}
              >
                {t('activityInbox.retry')}
              </Button>
            </div>
          )}
          {inbox.status === 'loading' ? <p>{t('humanInbox.loading')}</p> : null}
          {inbox.status === 'ready' && inbox.items.length === 0 ? (
            sectionHeading ? (
              <p className="bh-activity-section-empty" role="status">
                {emptyMessage ??
                  t(
                    inbox.snoozed ? 'humanInbox.empty.snoozed' : categoryCopy[inbox.category].empty,
                  )}
              </p>
            ) : (
              <PanelEmptyState icon="bell">
                {t(inbox.snoozed ? 'humanInbox.empty.snoozed' : categoryCopy[inbox.category].empty)}
              </PanelEmptyState>
            )
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
                            commands.decideToolApproval(
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
                            commands.decideToolApproval(
                              item.channelId!,
                              item.messageId!,
                              'rejected',
                            ),
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
            <div ref={retained.mount} role="list" tabIndex={-1} className="bh-human-inbox-list">
              {(!selectionMode
                ? retained.rows
                : inbox.items.map((item) => ({ item, leaving: false }))
              ).map(({ item, leaving }) =>
                hostSource === undefined &&
                item.kind === 'tool-approval' &&
                item.category === 'action' &&
                item.channelId &&
                item.messageId &&
                !selectionMode ? (
                  <ActivityApproval
                    key={item.id}
                    source={item}
                    actions={actions}
                    bots={state.bots}
                    t={t}
                    leaving={leaving}
                    onFocus={() => setCursor(itemKey(item))}
                  />
                ) : (
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
                      {item.kind === 'auto-rejection' ? (
                        <div
                          className="bh-human-inbox-row-summary"
                          title={
                            autoRejectionMeta(item, t) +
                            ' · ' +
                            (item.autoRejection?.reason ?? item.summary)
                          }
                        >
                          {autoRejectionMeta(item, t) +
                            ' · ' +
                            (item.autoRejection?.reason ?? item.summary)}
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
                      <>
                        {item.kind === 'channel-unread' ||
                        item.kind === 'channel-reply' ||
                        item.kind === 'channel-mention' ||
                        item.kind === 'tool-approval' ||
                        item.kind === 'user-question' ||
                        item.kind === 'private-input' ||
                        item.kind === 'workspace-grant-request' ||
                        item.kind === 'assignment-waiting-human' ||
                        item.kind === 'assignment-blocked' ? (
                          hostSource === undefined &&
                          item.kind === 'workspace-grant-request' &&
                          item.category !== 'handled' ? (
                            <HumanInboxWorkspaceAction source={item} actions={actions} t={t} />
                          ) : (
                            <Button
                              variant="primary"
                              size="sm"
                              type="button"
                              onClick={() => openAction(item)}
                            >
                              {t(
                                hostSource !== undefined &&
                                  item.kind !== 'tool-approval' &&
                                  item.kind !== 'user-question'
                                  ? 'humanInbox.open'
                                  : item.category === 'handled'
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
                              void commands
                                .openChannelAtMessage(item.channelId!, item.responseMessageId!)
                                .catch(() => setActionError(t('humanInbox.failed')))
                            }
                          >
                            {t('humanInbox.handled.response')}
                          </Button>
                        ) : null}
                        {item.kind === 'auto-rejection' ? (
                          <AllowAutoRejectionButton
                            item={item}
                            actions={commands}
                            t={t}
                            onDone={() => {
                              if (
                                replySource !== undefined &&
                                itemKey(replySource) === itemKey(item)
                              )
                                setReplySource(undefined);
                            }}
                            onError={() => setActionError(t('humanInbox.failed'))}
                          />
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
                        {(selectable || hostSource !== undefined) &&
                        canSnoozeHumanInboxItem(item) ? (
                          <HumanInboxSnoozeButton
                            item={item}
                            t={t}
                            open={snoozeMenu === itemKey(item)}
                            disabled={busyId === item.id || batchBusy}
                            onOpenChange={(open) => setSnoozeMenu(open ? itemKey(item) : undefined)}
                            onSnooze={(until) => void snooze(item, until)}
                          />
                        ) : null}
                        {hostSource === undefined ? (
                          <HumanInboxSourceButton
                            item={item}
                            bots={state.bots}
                            channels={state.channels}
                            t={t}
                            onClick={() =>
                              void openSource(item).catch(() =>
                                setActionError(t('humanInbox.failed')),
                              )
                            }
                          />
                        ) : (
                          hostSource.sourceButton(
                            item,
                            () =>
                              void openSource(item).catch(() =>
                                setActionError(t('humanInbox.failed')),
                              ),
                          )
                        )}
                        {hostSource !== undefined && item.category !== 'handled' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busyId === item.id}
                            onClick={() => void settleOne(item, true)}
                          >
                            {t('humanInbox.dismiss')}
                          </Button>
                        ) : null}
                      </>
                    </div>
                    {replySource?.id === item.id ? (
                      <div id={detailId} className="bh-human-inbox-detail">
                        {renderSource(item, () => setReplySource(undefined))}
                      </div>
                    ) : null}
                  </article>
                ),
              )}
            </div>
          </div>
          {inbox.nextCursor === undefined ? null : (
            <button
              type="button"
              className="bh-human-inbox-more"
              onClick={() =>
                void (hostSource === undefined
                  ? actions.loadMoreHumanInbox()
                  : hostSource.loadMore())
              }
            >
              {t('humanInbox.more')}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
