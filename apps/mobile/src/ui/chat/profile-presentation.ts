import { Platform } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { zoomTransition } from './profile-shell';

export function profileScreenOptions(theme: DesignTheme, reducedMotion: boolean) {
  return {
    headerShown: false,
    presentation: 'fullScreenModal' as const,
    gestureEnabled: true,
    contentStyle: { backgroundColor: theme.overlay.fill },
    ...(Platform.OS === 'ios' && zoomTransition && !reducedMotion
      ? {}
      : { animation: 'fade' as const }),
  };
}
