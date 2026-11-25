import { Shape } from '@expo/ui/jetpack-compose';
import { background, clip } from '@expo/ui/jetpack-compose/modifiers';

import { islandRim } from './island';
import type { DesignTheme } from './theme';

export function composeIsland(theme: DesignTheme, height: number) {
  const rim = islandRim(theme.scheme);
  const pill = { type: 'roundedCorner', radius: height / 2 } as const;
  return {
    surface: {
      color: 'transparent',
      contentColor: theme.color.fg,
      shape: Shape.Pill({}),
      border: { width: rim.borderWidth, color: rim.borderColor },
    },
    modifiers: [clip(pill), background(theme.layer.raised.fill)],
  };
}
