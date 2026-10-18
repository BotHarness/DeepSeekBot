import { useMemo, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Stack, useNavigation } from 'expo-router';
import type { NativeStackHeaderProps } from 'expo-router/native-stack';
import { Platform, Pressable, View } from 'react-native';
import { space } from '../design/tokens';
import { ChevronLeftIcon } from '../shell/icons';
import { t } from '../strings';
import { Text } from './text';

import { useDesignTheme } from '../design/theme';
import { SheetScreen } from './sheet-screen';

function SheetStackHeader({ back, navigation, options, route }: NativeStackHeaderProps) {
  const theme = useDesignTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.x3,
        minHeight: theme.touch + space.x4,
        paddingHorizontal: space.x3,
        backgroundColor: theme.overlay.fill,
      }}
    >
      {back === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t.back}
          onPress={() => navigation.goBack()}
          style={{
            minWidth: theme.touch,
            minHeight: theme.touch,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ChevronLeftIcon color={theme.color.fg} size={theme.type.title.line} />
        </Pressable>
      )}
      <Text accessibilityRole="header" variant="title" strong numberOfLines={1} style={{ flex: 1 }}>
        {options.title ?? route.name}
      </Text>
    </View>
  );
}

export function SheetStack({ children }: { children: ReactNode }) {
  const theme = useDesignTheme();
  const navigation = useNavigation('/');
  const insets = useSafeAreaInsets();
  const contentInsets = useMemo(() => ({ ...insets, top: 0 }), [insets]);
  return (
    <SheetScreen onClose={() => navigation.goBack()}>
      <SafeAreaInsetsContext value={contentInsets}>
        <Stack
          screenOptions={{
            ...(Platform.OS === 'android' ? { header: SheetStackHeader } : {}),
            headerStyle: { backgroundColor: theme.overlay.fill },
            headerTintColor: theme.color.fg,
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: theme.overlay.fill },
          }}
        >
          {children}
        </Stack>
      </SafeAreaInsetsContext>
    </SheetScreen>
  );
}
