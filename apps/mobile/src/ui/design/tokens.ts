export type PlatformOS = 'ios' | 'android';

export const space = {
  x1: 2,
  x2: 4,
  x3: 8,
  x4: 12,
  x5: 16,
  x6: 24,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  round: 9999,
} as const;

export const edge = {
  hairline: 1,
  focus: 2,
} as const;

export type TypeRole = { size: number; line: number };

export const typeScale: Record<
  PlatformOS,
  Record<'meta' | 'body' | 'title' | 'display', TypeRole>
> = {
  ios: {
    meta: { size: 13, line: 18 },
    body: { size: 17, line: 22 },
    title: { size: 17, line: 22 },
    display: { size: 28, line: 34 },
  },
  android: {
    meta: { size: 12, line: 16 },
    body: { size: 14, line: 20 },
    title: { size: 16, line: 24 },
    display: { size: 24, line: 32 },
  },
};

export const weight: Record<PlatformOS, { regular: '400'; strong: '500' | '600' }> = {
  ios: { regular: '400', strong: '600' },
  android: { regular: '400', strong: '500' },
};

export const mono: Record<PlatformOS, string> = {
  ios: 'Menlo',
  android: 'monospace',
};

export const touch: Record<PlatformOS, number> = {
  ios: 44,
  android: 48,
};

export const glass = {
  tint: 72,
  blur: 24,
  saturate: 180,
} as const;

export const edgeFade = {
  top: 24,
  bottom: 24,
  stops: [
    { offset: 0, opacity: 0.8 },
    { offset: 0.5, opacity: 0.4 },
    { offset: 1, opacity: 0 },
  ],
} as const;

export const pointer = {
  fill: '#ffffff',
  rim: '#0f1115',
};

export const motion = {
  drawer: 250,
  lift: 500,
  menu: 160,
} as const;

export const lift = 0.96;

export const PRESS_TINT = 0.12;

export const scrim = {
  light: 0.32,
  dark: 0.6,
} as const;
