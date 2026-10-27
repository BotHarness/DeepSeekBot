import type { ConnectionState } from '../../host/client';
import { ConnectionProgress, useConnectionProgress } from '../primitives/connection-progress';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationEnvironment } from '../../host/conversation-environments';
import { hostColorInk } from '../design/host-look';
import { materialSearchHeight, searchAppBarHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { chatList, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { ChatsIcon, ChevronDownIcon, CloudIcon } from './icons';
import { HostGlyph } from './host-tile';
import { focusOn, hostDrawer, openHostDrawer, useHostDrawerOpen } from './host-drawer';
import { CollapsingToolbar, useChromeProgress } from './scroll-chrome';

export function HomeHeader({
  environment,
  connection,
  actions,
  search,
  bar,
  children,
}: {
  environment: ConversationEnvironment;
  connection?: ConnectionState | undefined;
  actions?: ReactNode;
  search?: ReactNode;
  bar?: ReactNode;
  children: ReactNode | ((headerTravel: number) => ReactNode);
}) {
  const t = useStrings();
  const connectionLabel = useConnectionProgress(connection?.status);
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const drawerOpen = useHostDrawerOpen();
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const searchBar = android && bar !== undefined;
  const minimumHeight = searchBar
    ? insets.top + searchAppBarHeight(theme.fontScale)
    : insets.top + space.x2 * 2 + materialSearchHeight(theme.fontScale);
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const height = Math.max(minimumHeight, measuredHeight);
  const travel = android ? Math.max(0, height - insets.top) : 0;
  const progress = useChromeProgress();
  const pageStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -travel * progress.get() }],
  }));
  const chip = useMounted<ViewInstance>((node) => {
    hostDrawer.setReturnFocus(() => focusOn(node));
    return () => hostDrawer.setReturnFocus(undefined);
  }, []);
  const header = (
    <View
      testID="home-header"
      onLayout={android ? (event) => setMeasuredHeight(event.nativeEvent.layout.height) : undefined}
      style={{
        backgroundColor: theme.color.base,
        minHeight: android ? minimumHeight : undefined,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingHorizontal: searchBar ? 0 : chatList.gutter,
        paddingTop: insets.top + (searchBar ? 0 : space.x2),
        paddingBottom: searchBar ? 0 : space.x2,
      }}
    >
      {searchBar ? (
        <View ref={chip} style={{ flex: 1 }}>
          {bar}
        </View>
      ) : (
        (search ?? (
          <>
            <Pressable
              ref={chip}
              testID="chats-view-button"
              onPress={openHostDrawer}
              accessibilityRole="button"
              accessibilityLabel={[
                t.workspaces,
                environment.accessibilityLabel ?? environment.title,
                connectionLabel,
              ]
                .filter(Boolean)
                .join(', ')}
              accessibilityState={{ expanded: drawerOpen, busy: connectionLabel !== undefined }}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: theme.touch,
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.x2,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              {environment.kind === 'computer' && environment.hostIcon ? (
                <HostGlyph
                  icon={environment.hostIcon}
                  size={theme.type.title.line * theme.fontScale}
                  color={hostColorInk(theme.scheme, theme.color, environment.hostColor)}
                />
              ) : environment.kind === 'cloud' ? (
                <CloudIcon
                  color={theme.color.accent}
                  size={theme.type.title.line * theme.fontScale}
                />
              ) : (
                <ChatsIcon
                  color={theme.color.accent}
                  size={theme.type.title.line * theme.fontScale}
                />
              )}
              <Text
                variant="title"
                strong
                accessibilityRole="header"
                numberOfLines={Platform.OS === 'android' ? 1 : undefined}
                style={{ flexShrink: 1 }}
              >
                {environment.title}
              </Text>
              <ConnectionProgress active={connectionLabel !== undefined} />
              <ChevronDownIcon color={theme.color.muted} size={theme.type.body.line} />
            </Pressable>
            {actions}
          </>
        ))
      )}
    </View>
  );
  const content = typeof children === 'function' ? children(travel) : children;
  return (
    <View
      style={{
        flex: 1,
        overflow: android ? 'hidden' : undefined,
        backgroundColor: theme.color.base,
      }}
    >
      {focused ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
      {android ? (
        <>
          <Animated.View style={[{ flex: 1, marginTop: height, marginBottom: -travel }, pageStyle]}>
            {content}
          </Animated.View>
          <CollapsingToolbar travel={travel} height={height}>
            {header}
          </CollapsingToolbar>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: insets.top,
              backgroundColor: theme.color.base,
            }}
          />
        </>
      ) : (
        <>
          {header}
          {content}
        </>
      )}
    </View>
  );
}
