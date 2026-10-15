import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { glassShadow, glassTint, useDesignTheme } from '../../src/ui/design/theme';
import { edge, glass, radius, space } from '../../src/ui/design/tokens';
import { HostDrawer } from '../../src/ui/shell/host-drawer';
import { ActivityIcon, ChatsIcon } from '../../src/ui/shell/icons';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        safeAreaInsets={{ bottom: 0 }}
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.color.fg,
          tabBarInactiveTintColor: theme.color.muted,
          tabBarActiveBackgroundColor: theme.color.selected,
          tabBarStyle: {
            height: theme.touch + space.x6,
            marginHorizontal: space.x6,
            marginBottom: Math.max(insets.bottom, space.x5),
            paddingTop: space.x2,
            paddingBottom: space.x2,
            paddingHorizontal: space.x2,
            borderRadius: radius.round,
            borderTopWidth: edge.hairline,
            borderWidth: edge.hairline,
            borderColor: theme.color.border,
            borderTopColor: theme.color.border,
            backgroundColor: glassTint(theme.color.base),
            ...({ backdropFilter: `blur(${glass.blur}px) saturate(${glass.saturate}%)` } as object),
            boxShadow: glassShadow(theme.scheme),
          },
          tabBarItemStyle: { borderRadius: radius.round, overflow: 'hidden' },
          tabBarLabelStyle: { fontSize: theme.type.meta.size },
          sceneStyle: { backgroundColor: theme.color.base },
        }}
      >
        <Tabs.Screen name="(home)" options={{ title: t.chats, tabBarIcon: ChatsIcon }} />
        <Tabs.Screen
          name="(activity)"
          options={{
            title: t.activity,
            tabBarIcon: ActivityIcon,
            ...(pending > 0 ? { tabBarBadge: pending } : {}),
          }}
        />
      </Tabs>
      <HostDrawer />
    </View>
  );
}
