import { useMemo, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { TabBar, TabView } from 'react-native-tab-view';
import { useReducedMotion } from 'react-native-reanimated';
import type { ConversationEnvironment } from '../../host/conversation-environments';
import { useDesignTheme } from '../design/theme';
import { edge, environmentTab, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { CloudIcon, ComputerIcon } from './icons';

export function EnvironmentPager({
  routes,
  selected,
  onSelect,
  renderPage,
}: {
  routes: ConversationEnvironment[];
  selected: string;
  onSelect(key: string): void;
  renderPage(route: ConversationEnvironment, active: boolean): ReactNode;
}) {
  const theme = useDesignTheme();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const maxTabWidth = width * environmentTab.widthRatio;
  const index = Math.max(
    0,
    routes.findIndex((route) => route.key === selected),
  );
  const options = useMemo(
    () =>
      Object.fromEntries(
        routes.map((route) => [
          route.key,
          {
            accessibilityLabel: route.accessibilityLabel ?? route.title,
            label: ({ focused }: { focused: boolean }) => {
              const Icon =
                route.kind === 'cloud'
                  ? CloudIcon
                  : route.kind === 'computer'
                    ? ComputerIcon
                    : undefined;
              return (
                <View
                  key={`${theme.scheme}:${theme.fontScale}:${route.title}`}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: space.x2,
                    maxWidth: maxTabWidth - space.x5 * 2,
                  }}
                >
                  <Text
                    strong
                    tone={focused ? 'fg' : 'muted'}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                    style={{ flexShrink: 1 }}
                  >
                    {route.title}
                  </Text>
                  {Icon ? (
                    <View style={{ flexShrink: 0 }}>
                      <Icon color={theme.color.muted} size={theme.type.meta.line} />
                    </View>
                  ) : null}
                </View>
              );
            },
          },
        ]),
      ),
    [routes, theme, maxTabWidth],
  );
  return (
    <TabView
      navigationState={{ index, routes }}
      initialLayout={{ width }}
      onIndexChange={(next) => {
        const route = routes[next];
        if (route) onSelect(route.key);
      }}
      animationEnabled={!reducedMotion}
      lazy
      renderTabBar={(props) => (
        <TabBar
          {...props}
          scrollEnabled
          options={options}
          tabStyle={{
            width: 'auto',
            maxWidth: maxTabWidth,
            minHeight: theme.touch,
            paddingHorizontal: space.x5,
            paddingVertical: space.x4,
          }}
          style={{ backgroundColor: theme.color.base, elevation: 0, shadowOpacity: 0 }}
          indicatorStyle={{ backgroundColor: theme.color.accent, height: edge.focus }}
        />
      )}
      renderScene={({ route }) => renderPage(route, route.key === routes[index]?.key)}
    />
  );
}
