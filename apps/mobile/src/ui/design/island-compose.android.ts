import { Shape } from '@expo/ui/jetpack-compose';
import { background, clip, dropShadow, innerShadow } from '@expo/ui/jetpack-compose/modifiers';

import { islandRim } from './island';
import type { DesignTheme } from './theme';
import { island } from './tokens';

export function composeIsland(theme: DesignTheme, height: number) {
  const scheme = theme.scheme;
  const rim = islandRim(scheme);
  const pill = { type: 'roundedCorner', radius: height / 2 } as const;
  return {
    surface: {
      color: 'transparent',
      contentColor: theme.color.fg,
      shape: Shape.Pill({}),
      border: { width: rim.borderWidth, color: rim.borderColor },
    },
    modifiers: [
      dropShadow(pill, {
        radius: island.shadow.radius,
        offsetY: island.shadow.offsetY,
        color: island.shade,
        alpha: island.shadow[scheme],
      }),
      clip(pill),
      background(theme.layer.raised.fill),
      innerShadow(pill, {
        radius: island.highlight.width,
        offsetY: island.highlight.width,
        color: island.light,
        alpha: island.highlight[scheme],
      }),
    ],
  };
}
