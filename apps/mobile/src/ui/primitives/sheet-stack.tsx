import { useMemo, type ComponentProps, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useNavigation } from 'expo-router';
import { Platform, View } from 'react-native';
import { useStrings } from '../strings';
import { sheetStackHeader } from './sheet-header';

import { useDesignTheme } from '../design/theme';
import { SheetScreen } from './sheet-screen';
import { profileRootHeader } from '../chat/profile-presentation';

export function SheetStack({
  children,
  fullScreen = false,
  screenLayout,
}: {
  children: ReactNode;
  fullScreen?: boolean;
  screenLayout?: ComponentProps<typeof Stack>['screenLayout'];
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const navigation = useNavigation('/');
  const screen = useNavigation();
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);
  const header = useMemo(() => sheetStackHeader(() => navigation.goBack()), [navigation]);
  if (fullScreen)
    return (
      <View
        onAccessibilityEscape={() => navigation.goBack()}
        style={{ flex: 1, backgroundColor: theme.overlay.fill }}
      >
        <Stack
          {...(screenLayout === undefined ? {} : { screenLayout })}
          screenListeners={({ route }) => ({
            focus: () => {
              const header = profileRootHeader(route.name);
              if (header !== undefined) screen.setOptions(header);
            },
          })}
          screenOptions={({ route, navigation: childNavigation }) => ({
            headerStyle: { backgroundColor: theme.overlay.fill },
            headerTintColor: theme.color.fg,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle: t.back,
            contentStyle: { backgroundColor: theme.overlay.fill },
            ...(Platform.OS === 'ios' &&
            route.name !== 'index' &&
            childNavigation.getState().routes[0]?.key === route.key
              ? {
                  headerBackVisible: false,
                  unstable_headerLeftItems: () => [
                    {
                      type: 'button',
                      identifier: 'profile-child-back',
                      label: t.back,
                      icon: { type: 'sfSymbol', name: 'chevron.left' },
                      onPress: () => childNavigation.goBack(),
                    },
                  ],
                }
              : {}),
          })}
        >
          {children}
        </Stack>
      </View>
    );
  return (
    <SheetScreen onClose={() => navigation.goBack()}>
      <SafeAreaInsetsContext value={contentInsets}>
        <Stack
          screenOptions={{
            header,
            headerStyle: { backgroundColor: theme.overlay.fill },
            headerTintColor: theme.color.fg,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle: t.back,
            contentStyle: { backgroundColor: theme.overlay.fill },
          }}
        >
          {children}
        </Stack>
      </SafeAreaInsetsContext>
    </SheetScreen>
  );
}
