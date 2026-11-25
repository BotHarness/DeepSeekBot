import { useContext } from 'react';

import type { LayerName } from '../design/layers';
import { useMaterialRoles } from '../design/material-tokens';
import { useDesignTheme } from '../design/theme';
import { SystemSheet } from './system-sheet';

export function useSheetGroupFill(on: LayerName) {
  const layer = useDesignTheme().layer[on];
  const roles = useMaterialRoles();
  const system = useContext(SystemSheet);
  return system
    ? {
        fill: roles.surfaceContainerHigh,
        pressed: roles.surfaceContainerHighest,
        divider: roles.outlineVariant,
      }
    : { fill: layer.fill, pressed: layer.pressed, divider: layer.divider };
}
