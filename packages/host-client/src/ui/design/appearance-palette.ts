export type AppearanceMode = 'light' | 'dark';
export type AppearancePreference = AppearanceMode | 'system';

export const APPEARANCE_PRESETS = [
  'classic-blue',
  'mist-purple',
  'forest-green',
  'warm-amber',
] as const;
export type AppearancePreset = (typeof APPEARANCE_PRESETS)[number];
export const DEFAULT_APPEARANCE_PRESET: AppearancePreset = 'classic-blue';

export const APPEARANCE_PRIMARY = {
  'classic-blue': { light: '#4176e6', dark: '#7aaaff' },
  'mist-purple': { light: '#7957c9', dark: '#b19af0' },
  'forest-green': { light: '#287454', dark: '#7cc7a0' },
  'warm-amber': { light: '#94600d', dark: '#e6b75c' },
} as const satisfies Record<AppearancePreset, Record<AppearanceMode, string>>;

export interface AppearancePalette {
  preset: AppearancePreset;
  primary?: string;
}

export const isAppearancePreset = (value: unknown): value is AppearancePreset =>
  typeof value === 'string' && (APPEARANCE_PRESETS as readonly string[]).includes(value);

export const isAppearancePreference = (value: unknown): value is AppearancePreference =>
  value === 'system' || value === 'light' || value === 'dark';

export const isAppearancePrimary = (value: unknown): value is string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/iu.test(value);

export function appearancePrimary(palette: AppearancePalette, mode: AppearanceMode): string {
  return palette.primary ?? APPEARANCE_PRIMARY[palette.preset][mode];
}
