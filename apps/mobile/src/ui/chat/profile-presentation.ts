import { Platform } from 'react-native';

import type { DesignTheme } from '../design/theme';
import { sheetScreenOptions } from '../primitives/sheet-screen';
import { zoomTransition } from './profile-shell';

function transition(theme: DesignTheme, reducedMotion: boolean) {
  if (Platform.OS === 'android') return sheetScreenOptions(theme, true);
  if (zoomTransition && !reducedMotion) return { presentation: 'fullScreenModal' as const };
  return { presentation: 'fullScreenModal' as const, animation: 'fade' as const };
}

export function profileScreenOptions(theme: DesignTheme, reducedMotion: boolean) {
  return {
    headerShown: false,
    gestureEnabled: true,
    contentStyle: { backgroundColor: theme.overlay.fill },
    ...transition(theme, reducedMotion),
  };
}
