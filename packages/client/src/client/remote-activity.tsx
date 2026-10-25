import { useHostName, hostLooks } from './host-looks.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  IconChevronDownOutlineMedium,
  IconChevronRightOutlineMedium,
  Button,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { InboxSnapshot } from '../../../../apps/mobile/src/host/inbox.js';
import { isAvatarAppearance } from '../../../core/src/bots/avatar-appearance.js';
import { parseHumanAttentionPage } from './bridge.js';
import { ACTIVITY_SECTIONS, type ActivityQuery, type ActivitySection } from './activity-feed.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { color, space, text } from './ds/tokens.stylex.js';
import { HumanInboxView } from './human-inbox-view.js';
import { HumanInboxSourceButton } from './human-inbox-controls.js';
import { createHostActivityActions, type HostActivityActions } from './host-activity-actions.js';
import { useMountedResource } from './mounted-resource.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { UserQuestionCard } from './user-question-card.js';
import type { BotHarnessTranslate } from './locale.js';
import type { RemoteHost, RemoteHosts, RemoteConversationTarget } from './remote-hosts.js';
import type { ChannelMessage, HumanAttentionItem, HumanInboxState } from './store.js';

const styles = stylex.create({
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    margin: 0,
    padding: space.x3,
    color: color.fg,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
    fontWeight: text.strong,
  },
  mark: { color: color.subtle, fontSize: text.metaSize, fontWeight: text.regular },
  note: {
    margin: 0,
    paddingInline: space.x3,
    paddingBlock: space.x2,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});
const titles = {
  action: 'activityInbox.needsYou',
  replies: 'activityInbox.forYou',
  unread: 'humanInbox.unread',
  handled: 'humanInbox.handled',
} as const;

export function remoteActivityTarget(
  host: RemoteHost,
  item: HumanAttentionItem,
): RemoteConversationTarget {
  const bot = host.snapshot.roster?.bots.find((bot) => bot.slug === item.botSlug);
  const group = host.snapshot.roster?.channels.find((channel) => channel.id === item.channelId);
  return {
    hostId: host.host.hostId,
    title: group?.name ?? bot?.displayName ?? item.channelName ?? item.botSlug,
    ...(item.channelId === undefined ? { botSlug: item.botSlug } : { channelId: item.channelId }),
  };
}

function parseRemoteActivityItems(value: unknown): {
  items: HumanAttentionItem[];
  failed: boolean;
} {
  if (!Array.isArray(value)) return { items: [], failed: true };
  let failed = false;
  const items = value.flatMap((item) => {
    try {
      return parseHumanAttentionPage({ items: [item] }).items;
    } catch {
      failed = true;
      return [];
    }
  });
  return { items, failed };
}

export function remoteActivityPage(
  inbox: InboxSnapshot,
  section: ActivitySection,
  t: BotHarnessTranslate,
): HumanInboxState {
  const parsed =
    inbox.status === 'ready'
      ? parseRemoteActivityItems(inbox.sections[section])
      : { items: [], failed: false };
  return {
    category: section,
    sort: 'newest',
    botSlug: undefined,
    channelId: undefined,
    snoozed: false,
    items: parsed.items,
    status: inbox.status,
    error:
      parsed.failed ||
      inbox.status === 'error' ||
      (inbox.status === 'ready' && inbox.stale !== undefined)
        ? t('humanInbox.failed')
        : undefined,
    nextCursor: inbox.status === 'ready' ? inbox.cursors?.[section] : undefined,
    unreadCount: 0,
    hasAction: false,
    channelUnread: inbox.status === 'ready' ? (inbox.unread ?? {}) : {},
  };
}

export function ActivityHostHeading({
  name,
  remote = false,
  t,
}: {
  name: string;
  remote?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <h2 {...stylex.props(styles.heading)}>
      {name}
      {remote ? <span {...stylex.props(styles.mark)}>{t('remoteHosts.remote')}</span> : null}
    </h2>
  );
}

