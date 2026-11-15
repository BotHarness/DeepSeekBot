import { hostLooks } from './host-looks.js';
import { ActivityEnvironmentBadge } from './activity-environment-badge.js';
import { shownHostName } from '../../../../apps/mobile/src/ui/design/host-look.js';
import { useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InboxSnapshot } from '../../../../apps/mobile/src/host/inbox.js';
import { isAvatarAppearance } from '../../../core/src/bots/avatar-appearance.js';
import { parseHumanAttentionPage } from './bridge.js';
import type { ActivitySection } from './activity-feed.js';
import { CHANNEL_BODY_PANEL } from './channel-dock-layout.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { ActivityListSource } from './activity-list-view.js';
import { ActivityListSourceButton } from './activity-list-controls.js';
import { createHostActivityActions, type HostActivityActions } from './host-activity-actions.js';
import { useMountedResource } from './mounted-resource.js';
import { ToolApprovalCard } from './tool-approval-card.js';
import { UserQuestionCard } from './user-question-card.js';
import type { BotHarnessTranslate } from './locale.js';
import type { RemoteHost, RemoteHosts, RemoteConversationTarget } from './remote-hosts.js';
import type { ChannelMessage, HumanAttentionItem, ActivityListState } from './store.js';

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
): ActivityListState {
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
        ? t('activityList.failed')
        : undefined,
    nextCursor: inbox.status === 'ready' ? inbox.cursors?.[section] : undefined,
    unreadCount: 0,
    hasAction: false,
    channelUnread: inbox.status === 'ready' ? (inbox.unread ?? {}) : {},
  };
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
    <section ref={mount} className="bh-activity-list-reply">
      <div className="bh-activity-list-reply-header">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
      {failed ? (
        <p role="alert">
          {t('activityList.failed')}{' '}
          <Button
            onClick={() => (failed === 'open' ? void open() : setAttempt((value) => value + 1))}
          >
            {t('activityInbox.retry')}
          </Button>
        </p>
      ) : request && message === undefined ? (
        <p>{t('activityList.loading')}</p>
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
        {t('activityList.open')}
      </Button>
    </section>
  );
}

export type RemoteActivityObservation = NonNullable<ReturnType<RemoteHosts['activity']>>;

export function createRemoteActivitySource({
  host,
  sources,
  avatars,
  registry,
  observation,
  section,
  t,
}: {
  host: RemoteHost;
  sources: RemoteHosts;
  avatars: ReadonlyMap<string, string>;
  registry?: DockPanelRegistry | undefined;
  observation: RemoteActivityObservation;
  section: ActivitySection;
  t: BotHarnessTranslate;
}): ActivityListSource {
  const hostId = host.host.hostId;
  const currentHost = (): RemoteHost => {
    const current = sources.getSnapshot().hosts.find((entry) => entry.host.hostId === hostId);
    if (!current || current.snapshot.connection.status === 'refused')
      throw new Error(t('activityList.failed'));
    return current;
  };
  const open = async (item: HumanAttentionItem): Promise<void> => {
    sources.open(remoteActivityTarget(currentHost(), item));
    registry?.open(CHANNEL_BODY_PANEL);
  };
  const refresh = async (): Promise<void> => {
    await observation.getInbox()?.refresh();
  };
  const commands = createHostActivityActions({
    requestUnavailable: t('activityList.failed'),
    client: () => {
      currentHost();
      const client = sources.client(hostId);
      if (!client || client.getSnapshot().connection.status === 'refused')
        throw new Error(t('activityList.failed'));
      return client;
    },
    items: () => {
      const inbox = observation.getSnapshot();
      return inbox.status === 'ready'
        ? Object.values(inbox.sections).flatMap((items) => parseRemoteActivityItems(items).items)
        : [];
    },
    refresh,
    open: async (channelId) => {
      const current = currentHost();
      sources.open({
        hostId,
        channelId,
        title:
          current.snapshot.roster?.channels.find((channel) => channel.id === channelId)?.name ??
          shownHostName(hostLooks().look(hostId), current.host.hostName),
      });
      registry?.open(CHANNEL_BODY_PANEL);
    },
  });
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
  return {
    hostId,
    origin: <ActivityEnvironmentBadge hostId={hostId} name={host.host.hostName} t={t} />,
    commands,
    detail: (item, onClose) => (
      <RemoteActivityDetail
        key={hostId + item.id}
        item={item}
        actions={commands}
        t={t}
        onClose={onClose}
        onOpen={() => open(item)}
      />
    ),
    botName: (slug) => bots.find((bot) => bot.slug === slug)?.displayName ?? slug,
    isDirect: (channelId) => !channels.some((channel) => channel.id === channelId),
    open,
    sourceButton: (item, onOpen) => (
      <ActivityListSourceButton
        item={item}
        bots={bots}
        channels={channels}
        t={t}
        localIdentity={false}
        onClick={onOpen}
      />
    ),
    refresh,
    loadMore: async () => {
      await observation.getInbox()?.loadMore?.(section);
    },
  };
}
