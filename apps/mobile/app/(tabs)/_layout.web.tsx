import { Tabs } from 'expo-router/js-tabs';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { useDesignTheme } from '../../src/ui/design/theme';
import { ActivityIcon, HomeIcon, MeIcon } from '../../src/ui/shell/web-tab-icons';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  const theme = useDesignTheme();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.accent,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          backgroundColor: theme.color.surface,
          borderTopColor: theme.color.border,
        },
        sceneStyle: { backgroundColor: theme.color.base },
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: t.home, tabBarIcon: HomeIcon }} />
      <Tabs.Screen
        name="(activity)"
        options={{
          title: t.activity,
          tabBarIcon: ActivityIcon,
          ...(pending > 0 ? { tabBarBadge: pending } : {}),
        }}
      />
      <Tabs.Screen name="(me)" options={{ title: t.me, tabBarIcon: MeIcon }} />
    </Tabs>
  );
}
