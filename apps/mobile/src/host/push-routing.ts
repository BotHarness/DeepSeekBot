import { useRouter } from 'expo-router';
import type { RefCallback } from 'react';
import { Alert, type ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';
import { createHostClient } from './client';
import { hostSession } from './host-session';
import { conversationFilter } from './native-conversation-filter';
import { computerEnvironmentKey } from './conversation-environments';
import { nativeCarrier } from './native-carrier';
import { onNotificationTap } from './native-notifications';
import { parsePushData, pushHref, type PushTarget } from './push';
import { decideFromPush, removeFromPush } from './push-actions';
import { removeDevice } from './pairing';
import { t } from '../ui/strings';
import { decideApproval } from './requests';

export function usePushRouting(): RefCallback<ViewInstance> {
  const router = useRouter();
  return useMounted<ViewInstance>(() => {
    let pending: { target: PushTarget; action: string | undefined } | undefined;
    const drain = async (): Promise<void> => {
      const next = pending;
      if (next === undefined || hostSession.getState().saved === undefined) return;
      pending = undefined;
      const { target, action } = next;
      const removed = await removeFromPush(
        hostSession.getState().hosts,
        target,
        action,
        (host, deviceId) => removeDevice({ host, deviceId, carrier: nativeCarrier() }),
      );
      if (removed !== undefined) {
        Alert.alert(removed === 'removed' ? t.deviceRemoved : t.deviceRemoveFailed);
        return;
      }
      if (action !== undefined)
        await decideFromPush(
          hostSession.getState().hosts,
          target,
          action,
          async (host, route, ref, outcome) => {
            const client = createHostClient({ ...host, routes: [route], carrier: nativeCarrier() });
            try {
              return await decideApproval(client, ref, outcome);
            } finally {
              client.stop();
            }
          },
        );
      const source = hostSession.getHost(target.hostId);
      if (!source) {
        router.navigate('/');
        return;
      }
      const roster = source.client.getSnapshot().roster;
      const href = pushHref(
        target,
        (slug) => roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId,
        (channelId) => roster?.channels.some((channel) => channel.id === channelId) ?? false,
      );
      setTimeout(() => {
        if (hostSession.getHost(target.hostId)?.client !== source.client) return;
        if (href.pathname === '/activity')
          conversationFilter.set(computerEnvironmentKey(target.hostId));
        router.push({
          ...href,
          params: { ...('params' in href ? href.params : {}), hostId: target.hostId },
        });
      }, 0);
    };
    const offTap = onNotificationTap((data, action) => {
      const target = parsePushData(data);
      if (target === undefined) return;
      pending = { target, action };
      void drain();
    });
    const offSession = hostSession.subscribe(() => void drain());
    return () => {
      offTap();
      offSession();
    };
  }, [router]);
}
