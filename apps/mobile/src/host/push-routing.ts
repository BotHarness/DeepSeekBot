import { useRouter } from 'expo-router';
import type { RefCallback } from 'react';
import type { View } from 'react-native';

import { useMounted } from '../ui/mounted';
import { hostSession } from './host-session';
import { onNotificationTap } from './native-notifications';
import { parsePushData, pushHref, type PushTarget } from './push';

export function usePushRouting(): RefCallback<View> {
  const router = useRouter();
  return useMounted<View>(() => {
    let pending: PushTarget | undefined;
    const drain = async (): Promise<void> => {
      const target = pending;
      if (target === undefined || hostSession.getState().saved === undefined) return;
      pending = undefined;
      if (!(await hostSession.switchTo(target.hostId))) {
        router.navigate('/');
        return;
      }
      const roster = hostSession.getState().client?.getSnapshot().roster;
      const href = pushHref(
        target,
        (slug) => roster?.bots.find((bot) => bot.slug === slug)?.dmChannelId,
      );
      setTimeout(() => router.push(href), 0);
    };
    const offTap = onNotificationTap((data) => {
      const target = parsePushData(data);
      if (target === undefined) return;
      pending = target;
      void drain();
    });
    const offSession = hostSession.subscribe(() => void drain());
    return () => {
      offTap();
      offSession();
    };
  }, [router]);
}
