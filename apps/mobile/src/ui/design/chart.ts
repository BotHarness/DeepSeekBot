import { mix, type DesignTheme } from './resolve-theme';

export const chart = {
  bar: 14,
  spark: 40,
  plot: 120,
  stub: 2,
  cell: 12,
  gap: 3,
  dim: 0.35,
  callout: { ios: 192, android: 112 },
} as const;

const SERIES_STEPS = [0.62, 0.32, 0] as const;
const HEAT_STEPS = [0.75, 0.5, 0.25, 0] as const;

export function seriesTones(theme: DesignTheme, count: number, behind: string): string[] {
  const steps = count === 1 ? [0] : SERIES_STEPS.slice(SERIES_STEPS.length - count);
  return steps.map((step) => mix(theme.color.accent, behind, step));
}

export function heatTones(theme: DesignTheme, behind: string, empty: string): string[] {
  return [empty, ...HEAT_STEPS.map((step) => mix(theme.color.accent, behind, step))];
}
