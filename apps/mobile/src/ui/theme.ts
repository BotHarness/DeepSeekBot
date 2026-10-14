import type { AggregatedState } from '../host/wire';
import { useDesignTheme, type DesignTheme } from './design/theme';

function legacy(color: DesignTheme['color']) {
  return {
    background: color.base,
    surface: color.elevated,
    ink: color.fg,
    inkSoft: color.muted,
    border: color.border,
    brand: color.success,
    accent: color.accent,
    onAccent: color.onAccent,
    warning: color.warning,
    danger: color.danger,
    warningSurface: color.warningSoft,
    dangerSurface: color.dangerSoft,
    codeSurface: color.hover,
    humanBubble: color.accent,
    humanInk: color.onAccent,
    botBubble: color.surface,
  };
}

export type Theme = ReturnType<typeof legacy>;

export function useTheme(): Theme {
  return legacy(useDesignTheme().color);
}

export function stateColor(theme: Theme, state: AggregatedState): string {
  switch (state) {
    case 'thinking':
      return theme.accent;
    case 'working':
      return theme.brand;
    case 'waiting':
      return theme.warning;
    case 'blocked':
      return theme.danger;
    default:
      return theme.inkSoft;
  }
}
