import { useNavigationContainerRef, useRouter } from 'expo-router';
import type { NavigationState, PartialState } from 'expo-router/react-navigation';
import type { RefCallback } from 'react';
import { Alert, type ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';
import { channelDestination, navigateChannel } from '../ui/shell/channel-navigation';
import { createHostClient, type HostClient, type RosterView } from './client';
import { hostSession } from './host-session';
import { conversationFilter } from './native-conversation-filter';
import { computerEnvironmentKey } from './conversation-environments';
import { nativeCarrier } from './native-carrier';
import { onNotificationTap } from './native-notifications';
import { alertBanners } from './alert-banners';
import { parsePushData, pushHref, type PushTarget } from './push';
import { decideFromPush, removeFromPush } from './push-actions';
import { removeDevice } from './pairing';
import { t } from '../ui/strings';
import { decideApproval } from './requests';
import { recordFeature } from '../telemetry/features';

class RoutingFailure extends Error {}

const noop = () => {};
const activeWorkspace = () => () => true;
const channelKinds = new Set([
  'channel-reply',
  'channel-mention',
  'tool-approval',
  'user-question',
  'workspace-grant-request',
]);

type NavigationRoute = (NavigationState | PartialState<NavigationState>)['routes'][number];

function sameParams(before: NavigationRoute['params'], after: NavigationRoute['params']): boolean {
  const previous = before ?? {};
  const next = after ?? {};
  return (
    Object.keys(previous).length === Object.keys(next).length &&
    Object.entries(previous).every(([key, value]) => Object.is(value, Reflect.get(next, key)))
  );
}

function sameNavigationSelection(
  before: NavigationState | PartialState<NavigationState>,
  after: NavigationState | PartialState<NavigationState>,
): boolean {
  const previous = before.routes[before.index ?? 0];
  const next = after.routes[after.index ?? 0];
  if (!previous) return true;
  if (!next || previous.name !== next.name) return false;
  if (previous.key !== undefined && previous.key !== next.key) return false;
  if (previous.state === undefined)
    return next.state !== undefined || sameParams(previous.params, next.params);
  return next.state !== undefined && sameNavigationSelection(previous.state, next.state);
}

function readyDestination(
  client: HostClient,
  hostId: string,
  signal: AbortSignal,
  navigation: ReturnType<typeof useNavigationContainerRef>,
  needsRoster: boolean,
): Promise<RosterView | undefined> {
  return new Promise((resolve, reject) => {
    let offClient = noop;
    let offSession = noop;
    let offNavigation = noop;
    const finish = (roster?: RosterView, error?: string) => {
      clearTimeout(timer);
      offClient();
      offSession();
      offNavigation();
      signal.removeEventListener('abort', cancel);
      if (error) reject(new RoutingFailure(error));
      else resolve(roster);
    };
    const cancel = () => finish(undefined, t.channelOpeningFailed);
    const check = () => {
      if (hostSession.getState().saved?.hostId !== hostId)
        return finish(undefined, t.sourceChanged);
      const snapshot = client.getSnapshot();
      if (snapshot.connection.status === 'refused') return finish(undefined, t.refused);
      if (navigation.isReady() && (!needsRoster || snapshot.roster)) finish(snapshot.roster);
    };
    const timer = setTimeout(() => finish(undefined, t.channelOpeningFailed), 15_000);
    offClient = client.subscribe(check);
    offSession = hostSession.subscribe(check);
    offNavigation = navigation.addListener('state', check);
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    else check();
  });
}

export function usePushRouting(
  onPending: (pending: boolean) => void = noop,
  captureWorkspaceSelection: () => () => boolean = activeWorkspace,
): RefCallback<ViewInstance> {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  return useMounted<ViewInstance>(() => {
    const queue: Array<{
      target: PushTarget;
      action: string | undefined;
      version: number;
      selection: number;
      workspaceCurrent: () => boolean;
      navigationVersion: number;
    }> = [];
    let version = 0;
    let running = false;
    let disposed = false;
    let waiting: AbortController | undefined;
    let routeState = navigation.isReady() ? navigation.getRootState() : undefined;
    let navigationVersion = 0;
    const refreshNavigation = () => {
      if (!navigation.isReady()) return;
      const next = navigation.getRootState();
      if (routeState && !sameNavigationSelection(routeState, next)) navigationVersion++;
      routeState = next;
    };
    const offNavigation = navigation.addListener('state', refreshNavigation);
    const current = (value: number) => !disposed && value === version;
    const drain = async (): Promise<void> => {
      if (running || disposed || hostSession.getState().saved === undefined) return;
      running = true;
      try {
        while (!disposed && queue.length) {
          const next = queue.shift();
          if (!next) break;
          const { target, action } = next;
          const isCurrent = () => {
            if (!current(next.version) || !next.workspaceCurrent()) return false;
            refreshNavigation();
            return next.navigationVersion === navigationVersion;
          };
          try {
            const removed = await removeFromPush(
              hostSession.getState().hosts,
              target,
              action,
              (host, deviceId) => removeDevice({ host, deviceId, carrier: nativeCarrier() }),
            );
            if (removed !== undefined) {
              if (!disposed)
                Alert.alert(removed === 'removed' ? t.deviceRemoved : t.deviceRemoveFailed);
              continue;
            }
            if (action !== undefined)
              await decideFromPush(
                hostSession.getState().hosts,
                target,
                action,
                async (host, route, ref, outcome) => {
                  const client = createHostClient({
                    ...host,
                    routes: [route],
                    carrier: nativeCarrier(),
                  });
                  try {
                    return await decideApproval(client, ref, outcome, 'notification');
                  } finally {
                    client.stop();
                  }
                },
              );
            if (!isCurrent()) continue;
            if (next.selection !== hostSession.getSelectionRevision()) continue;
            if (!(await hostSession.switchTo(target.hostId, () => isCurrent())))
              throw new RoutingFailure(t.sourceChanged);
            if (!isCurrent()) continue;
            const client = hostSession.getState().client;
            if (!client) throw new RoutingFailure(t.channelOpeningFailed);
            waiting = new AbortController();
            const channel =
              target.kind && channelKinds.has(target.kind) && target.channelId && target.botSlug
                ? {
                    channelId: target.channelId,
                    botSlug: target.botSlug,
                    ...(target.messageId ? { messageId: target.messageId } : {}),
                  }
                : undefined;
            const roster = await readyDestination(
              client,
              target.hostId,
              waiting.signal,
              navigation,
              channel !== undefined,
            );
            if (!isCurrent()) continue;
            if (channel) {
              const destination = channelDestination(target.hostId, channel, roster);
              if (!destination) throw new RoutingFailure(t.noChannel);
              if (!navigateChannel(navigation, destination))
                throw new RoutingFailure(t.channelOpeningFailed);
            } else {
              const href = pushHref(
                target,
                (slug) => roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId,
                (channelId) =>
                  roster?.channels.some((channel) => channel.id === channelId) ?? false,
              );
              if (href.pathname === '/activity') {
                conversationFilter.set(computerEnvironmentKey(target.hostId));
                router.navigate('/activity');
              } else router.push({ ...href, params: { ...href.params, hostId: target.hostId } });
            }
          } catch (error) {
            if (isCurrent())
              Alert.alert(error instanceof RoutingFailure ? error.message : t.channelOpeningFailed);
          }
        }
      } finally {
        running = false;
        if (!disposed) onPending(false);
      }
    };
    const receive = (data: unknown, action: string | undefined) => {
      const target = parsePushData(data);
      if (target === undefined) return;
      if (action === undefined) recordFeature('notification:push_open', {});
      version++;
      waiting?.abort();
      refreshNavigation();
      queue.push({
        target,
        action,
        version,
        selection: hostSession.getSelectionRevision(),
        workspaceCurrent: captureWorkspaceSelection(),
        navigationVersion,
      });
      onPending(true);
      void drain();
    };
    const offTap = onNotificationTap(receive);
    const offBanner = alertBanners.onOpen((data) => receive(data, undefined));
    const offSession = hostSession.subscribe(() => void drain());
    return () => {
      disposed = true;
      waiting?.abort();
      offTap();
      offBanner();
      offSession();
      offNavigation();
    };
  }, [router, navigation, onPending, captureWorkspaceSelection]);
}
