import { useNavigationContainerRef, useRouter } from 'expo-router';
import type { RefCallback } from 'react';
import { Alert, type ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';
import { channelDestination, navigateChannel } from '../ui/shell/channel-navigation';
import { createHostClient, type HostClient, type RosterView } from './client';
import { hostSession } from './host-session';
import { nativeCarrier } from './native-carrier';
import { onNotificationTap } from './native-notifications';
import { parsePushData, pushHref, type PushTarget } from './push';
import { decideFromPush, removeFromPush } from './push-actions';
import { removeDevice } from './pairing';
import { t } from '../ui/strings';
import { decideApproval } from './requests';

const noop = () => {};
const channelKinds = new Set([
  'channel-reply',
  'channel-mention',
  'tool-approval',
  'user-question',
  'workspace-grant-request',
]);

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
      if (error) reject(new Error(error));
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
): RefCallback<ViewInstance> {
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  return useMounted<ViewInstance>(() => {
    const queue: Array<{ target: PushTarget; action: string | undefined; version: number }> = [];
    let version = 0;
    let running = false;
    let disposed = false;
    let waiting: AbortController | undefined;
    const current = (value: number) => !disposed && value === version;
    const drain = async (): Promise<void> => {
      if (running || disposed || hostSession.getState().saved === undefined) return;
      running = true;
      try {
        while (!disposed && queue.length) {
          const next = queue.shift();
          if (!next) break;
          const { target, action } = next;
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
                (host, route, ref, outcome) =>
                  decideApproval(
                    createHostClient({
                      routes: [route],
                      credential: host.credential,
                      carrier: nativeCarrier(),
                    }),
                    ref,
                    outcome,
                  ),
              );
            if (!current(next.version)) continue;
            if (!(await hostSession.switchTo(target.hostId))) throw new Error(t.sourceChanged);
            if (!current(next.version)) continue;
            const client = hostSession.getState().client;
            if (!client) throw new Error(t.channelOpeningFailed);
            waiting = new AbortController();
            const needsRoster = Boolean(
              target.kind && channelKinds.has(target.kind) && target.channelId && target.botSlug,
            );
            const roster = await readyDestination(
              client,
              target.hostId,
              waiting.signal,
              navigation,
              needsRoster,
            );
            if (!current(next.version)) continue;
            if (
              target.kind &&
              channelKinds.has(target.kind) &&
              target.channelId &&
              target.botSlug
            ) {
              const destination = channelDestination(
                target.hostId,
                {
                  channelId: target.channelId,
                  botSlug: target.botSlug,
                  ...(target.messageId ? { messageId: target.messageId } : {}),
                },
                roster,
              );
              if (!destination) throw new Error(t.noChannel);
              if (!navigateChannel(navigation, destination))
                throw new Error(t.channelOpeningFailed);
            } else {
              const href = pushHref(
                target,
                (slug) => roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId,
                (channelId) =>
                  roster?.channels.some((channel) => channel.id === channelId) ?? false,
              );
              if (href.pathname === '/activity') router.navigate('/activity');
              else router.push({ ...href, params: { ...href.params, hostId: target.hostId } });
            }
          } catch (error) {
            if (current(next.version))
              Alert.alert(error instanceof Error ? error.message : t.channelOpeningFailed);
          }
        }
      } finally {
        running = false;
        if (!disposed) onPending(false);
      }
    };
    const offTap = onNotificationTap((data, action) => {
      const target = parsePushData(data);
      if (target === undefined) return;
      version++;
      waiting?.abort();
      queue.push({ target, action, version });
      onPending(true);
      void drain();
    });
    const offSession = hostSession.subscribe(() => void drain());
    return () => {
      disposed = true;
      waiting?.abort();
      offTap();
      offSession();
    };
  }, [router, navigation, onPending]);
}
