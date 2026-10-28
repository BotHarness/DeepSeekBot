import { Platform } from 'react-native';
import type { DesignTheme } from '../design/theme';

export function profileScreenOptions(theme: DesignTheme, reducedMotion = false) {
  return {
    presentation: 'card' as const,
    gestureEnabled: true,
    fullScreenGestureEnabled: false,
    contentStyle: { backgroundColor: theme.overlay.fill },
    ...(Platform.OS === 'ios'
      ? {
          animation: reducedMotion ? ('fade' as const) : ('default' as const),
          headerShown: true,
          headerTransparent: true,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal' as const,
          title: '',
        }
      : { animation: 'slide_from_right' as const, headerShown: false }),
  };
}

export function profileRootHeader(route: string): { headerShown: boolean } | undefined {
  return Platform.OS === 'ios' ? { headerShown: route === 'index' } : undefined;
}
