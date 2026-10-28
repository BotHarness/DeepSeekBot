import { Platform } from 'react-native';
import type { DesignTheme } from '../design/theme';

export function profileScreenOptions(theme: DesignTheme) {
  return {
    headerShown: false,
    presentation: 'card' as const,
    animation: Platform.OS === 'android' ? ('slide_from_right' as const) : ('default' as const),
    gestureEnabled: true,
    fullScreenGestureEnabled: false,
    contentStyle: { backgroundColor: theme.overlay.fill },
  };
}
