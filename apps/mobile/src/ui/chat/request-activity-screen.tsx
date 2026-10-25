import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { hostSession } from '../../host/host-session';
import { requestActivitySession } from '../../host/native-live-activity';
import { activityDestination, subscribeActivityHost } from '../../host/live-activity-routing';
import { useMounted } from '../mounted';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { SheetPage } from '../primitives/sheet-page';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function RequestActivityScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const t = useStrings();
  const [failed, setFailed] = useState(false);
  const mounted = useMounted(() => {
    let disposed = false;
    let cancelWait: (() => void) | undefined;
    setFailed(false);
    const wait = (condition: () => boolean) =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        let off = () => {};
        const done = (error?: Error) => {
          if (settled) return;
          settled = true;
          off();
          clearTimeout(timer);
          if (error) reject(error);
          else resolve();
        };
        const finish = () => {
          try {
            if (condition()) done();
          } catch {
            done(new Error('unavailable'));
          }
        };
        const timer = setTimeout(() => done(new Error('unavailable')), 15_000);
        cancelWait = () => done(new Error('disposed'));
        off = subscribeActivityHost(hostSession, finish);
        finish();
      });
    void (async () => {
      await requestActivitySession.ready;
      if (disposed) return;
      await wait(() => hostSession.getState().saved !== undefined);
      if (disposed) return;
      const target = typeof id === 'string' ? requestActivitySession.target(id) : undefined;
      if (!target || !(await hostSession.switchTo(target.hostId))) throw new Error('missing');
      if (disposed) return;
      await wait(() => {
        const current = hostSession.getState();
        const snapshot = current.client?.getSnapshot();
        if (current.saved?.hostId !== target.hostId || snapshot?.connection.status === 'refused')
          throw new Error('source-changed');
        return snapshot?.roster !== undefined;
      });
      if (disposed) return;
      if (!requestActivitySession.target(id!)) throw new Error('missing');
      const current = hostSession.getState();
      const dm = current.client
        ?.getSnapshot()
        .roster?.bots.find((bot) => bot.slug === target.botSlug)?.dmChannelId;
      const destination = activityDestination(target, current.saved?.hostId, dm);
      if (!destination) throw new Error('missing');
      router.replace(destination);
    })().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      cancelWait?.();
    };
  }, [id, router]);
  return (
    <SheetPage title={t.lockScreen.title}>
      <View ref={mounted} style={{ padding: space.x5, gap: space.x4 }}>
        <Text>{failed ? t.lockScreen.missing : t.lockScreen.opening}</Text>
        <Button label={t.back} testID="request-activity-back" onPress={() => router.replace('/')} />
      </View>
    </SheetPage>
  );
}