function RemoteActivityDetail({
  item,
  actions,
  t,
  onClose,
  onOpen,
}: {
  item: HumanAttentionItem;
  actions: HostActivityActions;
  t: BotHarnessTranslate;
  onClose(): void;
  onOpen(): Promise<void>;
}): ReactElement {
  const [message, setMessage] = useState<ChannelMessage>();
  const [failed, setFailed] = useState<'request' | 'open'>();
  const opening = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const request = item.kind === 'tool-approval' || item.kind === 'user-question';
  const mount = useMountedResource<HTMLElement>(() => {
    if (!request) return;
    const controller = new AbortController();
    setFailed(undefined);
    void actions.message(item, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setMessage(value);
      },
      () => {
        if (!controller.signal.aborted) setFailed('request');
      },
    );
    return () => controller.abort();
  }, [actions, item.id, attempt]);
  const open = async (): Promise<void> => {
    if (opening.current) return;
    opening.current = true;
    setFailed(undefined);
    try {
      await onOpen();
    } catch {
      setFailed('open');
    } finally {
      opening.current = false;
    }
  };
  return (
    <section ref={mount} className="bh-human-inbox-reply">
      <div className="bh-human-inbox-reply-header">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      {failed ? (
        <p role="alert">
          {t('humanInbox.failed')}{' '}
          <Button
            onClick={() => (failed === 'open' ? void open() : setAttempt((value) => value + 1))}
          >
            {t('activityInbox.retry')}
          </Button>
        </p>
      ) : request && message === undefined ? (
        <p>{t('humanInbox.loading')}</p>
      ) : null}
      {message?.toolApprovalRequest ? (
        <ToolApprovalCard
          message={message}
          actions={actions}
          channelId={item.channelId}
          surface="activity"
          hostScoped
          t={t}
        />
      ) : message?.userQuestionRequest ? (
        <UserQuestionCard
          message={message}
          actions={actions}
          channelId={item.channelId}
          hostScoped
          t={t}
        />
      ) : (
        <p>{item.summary}</p>
      )}
      <Button variant="outline" size="sm" onClick={() => void open()}>
        {t('humanInbox.open')}
      </Button>
    </section>
  );
}

