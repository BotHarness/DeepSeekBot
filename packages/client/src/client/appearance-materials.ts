import type {
  AppearanceConfig,
  AppearanceMode,
  AppearanceModeConfig,
  AppearancePreset,
} from './appearance.js';
export interface AppearanceMaterial extends Record<string, unknown> {
  color: string;
  opacity: number;
  blur: number;
}
export type AppearanceMaterials = Record<'header' | 'body', AppearanceMaterial>;
export type AppearanceMaterialOverrides = Partial<
  Record<'header' | 'body', Partial<AppearanceMaterial>>
>;
const defaults: Record<AppearancePreset, Record<AppearanceMode, AppearanceMaterials>> = {
  'classic-blue': {
    light: {
      header: { color: '#fdfefe', opacity: 100, blur: 0 },
      body: { color: '#fdfefe', opacity: 100, blur: 0 },
    },
    dark: {
      header: { color: '#1a1a1c', opacity: 100, blur: 0 },
      body: { color: '#1a1a1c', opacity: 100, blur: 0 },
    },
  },
  'mist-purple': {
    light: {
      header: { color: '#f0eafa', opacity: 88, blur: 16 },
      body: { color: '#f8f5fc', opacity: 80, blur: 12 },
    },
    dark: {
      header: { color: '#292334', opacity: 88, blur: 16 },
      body: { color: '#211d2b', opacity: 80, blur: 12 },
    },
  },
  'forest-green': {
    light: {
      header: { color: '#e7f2ec', opacity: 88, blur: 16 },
      body: { color: '#f2f8f4', opacity: 80, blur: 12 },
    },
    dark: {
      header: { color: '#203129', opacity: 88, blur: 16 },
      body: { color: '#1b2721', opacity: 80, blur: 12 },
    },
  },
  'warm-amber': {
    light: {
      header: { color: '#faf0db', opacity: 90, blur: 14 },
      body: { color: '#fcf7ed', opacity: 82, blur: 10 },
    },
    dark: {
      header: { color: '#352c1f', opacity: 90, blur: 14 },
      body: { color: '#2b251c', opacity: 82, blur: 10 },
    },
  },
};
export function appearanceMaterials(
  config: AppearanceModeConfig,
  mode: AppearanceMode,
): AppearanceMaterials {
  const preset = defaults[config.preset][mode];
  return {
    header: { ...preset.header, ...config.materials?.header },
    body: { ...preset.body, ...config.materials?.body },
  };
}
export function validMaterial(
  value: unknown,
  strict = false,
): value is Partial<AppearanceMaterial> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (
    strict &&
    (!Object.keys(v).length ||
      Object.keys(v).some((k) => !['color', 'opacity', 'blur'].includes(k)))
  )
    return false;
  return (
    (v.color === undefined || (typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color))) &&
    (v.opacity === undefined ||
      (typeof v.opacity === 'number' &&
        Number.isFinite(v.opacity) &&
        v.opacity >= 0 &&
        v.opacity <= 100)) &&
    (v.blur === undefined ||
      (typeof v.blur === 'number' && Number.isFinite(v.blur) && v.blur >= 0 && v.blur <= 40))
  );
}
export function validMaterials(
  value: unknown,
  strict = false,
): value is AppearanceMaterialOverrides {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return (
    (!strict ||
      (Object.keys(v).length > 0 && Object.keys(v).every((k) => k === 'header' || k === 'body'))) &&
    (v.header === undefined || validMaterial(v.header, strict)) &&
    (v.body === undefined || validMaterial(v.body, strict))
  );
}
export function clearMaterialAdjustments(config: AppearanceModeConfig): void {
  for (const part of ['header', 'body'] as const) {
    const material = config.materials?.[part];
    if (!material) continue;
    delete material.color;
    delete material.opacity;
    delete material.blur;
  }
}
export const WALLPAPER_MATERIALS = {
  header: { opacity: 80 },
  body: { opacity: 50, blur: 2 },
} as const;
export function wallpaperMaterialPatches(config: AppearanceConfig) {
  return (['light', 'dark'] as const)
    .filter((mode) =>
      (['header', 'body'] as const).every((part) => {
        const material = config.modes[mode].materials?.[part];
        return material?.opacity === undefined && material?.blur === undefined;
      }),
    )
    .map((mode) => ({ mode, materials: WALLPAPER_MATERIALS }));
}
