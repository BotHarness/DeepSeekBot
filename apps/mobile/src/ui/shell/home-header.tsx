import type { ConnectionState } from '@botharness/host-client/client';
import { ConnectionProgress, useConnectionProgress } from '../primitives/connection-progress';
import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import { Platform, Pressable, View, type LayoutChangeEvent, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationEnvironment } from '../../host/conversation-environments';
import { hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { materialSearchHeight, searchAppBarHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { ChatsIcon, ChevronDownIcon, ChevronLeftIcon, CloudIcon } from './icons';
import { HostGlyph } from './host-tile';
import { focusOn, hostDrawer, openHostDrawer, useHostDrawerOpen } from './host-drawer';
import { FixedToolbar } from './fixed-toolbar';
import { TabPageHeader } from './tab-page-header';

export function HomeHeader({
  environment,
  connection,
  disruptedSince,
  actions,
  search,
  bar,
  barActions,
  onWorkspaces,
  children,
}: {
  environment: ConversationEnvironment;
  connection?: ConnectionState | undefined;
  disruptedSince?: number | undefined;
  actions?: ReactNode;
  search?: ReactNode;
  bar?: ReactNode;
  barActions?: ReactNode;
  onWorkspaces?: (() => void) | undefined;
  children: ReactNode;
}) {
  const t = useStrings();
  const connectionLabel = useConnectionProgress(connection?.status, false, disruptedSince);
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const drawerOpen = useHostDrawerOpen();
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  const searchBar = android && bar !== undefined;
  const minimumHeight = searchBar
    ? insets.top + searchAppBarHeight(theme.fontScale)
    : insets.top + space.x2 * 2 + materialSearchHeight(theme.fontScale);
  const [measurement, setMeasurement] = useState({ searchBar, height: 0 });
  const height = Math.max(
    minimumHeight,
    measurement.searchBar === searchBar ? measurement.height : 0,
  );
  const measure = ({ nativeEvent }: LayoutChangeEvent) => {
    const next = nativeEvent.layout.height;
    setMeasurement((previous) =>
      previous.searchBar === searchBar && previous.height === next
        ? previous
        : { searchBar, height: next },
    );
  };
  const chip = useMounted<ViewInstance>((node) => {
    hostDrawer.setReturnFocus(() => focusOn(node));
    return () => hostDrawer.setReturnFocus(undefined);
  }, []);
  const title = environment.kind === 'all' ? t.chats : environment.title;
  const location = (
    <Pressable
      ref={chip}
      testID="chats-view-button"
      onPress={onWorkspaces ?? openHostDrawer}
      accessibilityRole="button"
      accessibilityLabel={[
        onWorkspaces ? t.backToWorkspaces : t.workspaces,
        environment.accessibilityLabel ?? environment.title,
        connectionLabel,
      ]
        .filter(Boolean)
        .join(', ')}
      accessibilityState={{
        ...(onWorkspaces ? {} : { expanded: drawerOpen }),
        busy: connectionLabel !== undefined,
      }}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {onWorkspaces ? (
        <ChevronLeftIcon color={theme.color.accent} size={theme.type.title.line} />
      ) : null}
      {environment.kind === 'computer' && environment.hostIcon ? (
        <HostGlyph
          icon={environment.hostIcon}
          size={theme.type.title.line * theme.fontScale}
          color={hostColorInk(theme.scheme, theme.color, environment.hostColor)}
        />
      ) : environment.kind === 'cloud' ? (
        <CloudIcon color={theme.color.accent} size={theme.type.title.line * theme.fontScale} />
      ) : (
        <ChatsIcon color={theme.color.accent} size={theme.type.title.line * theme.fontScale} />
      )}
      <Text variant="title" strong accessibilityRole="header" style={{ flexShrink: 1 }}>
        {title}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} />
      {onWorkspaces ? null : (
        <ChevronDownIcon color={theme.color.muted} size={theme.type.body.line} />
      )}
    </Pressable>
  );
  const header = searchBar ? (
    <View
      testID="home-header"
      onLayout={measure}
      style={{
        backgroundColor: theme.color.base,
        minHeight: android ? minimumHeight : undefined,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        paddingTop: insets.top,
      }}
    >
      <View ref={chip} style={{ flex: 1 }}>
        {bar}
      </View>
      {barActions}
    </View>
  ) : (
    <TabPageHeader
      testID="home-header"
      onLayout={android ? measure : undefined}
      leading={search ?? location}
      actions={search === undefined ? actions : undefined}
    />
  );
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
          <View style={{ flex: 1, marginTop: height }}>{children}</View>
          <FixedToolbar height={height}>{header}</FixedToolbar>
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
          {children}
        </>
      )}
    </View>
  );
}
