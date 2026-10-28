import { useMemo, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useNavigation } from 'expo-router';
import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import { Platform, View } from 'react-native';
import { useStrings } from '../strings';
import { SheetHeader } from './sheet-header';

import { useDesignTheme } from '../design/theme';
import { SheetScreen } from './sheet-screen';
import { profileRootHeader } from '../chat/profile-presentation';

function sheetStackHeader(close: () => void) {
  return function SheetStackHeader({ back, navigation, options, route }: NativeStackHeaderProps) {
    return (
      <SheetHeader
        title={typeof options.title === 'string' ? options.title : route.name}
        {...(back !== undefined
          ? { onBack: () => navigation.goBack() }
          : Platform.OS === 'ios'
            ? { onClose: close }
            : {})}
      />
    );
  };
}

export function SheetStack({
  children,
  fullScreen = false,
}: {
  children: ReactNode;
  fullScreen?: boolean;
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
          screenListeners={({ route }) => ({
            focus: () => {
              const header = profileRootHeader(route.name);
              if (header !== undefined) screen.setOptions(header);
            },
          })}
          screenOptions={{
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
