import { Tabs } from 'expo-router/js-tabs';
import type { ComponentType } from 'react';
import { View, type ColorValue } from 'react-native';

import { actionCount } from '../../src/host/inbox';
import { useHostSession, useInbox } from '../../src/host/host-session';
import { useDesignTheme } from '../../src/ui/design/theme';
import { radius, space } from '../../src/ui/design/tokens';
import { ActivityIcon, HomeIcon, MeIcon } from '../../src/ui/shell/icons';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  const theme = useDesignTheme();
  const { inbox } = useHostSession();
  const pending = actionCount(useInbox(inbox));
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.fg,
        tabBarInactiveTintColor: theme.color.muted,
        tabBarStyle: {
          height: theme.touch * 2,
          paddingTop: space.x3,
          backgroundColor: theme.color.base,
          borderTopColor: theme.color.border,
        },
        tabBarLabelStyle: { fontSize: theme.type.meta.size },
        sceneStyle: { backgroundColor: theme.color.base },
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: t.home, tabBarIcon: pill(HomeIcon) }} />
      <Tabs.Screen
        name="(activity)"
        options={{
          title: t.activity,
          tabBarIcon: pill(ActivityIcon),
          ...(pending > 0 ? { tabBarBadge: pending } : {}),
        }}
      />
      <Tabs.Screen name="(me)" options={{ title: t.me, tabBarIcon: pill(MeIcon) }} />
    </Tabs>
  );
}

type TabIcon = ComponentType<{ color: ColorValue; size: number; focused: boolean }>;

function pill(Icon: TabIcon) {
  return function PillIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return <Pill Icon={Icon} color={color} focused={focused} />;
  };
}

function Pill({ Icon, color, focused }: { Icon: TabIcon; color: ColorValue; focused: boolean }) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        width: theme.touch + space.x5,
        height: theme.touch - space.x5,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: focused ? theme.layer.canvas.selected : 'transparent',
      }}
    >
      <Icon color={color} size={theme.type.title.line} focused={focused} />
    </View>
  );
}
