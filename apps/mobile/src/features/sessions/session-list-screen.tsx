import { Redirect, Stack } from 'expo-router';
import { View } from 'react-native';
import { useDesignTheme } from '../../ui/design/theme';
import { useSessionsTab } from '../../ui/interface-preferences';
import { useStrings } from '../../ui/strings';
import { SessionDrawerNotice, useSessionScope } from './session-drawer-content';
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
        <SessionDrawerNotice {...scope.notice} />
      ) : (
        <SessionDrawerPanel
          key={scope.scope}
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
