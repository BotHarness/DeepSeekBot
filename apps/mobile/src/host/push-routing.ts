import { useRouter } from 'expo-router';
import type { RefCallback } from 'react';
import type { ViewInstance } from 'react-native';

import { useMounted } from '../ui/mounted';
import { createHostClient } from './client';
import { hostSession } from './host-session';
import { nativeCarrier } from './native-carrier';
import { onNotificationTap } from './native-notifications';
import { parsePushData, pushHref, type PushTarget } from './push';
import { decideFromPush } from './push-actions';
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
      if (!(await hostSession.switchTo(target.hostId))) {
        router.navigate('/');
        return;
      }
      const roster = hostSession.getState().client?.getSnapshot().roster;
      const href = pushHref(
        target,
        (slug) => roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId,
        (channelId) => roster?.channels.some((channel) => channel.id === channelId) ?? false,
      );
      setTimeout(() => router.push(href), 0);
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
