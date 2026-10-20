import { useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { Pressable, View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { useMounted } from '../mounted';
import { t } from '../strings';
import { ChevronDownIcon } from './icons';
import { focusOn, hostDrawer, openHostDrawer, useHostDrawerOpen } from './host-drawer';

export function HomeHeader({
  actions,
  search,
  children,
}: {
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
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.x2,
          paddingHorizontal: space.x4,
          paddingTop: insets.top + space.x2,
          paddingBottom: space.x2,
        }}
      >
        {search ?? (
          <>
            <Pressable
              ref={chip}
              onPress={openHostDrawer}
              accessibilityRole="button"
              accessibilityLabel={t.workspaces}
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
              <Text variant="title" strong accessibilityRole="header" style={{ flexShrink: 1 }}>
                {t.chats}
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
