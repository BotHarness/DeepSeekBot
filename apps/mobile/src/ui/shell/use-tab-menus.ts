import { router, useNavigationContainerRef } from 'expo-router';
import { useCallback, useMemo, useRef, useSyncExternalStore, type RefCallback } from 'react';
import { cloudError } from '../../cloud/client';
import { quietChannels, useHostSession, useHostSessions } from '../../host/host-session';
import { useConversationFilter } from '../../host/native-conversation-filter';
import { tabMenu } from '../design/tokens';
import { showAppDialog } from '../primitives/app-dialog';
import { useStrings } from '../strings';
import { chatsCreationActions } from './creation-menu-items';
import { startNewGroup } from './new-group';
import { openActivityItem } from './open-activity-item';
import { openCloudCreation } from './open-cloud-creation';
import { conversationHref } from './open-conversation';
import { navigateChannel } from './channel-navigation';
import {
  openDrawerSession,
  openNewSession,
} from '../../features/sessions/session-drawer-navigation';
import { useHideBotSessions } from '../interface-preferences';
import { canCreateNativeSession } from './page-create-actions';
import { useRecentSessions } from './recent-sessions';
import {
  activityLabel,
  conversationGlyph,
  conversationLabel,
  pendingActivity,
  recentConversations,
  recentSessionsShown,
  type TabMenuEntry,
  type TabMenuHost,
} from './tab-menu-model';
import { useCreationTargets } from './use-creation-targets';

export type TabMenuRoute = '(home)' | '(sessions)' | '(activity)';
export type TabMenus = Partial<Record<TabMenuRoute, readonly TabMenuEntry[]>>;
export type TabMenuState = { menus: TabMenus; load: RefCallback<unknown> };

export function useTabMenus({
  focusedRoute,
  go,
}: {
  focusedRoute: string | undefined;
  go(route: TabMenuRoute): void;
}): TabMenuState {
  const t = useStrings();
  const navigation = useNavigationContainerRef();
  const hosts = useHostSessions();
  const [scope] = useConversationFilter();
  const targets = useCreationTargets(scope);
  const canGroup = chatsCreationActions(scope, targets).group;
  const { saved, client } = useHostSession();
  const watch = useCallback(
    (listener: () => void) => client?.subscribe(listener) ?? (() => {}),
    [client],
  );
  const online = useSyncExternalStore(
    watch,
    () => client?.getSnapshot().connection.status === 'connected',
  );
  const hideBotSessions = useHideBotSessions();
  const { rows: recent, load } = useRecentSessions(client, saved?.hostId, online, focusedRoute);
  const sessions = recentSessionsShown(recent, hideBotSessions);
  const canCreateSession = canCreateNativeSession(saved);

  const menuHosts: TabMenuHost[] = hosts.map((host) => ({
    hostId: host.saved.hostId,
    connected: host.snapshot.connection.status === 'connected',
    roster: host.snapshot.roster,
    action: host.attention.status === 'ready' ? host.attention.sections.action : undefined,
    ...(host.attention.status === 'ready' ? { unread: host.attention.unread } : {}),
    quiet: quietChannels.get(host.saved.hostId),
  }));
  const chats = recentConversations(menuHosts, scope, tabMenu.recent);
  const pending = pendingActivity(menuHosts, scope, tabMenu.recent);
  const latest = useRef({ hosts, targets, scope, go, navigation });
  latest.current = { hosts, targets, scope, go, navigation };

  const signature = JSON.stringify([
    t.chatsCreate.group,
    t.hostSessions.create,
    t.hostSessions.untitled,
    canGroup,
    canCreateSession,
    saved?.hostId,
    chats.map(({ hostId, conversation }) => [
      hostId,
      conversation.key,
      conversationLabel(conversation),
    ]),
    pending.map(({ hostId, item }) => [
      hostId,
      item.id,
      activityLabel(item, hosts.find((host) => host.saved.hostId === hostId)?.snapshot.roster),
    ]),
    sessions?.map((row) => [row.sessionId, row.title]),
  ]);

  const menus = useMemo(() => {
    const now = () => latest.current;
    const hostFor = (hostId: string) => now().hosts.find((host) => host.saved.hostId === hostId);
    const next: TabMenus = {};
    const chatEntries: TabMenuEntry[] = chats.map(({ hostId, conversation }) => ({
      key: `${hostId}:${conversation.key}`,
      label: conversationLabel(conversation),
      glyph: conversationGlyph(conversation),
      run: () => {
        now().go('(home)');
        navigateChannel(now().navigation, conversationHref(conversation, hostId));
      },
    }));
    if (canGroup)
      chatEntries.push({
        key: 'new-group',
        label: t.chatsCreate.group,
        glyph: 'new',
        run: () => {
          const { scope: current, targets: choices, go: open } = now();
          open('(home)');
          startNewGroup(current, choices, (target) => {
            openCloudCreation(target, 'channel', () => true).catch((error: unknown) =>
              showAppDialog(t.createHere, cloudError(error), [{ text: t.close, style: 'cancel' }]),
            );
          });
        },
      });
    if (chatEntries.length > 0) next['(home)'] = chatEntries;

    const activityEntries: TabMenuEntry[] = pending.map(({ hostId, item }) => ({
      key: `${hostId}:${item.id}`,
      label: activityLabel(item, hostFor(hostId)?.snapshot.roster),
      glyph: 'activity',
      run: () => {
        const host = hostFor(hostId);
        if (host === undefined) return;
        now().go('(activity)');
        openActivityItem(
          now().navigation,
          { hostId, client: host.client, roster: host.client.getSnapshot().roster },
          item,
          (href) => router.push(href),
        );
      },
    }));
    if (activityEntries.length > 0) next['(activity)'] = activityEntries;

    const hostId = saved?.hostId;
    const sessionEntries: TabMenuEntry[] =
      hostId === undefined
        ? []
        : (sessions ?? []).map((row) => ({
            key: `${hostId}:${row.sessionId}`,
            label: row.title ?? t.hostSessions.untitled,
            glyph: 'session',
            run: () => {
              now().go('(sessions)');
              openDrawerSession(hostId, row);
            },
          }));
    if (canCreateSession)
      sessionEntries.push({
        key: 'new-session',
        label: t.hostSessions.create,
        glyph: 'new',
        run: () => {
          now().go('(sessions)');
          openNewSession();
        },
      });
    if (sessionEntries.length > 0) next['(sessions)'] = sessionEntries;
    return next;
  }, [signature]);
  return { menus, load };
}
