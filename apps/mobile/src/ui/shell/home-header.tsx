import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Platform, Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ConversationEnvironment } from '../../host/conversation-environments';
import { hostColorInk } from '../design/host-look';
import { materialSearchHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { chatList, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { t } from '../strings';
import { ChatsIcon, ChevronDownIcon, CloudIcon } from './icons';
import { HostGlyph } from './host-tile';
import { focusOn, hostDrawer, openHostDrawer, useHostDrawerOpen } from './host-drawer';

export function HomeHeader({
  environment,
  actions,
  search,
  children,
}: {
  environment: ConversationEnvironment;
  actions?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
}) {
  const theme = useDesignTheme();
  const focused = useIsFocused();
  const drawerOpen = useHostDrawerOpen();
  const insets = useSafeAreaInsets();
  const chip = useMounted<ViewInstance>((node) => {
    hostDrawer.setReturnFocus(() => focusOn(node));
    return () => hostDrawer.setReturnFocus(undefined);
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.base }}>
      {focused ? <StatusBar style={theme.scheme === 'dark' ? 'light' : 'dark'} /> : null}
      <View
        testID="home-header"
        style={{
          minHeight:
            Platform.OS === 'android'
              ? insets.top + space.x2 * 2 + materialSearchHeight(theme.fontScale)
              : undefined,
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x2,
          paddingHorizontal: chatList.gutter,
          paddingTop: insets.top + space.x2,
          paddingBottom: space.x2,
        }}
      >
        {search ?? (
          <>
            <Pressable
              ref={chip}
              testID="chats-view-button"
              onPress={openHostDrawer}
              accessibilityRole="button"
              accessibilityLabel={`${t.workspaces}, ${environment.accessibilityLabel ?? environment.title}`}
              accessibilityState={{ expanded: drawerOpen }}
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
              <ChevronDownIcon color={theme.color.muted} size={theme.type.body.line} />
            </Pressable>
            {actions}
          </>
        )}
      </View>
      {children}
    </View>
  );
}
