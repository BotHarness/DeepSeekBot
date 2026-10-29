import { useLocalSearchParams, useNavigationContainerRef, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { hostSession } from '../../host/host-session';
import { requestActivitySession } from '../../host/native-live-activity';
import { navigateChannel } from '../shell/channel-navigation';
import { hostDrawer } from '../shell/host-drawer';
import {
  activityAssignmentDestination,
  activityDestination,
  subscribeActivityHost,
} from '../../host/live-activity-routing';
import { useMounted } from '../mounted';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { SheetPage } from '../primitives/sheet-page';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function RequestActivityScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const navigation = useNavigationContainerRef();
  const t = useStrings();
  const [failed, setFailed] = useState(false);
  const mounted = useMounted(() => {
    let disposed = false;
    const workspaceCurrent = hostDrawer.captureWorkspaceSelection();
    const selection = hostSession.getSelectionRevision();
    let ownedSelection: number | undefined;
    let routeState = navigation.isReady() ? navigation.getRootState() : undefined;
    const current = () => {
      if (
        disposed ||
        !workspaceCurrent() ||
        (ownedSelection !== undefined && hostSession.getSelectionRevision() !== ownedSelection)
      )
        return false;
      if (!navigation.isReady()) return true;
      const next = navigation.getRootState();
      routeState ??= next;
      return next === routeState && next.routes[next.index]?.name === 'request-activity';
    };
    let cancelWait: (() => void) | undefined;
    setFailed(false);
    const wait = (condition: () => boolean) =>
      new Promise<void>((resolve, reject) => {
        let settled = false;
        let off = () => {};
        let offNavigation = () => {};
        const done = (error?: Error) => {
          if (settled) return;
          settled = true;
          off();
          offNavigation();
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
        offNavigation = navigation.addListener('state', finish);
        finish();
      });
    void (async () => {
      await requestActivitySession.ready;
      if (!current()) return;
      await wait(() => hostSession.getState().saved !== undefined);
      if (!current() || hostSession.getSelectionRevision() !== selection) return;
      const target = typeof id === 'string' ? requestActivitySession.target(id) : undefined;
      if (!target) throw new Error('missing');
      const switching = hostSession.switchTo(target.hostId, current);
      ownedSelection = hostSession.getSelectionRevision();
      if (!(await switching)) throw new Error('missing');
      if (!current()) return;
      await wait(() => {
        const selected = hostSession.getState();
        const snapshot = selected.client?.getSnapshot();
        if (
          !current() ||
          selected.saved?.hostId !== target.hostId ||
          snapshot?.connection.status === 'refused'
        )
          throw new Error('source-changed');
        return navigation.isReady() && snapshot?.roster !== undefined;
      });
      if (!current()) return;
      const assignmentId = await requestActivitySession.assignment(id!);
      if (!current()) return;
      if (!requestActivitySession.target(id!)) throw new Error('missing');
      const selected = hostSession.getState();
      const assignment = activityAssignmentDestination(
        target,
        selected.saved?.hostId,
        assignmentId,
      );
      if (assignment) {
        router.replace(assignment);
        return;
      }
      const dm = selected.client
        ?.getSnapshot()
        .roster?.bots.find((bot) => bot.slug === target.botSlug)?.dmChannelId;
      const destination = activityDestination(target, selected.saved?.hostId, dm);
      if (!destination || !navigateChannel(navigation, destination, 'dismiss-activity'))
        throw new Error('missing');
    })().catch(() => {
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      cancelWait?.();
    };
  }, [id, navigation]);
  return (
    <SheetPage title={t.lockScreen.title}>
      <View ref={mounted} style={{ padding: space.x5, gap: space.x4 }}>
        <Text>{failed ? t.lockScreen.missing : t.lockScreen.opening}</Text>
        <Button label={t.back} testID="request-activity-back" onPress={() => router.replace('/')} />
      </View>
    </SheetPage>
  );
}
