import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { OpenFullClientButton } from '../../src/ui/open-full-client';
import { t } from '../../src/ui/strings';
import { InboxIcon, RosterIcon } from '../../src/ui/tab-icons';
import { useTheme } from '../../src/ui/theme';

export default function TabsLayout() {
  const theme = useTheme();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.inkSoft,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
        },
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t.roster,
          tabBarIcon: (props) => <RosterIcon {...props} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: t.inbox,
          headerRight: () => (
            <View style={{ paddingHorizontal: 16 }}>
              <OpenFullClientButton target={{ kind: 'home' }} />
            </View>
          ),
          tabBarIcon: (props) => <InboxIcon {...props} />,
          ...(pending > 0 ? { tabBarBadge: pending } : {}),
        }}
      />
    </Tabs>
  );
}
