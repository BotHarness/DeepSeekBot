import type { DesignTheme } from './theme';
import { island } from './tokens';

type Scheme = DesignTheme['scheme'];

function rgba(hex: string, alpha: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}

export function islandRim(scheme: Scheme): { borderWidth: number; borderColor: string } {
  return {
    borderWidth: island.rim.width,
    borderColor: rgba(island.ink[scheme], island.rim[scheme]),
  };
}

export function islandHighlight(scheme: Scheme): string {
  const width = island.highlight.width;
  return `inset 0 ${width}px ${width}px ${rgba(island.light, island.highlight[scheme])}`;
}

export function islandShadow(scheme: Scheme): string {
  const { offsetY, radius } = island.shadow;
  return `0 ${offsetY}px ${radius}px ${rgba(island.shade, island.shadow[scheme])}`;
}

export function islandStyle(theme: DesignTheme, pressed = false) {
  return {
    backgroundColor: pressed ? theme.layer.raised.pressed : theme.layer.raised.fill,
    ...islandRim(theme.scheme),
    boxShadow: `${islandShadow(theme.scheme)}, ${islandHighlight(theme.scheme)}`,
  };
}