export function RemoteActivityGroup({
  host,
  sources,
  avatars,
  registry,
  query,
  t,
}: {
  host: RemoteHost;
  sources: RemoteHosts;
  avatars: ReadonlyMap<string, string>;
  registry?: DockPanelRegistry | undefined;
  query: ActivityQuery;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const filtered =
    query.search !== '' ||
    query.sort !== 'default' ||
    query.snoozed ||
    query.category === 'handled';
  const observation = useMemo(
    () =>
      sources.activity(
        host.host.hostId,
        filtered
          ? {
              activity: true,
              search: query.search,
              sort: query.sort,
              section: query.snoozed ? 'snoozed' : query.category === 'handled' ? 'handled' : 'all',
            }
          : undefined,
      )!,
    [sources, host.host.hostId, filtered, query.search, query.sort, query.snoozed, query.category],
  );
  const inbox = useSyncExternalStore(observation.subscribe, observation.getSnapshot);
  const currentInbox = useRef(inbox);
  currentInbox.current = inbox;
  const scopedActions = useMemo(
    () =>
      createHostActivityActions({
        requestUnavailable: t('humanInbox.failed'),
        client: () => {
          const client = sources.client(host.host.hostId);
          if (client === undefined || client.getSnapshot().connection.status === 'refused')
            throw new Error(t('humanInbox.failed'));
          return client;
        },
        items: () => {
          const value = currentInbox.current;
          return value.status === 'ready'
            ? Object.values(value.sections).flatMap(
                (items) => parseRemoteActivityItems(items).items,
              )
            : [];
        },
        refresh: async () => {
          await observation.getInbox()?.refresh();
        },
        open: async (channelId) => {
          const current = sources
            .getSnapshot()
            .hosts.find((entry) => entry.host.hostId === host.host.hostId);
          if (current === undefined || current.snapshot.connection.status === 'refused')
            throw new Error(t('humanInbox.failed'));
          sources.open({
            hostId: current.host.hostId,
            channelId,
            title:
              current.snapshot.roster?.channels.find((channel) => channel.id === channelId)?.name ??
              shownHostName(hostLooks().look(current.host.hostId), current.host.hostName),
          });
          registry?.open(CHANNEL_BODY_PANEL);
        },
      }),
    [sources, host.host.hostId, observation, registry, t],
  );
  const [collapsed, setCollapsed] = useState<Partial<Record<ActivitySection, boolean>>>({});
  const hostName = useHostName(host.host.hostId, host.host.hostName);
  if (query.botSlug !== undefined || query.channelId !== undefined) return null;
  const refused = host.snapshot.connection.status === 'refused';
  const bots = (host.snapshot.roster?.bots ?? []).map((bot) => ({
    slug: bot.slug,
    displayName: bot.displayName,
    ...(bot.avatarUrl !== undefined && avatars.has(bot.avatarUrl)
      ? { avatar: avatars.get(bot.avatarUrl)! }
      : {}),
    ...(isAvatarAppearance(bot.appearance) ? { appearance: bot.appearance } : {}),
    ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
  }));
  const channels = (host.snapshot.roster?.channels ?? []).map((channel) => ({
    id: channel.id,
    name: channel.name,
    type: 'group' as const,
  }));
  const open = async (item: HumanAttentionItem) => {
    const current = sources
      .getSnapshot()
      .hosts.find((entry) => entry.host.hostId === host.host.hostId);
    if (current === undefined || current.snapshot.connection.status === 'refused')
      throw new Error(t('humanInbox.failed'));
    sources.open(remoteActivityTarget(current, item));
    registry?.open(CHANNEL_BODY_PANEL);
  };
  return (
    <section data-activity-host={host.host.hostId} aria-label={hostName}>
      <ActivityHostHeading name={hostName} remote t={t} />
      {host.snapshot.connection.status !== 'connected' ? (
        <p role="status" {...stylex.props(styles.note)}>
          {t(refused ? 'remoteHosts.refused' : 'remoteHosts.offline', { name: hostName })}
        </p>
      ) : null}
      {refused
        ? null
        : (query.category === 'all' ? ACTIVITY_SECTIONS : [query.category]).map((section) => {
            const page = remoteActivityPage(inbox, section, t);
            const count =
              section === 'unread'
                ? page.items.reduce((sum, item) => sum + (item.unreadCount ?? 0), 0)
                : page.items.length;
            return (
              <HumanInboxView
                key={section + JSON.stringify(query)}
                t={t}
                inboxOverride={page}
                collapsed={collapsed[section] ?? false}
                emptyMessage={query.search ? t('activityInbox.noResults') : undefined}
                hostSource={{
                  commands: scopedActions,
                  detail: (item, onClose) => (
                    <RemoteActivityDetail
                      key={item.id}
                      item={item}
                      actions={scopedActions}
                      t={t}
                      onClose={onClose}
                      onOpen={() => open(item)}
                    />
                  ),
                  botName: (slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug,
                  isDirect: (channelId) => !channels.some((channel) => channel.id === channelId),
                  open,
                  sourceButton: (item, onOpen) => (
                    <HumanInboxSourceButton
                      item={item}
                      bots={bots}
                      channels={channels}
                      t={t}
                      localIdentity={false}
                      onClick={onOpen}
                    />
                  ),
                  refresh: async () => {
                    await observation.getInbox()?.refresh();
                  },
                  loadMore: async () => {
                    await observation.getInbox()?.loadMore?.(section);
                  },
                }}
                sectionHeading={
                  <button
                    type="button"
                    className="bh-activity-section-toggle"
                    aria-expanded={!collapsed[section]}
                    aria-label={t(titles[section])}
                    onClick={() =>
                      setCollapsed((before) => ({ ...before, [section]: !before[section] }))
                    }
                  >
                    {collapsed[section] ? (
                      <IconChevronRightOutlineMedium />
                    ) : (
                      <IconChevronDownOutlineMedium />
                    )}
                    <span>{t(titles[section])}</span>
                    <span
                      className="bh-activity-section-count"
                      data-attention={(section === 'action' && count > 0) || undefined}
                    >
                      {count}
                      {page.nextCursor ? '+' : ''}
                    </span>
                  </button>
                }
              />
            );
          })}
    </section>
  );
}
