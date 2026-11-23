import { Redirect, Stack } from 'expo-router';
import { ScrollView } from 'react-native';
import { useHostSession } from '../../host/host-session';
import { space } from '../design/tokens';
import { useSessionsTab } from '../interface-preferences';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { canCreateNativeSession } from './page-create-actions';

export function CreateSessionScreen() {
  const enabled = useSessionsTab();
  const { saved, client } = useHostSession();
  const t = useStrings().hostSessions;
  if (!enabled) return <Redirect href="/" />;
  if (saved === undefined) return null;
  if (!client || !canCreateNativeSession(saved)) return <Redirect href="/sessions" />;
  return (
    <>
      <Stack.Screen options={{ title: t.create }} />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ padding: space.x5 }}
      >
        <Text tone="muted">{t.createPending}</Text>
      </ScrollView>
    </>
  );
}
