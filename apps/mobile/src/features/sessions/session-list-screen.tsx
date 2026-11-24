import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { space } from '../../ui/design/tokens';
import { useSessionsTab } from '../../ui/interface-preferences';
import { Text } from '../../ui/primitives/text';
import { useStrings } from '../../ui/strings';
import { useSessionScope } from './session-drawer-content';
import { openDrawerSession, openNewSession } from './session-drawer-navigation';
import { SessionDrawerPanel } from './session-drawer-panel';

export function SessionListScreen() {
  const enabled = useSessionsTab();
  const t = useStrings().hostSessions;
  const theme = useDesignTheme();
  const scope = useSessionScope();
  if (!enabled) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }} testID="session-list-screen">
      <Stack.Screen options={{ title: t.title, headerShown: false }} />
      {scope.hosts.length === 0 ? (
        <View style={{ flex: 1, justifyContent: 'center', padding: space.x5 }}>
          <Text tone="muted" style={{ textAlign: 'center' }}>
            {t.offline}
          </Text>
        </View>
      ) : (
        <SessionDrawerPanel
          key={scope.key}
          variant="page"
          hosts={scope.hosts}
          title={scope.title}
          showHost={scope.showHost}
          active
          canCreate={scope.canCreate}
          onOpen={(row) => openDrawerSession(row.hostId, row)}
          onNew={() => openNewSession('root')}
        />
      )}
    </View>
  );
}
