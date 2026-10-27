import { Platform } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { zoomTransition } from './profile-shell';

function transition(reducedMotion: boolean) {
  if (Platform.OS === 'android')
    return { presentation: 'card' as const, animation: 'default' as const };
  if (zoomTransition && !reducedMotion) return { presentation: 'fullScreenModal' as const };
  return { presentation: 'fullScreenModal' as const, animation: 'fade' as const };
}

export function profileScreenOptions(theme: DesignTheme, reducedMotion: boolean) {
  return {
    headerShown: false,
    gestureEnabled: true,
    contentStyle: { backgroundColor: theme.overlay.fill },
    ...transition(reducedMotion),
  };
}
