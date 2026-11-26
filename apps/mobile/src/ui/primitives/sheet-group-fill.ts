import type { LayerName } from '../design/layers';
import { useDesignTheme } from '../design/theme';

export function useSheetGroupFill(on: LayerName) {
  const layer = useDesignTheme().layer[on];
  return { fill: layer.fill, pressed: layer.pressed, divider: layer.divider };
}
