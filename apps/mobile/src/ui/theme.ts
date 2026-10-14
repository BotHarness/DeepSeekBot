import { useColorScheme } from 'react-native';

import type { AggregatedState } from '../host/wire';

const light = {
  background: '#f8fafc',
  surface: '#ffffff',
  ink: '#0f172a',
  inkSoft: '#475569',
  border: 'rgba(0, 0, 0, 0.12)',
  brand: '#16a34a',
  accent: '#2563eb',
  warning: '#b45309',
  danger: '#dc2626',
  warningSurface: '#fef3c7',
  dangerSurface: '#fee2e2',
};

const dark: typeof light = {
  background: '#0b1120',
  surface: '#111827',
  ink: '#f1f5f9',
  inkSoft: '#94a3b8',
  border: 'rgba(255, 255, 255, 0.16)',
  brand: '#22c55e',
  accent: '#60a5fa',
  warning: '#fbbf24',
  danger: '#f87171',
  warningSurface: '#3a2a07',
  dangerSurface: '#3b1212',
};

export type Theme = typeof light;

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
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
