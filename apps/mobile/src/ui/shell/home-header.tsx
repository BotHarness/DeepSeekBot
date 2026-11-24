import type { ConnectionState } from '@botharness/host-client/client';
import { ConnectionProgress, useConnectionProgress } from '../primitives/connection-progress';
import { useIsFocused, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import type { NativeStackHeaderItem } from 'expo-router';
import { Platform, Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationEnvironment } from '../../host/conversation-environments';
import { hostColorInk } from '@botharness/host-client/ui/design/host-look';
import { materialSearchHeight, searchAppBarHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ChatsIcon, ChevronDownIcon, CloudIcon } from './icons';
import { HostGlyph } from './host-tile';
import { FixedToolbar } from './fixed-toolbar';
import { TabPageHeader } from './tab-page-header';
import { TabNativeHeader, type TabHeaderSearch } from './tab-native-header';

export function HomeHeader({
  environment,
  connection,
  disruptedSince,
  actions,
  search,
  bar,
  nativeSearch,
  nativeItems,
  children,
}: {
  environment: ConversationEnvironment;
  connection?: ConnectionState | undefined;
  disruptedSince?: number | undefined;
  actions?: ReactNode;
  search?: ReactNode;
  bar?: ReactNode;
  nativeSearch?: TabHeaderSearch | undefined;
  nativeItems?: NativeStackHeaderItem[] | undefined;
  children: ReactNode;
}) {
  const t = useStrings();
  const connectionLabel = useConnectionProgress(connection?.status, false, disruptedSince);
  const theme = useDesignTheme();
  const router = useRouter();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const native = Platform.OS === 'ios' && nativeSearch !== undefined;
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
  const title = environment.kind === 'all' ? t.chats : environment.title;
  const location = (
    <Pressable
      testID="chats-environment-name"
      accessibilityRole="button"
      accessibilityLabel={[environment.accessibilityLabel ?? environment.title, connectionLabel]
        .filter(Boolean)
        .join(', ')}
      accessibilityHint={t.environmentSheet.switch}
      accessibilityState={{ busy: connectionLabel !== undefined }}
      onPress={() => router.push('/environment')}
      style={({ pressed }) => ({
        minHeight: theme.touch,
        flexShrink: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x2,
        opacity: pressed ? 0.6 : 1,
      })}
    >
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
      <Text variant="title" strong style={{ flexShrink: 1 }}>
        {title}
      </Text>
      <ConnectionProgress active={connectionLabel !== undefined} />
      <ChevronDownIcon color={theme.color.muted} size={theme.type.body.line * theme.fontScale} />
    </Pressable>
  );
  const header = native ? (
    <>
      <TabNativeHeader
        title={title}
        leading={theme.largeText ? null : location}
        search={nativeSearch}
        items={nativeItems}
      />
      {theme.largeText ? (
        <View
          testID="home-header"
          style={{ paddingHorizontal: space.x5, paddingVertical: space.x2 }}
        >
          {location}
        </View>
      ) : null}
    </>
  ) : searchBar ? (
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
      <View style={{ flex: 1 }}>{bar}</View>
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
