import { BottomTabBar, Tabs } from 'expo-router/js-tabs';
import { useSegments } from 'expo-router';
import type { ComponentProps } from 'react';
import { View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActivityCount } from '../../src/host/native-activity-count';
import { badgeCount } from '../../src/ui/primitives/badge-count';
import { EdgeFade } from '../../src/ui/chat/header-chrome';
import { useDesignTheme } from '../../src/ui/design/theme';
import { Text } from '../../src/ui/primitives/text';
import { edge, edgeFade, navigationBar, radius, space } from '../../src/ui/design/tokens';
import { FloatingTabInset } from '../../src/ui/shell/floating-tab-inset';
import { HostDrawer } from '../../src/ui/shell/host-drawer';
import { ActivityIcon, ChatsIcon } from '../../src/ui/shell/icons';
import { NavigationButton } from '../../src/ui/shell/navigation-button.android';
import { NavigationIcon } from '../../src/ui/shell/navigation-icon.android';
import {
  ScrollChromeProvider,
  useChromeHidden,
  useChromeProgress,
} from '../../src/ui/shell/scroll-chrome';
import { t } from '../../src/ui/strings';

export default function TabsLayout() {
  return (
    <ScrollChromeProvider>
      <AndroidTabLayout />
    </ScrollChromeProvider>
  );
}

function ScrollTabBar({
  reserved,
  ...props
}: ComponentProps<typeof BottomTabBar> & { reserved: number }) {
  const progress = useChromeProgress();
  const hidden = useChromeHidden();
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: reserved * progress.value }],
    opacity: 1 - progress.value,
  }));
  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: reserved }, style]}
    >
      <EdgeFade edge="bottom" height={reserved + edgeFade.bottom} />
      <BottomTabBar {...props} />
    </Animated.View>
  );
}

function AndroidTabLayout() {
  const theme = useDesignTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const pending = useActivityCount().count ?? 0;
  const activitySelected = useSegments().includes('(activity)');
  const scale = Math.max(1, fontScale);
  const barWidth = Math.min(
    width - insets.left - insets.right - space.x6 * 2,
    navigationBar.itemWidth * 2 * scale + space.x3 * 2,
  );
  const iconHeight = Math.max(navigationBar.indicatorHeight, theme.type.title.line * scale);
  const height = iconHeight + theme.type.meta.line * scale + space.x5;
  const bottom = Math.max(insets.bottom, space.x4);
  const reserved = height + bottom + space.x5;
  return (
    <FloatingTabInset.Provider value={reserved}>
      <View style={{ flex: 1, backgroundColor: theme.color.base }}>
        <Tabs
          safeAreaInsets={{ bottom: 0 }}
          tabBar={(props) => <ScrollTabBar {...props} reserved={reserved} />}
          screenOptions={{
            headerShown: false,
            tabBarButton: (props) => <NavigationButton {...props} />,
            tabBarActiveTintColor: theme.color.fg,
            tabBarInactiveTintColor: theme.color.muted,
            tabBarStyle: {
              position: 'absolute',
              marginLeft: (width - barWidth + insets.left - insets.right) / 2,
              marginRight: (width - barWidth - insets.left + insets.right) / 2,
              width: barWidth,
              bottom,
              height,
              paddingVertical: navigationBar.itemPadding,
              paddingHorizontal: space.x2,
              borderRadius: navigationBar.radius,
              borderTopWidth: edge.hairline,
              borderWidth: edge.hairline,
              borderColor: theme.layer.raised.edge,
              borderTopColor: theme.layer.raised.edge,
              backgroundColor: theme.layer.raised.fill,
              elevation: 0,
              boxShadow: navigationBar.shadow[theme.scheme],
            },
            tabBarItemStyle: {
              borderRadius: radius.lg,
              overflow: 'hidden',
              minHeight: theme.touch,
            },
            tabBarIconStyle: {
              width: (barWidth - space.x2 * 2 - edge.hairline * 2) / 2,
              height: iconHeight,
            },
            tabBarLabel: ({ color, children }) => (
              <Text variant="meta" strong style={{ color, textAlign: 'center' }}>
                {children}
              </Text>
            ),
            tabBarLabelPosition: 'below-icon',
            sceneStyle: { backgroundColor: theme.color.base },
          }}
        >
          <Tabs.Screen
            name="(home)"
            options={{
              title: t.chats,
              tabBarIcon: ({ color, focused }) => (
                <NavigationIcon focused={focused} color={color}>
                  <ChatsIcon color={color} size={theme.type.title.line} />
                </NavigationIcon>
              ),
            }}
          />
          <Tabs.Screen
            name="(activity)"
            options={{
              title: t.activity,
              tabBarAccessibilityLabel:
                pending > 0 ? `${badgeCount(pending)}, ${t.activity}` : t.activity,
              tabBarIcon: ({ color, focused }) => (
                <NavigationIcon
                  focused={focused}
                  color={color}
                  count={pending}
                  countVisible={!activitySelected}
                >
                  <ActivityIcon color={color} size={theme.type.title.line} />
                </NavigationIcon>
              ),
            }}
          />
        </Tabs>
        <HostDrawer />
      </View>
    </FloatingTabInset.Provider>
  );
}
