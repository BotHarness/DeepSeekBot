import { useMemo, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useNavigation } from 'expo-router';
import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import { Platform, View } from 'react-native';
import { space } from '../design/tokens';
import { useStrings } from '../strings';
import { DrawerHeader } from './drawer-header';

import { useDesignTheme } from '../design/theme';
import { SheetScreen } from './sheet-screen';
import { profileRootHeader } from '../chat/profile-presentation';

function SheetStackHeader({ back, navigation, options, route }: NativeStackHeaderProps) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        paddingHorizontal: space.x5,
        paddingTop: space.x3,
        paddingBottom: space.x3,
        backgroundColor: theme.overlay.fill,
      }}
    >
      <DrawerHeader
        title={typeof options.title === 'string' ? options.title : route.name}
        {...(back === undefined ? {} : { onBack: () => navigation.goBack() })}
      />
    </View>
  );
}

export function SheetStack({
  children,
  modalGrabber = false,
  fullScreen = false,
}: {
  children: ReactNode;
  modalGrabber?: boolean;
  fullScreen?: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const navigation = useNavigation('/');
  const screen = useNavigation();
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);
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
    <SheetScreen modalGrabber={modalGrabber} onClose={() => navigation.goBack()}>
      <SafeAreaInsetsContext value={contentInsets}>
        <Stack
          screenOptions={{
            ...(Platform.OS === 'android' ? { header: SheetStackHeader } : {}),
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
