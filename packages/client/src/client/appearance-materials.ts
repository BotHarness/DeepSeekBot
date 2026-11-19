import type { AppearanceConfig, AppearanceMode, AppearanceModeConfig } from './appearance.js';
import { TOBS_TOKENS } from './ds/tobs-tokens.generated.js';
export interface AppearanceMaterial extends Record<string, unknown> {
  color: string;
  opacity: number;
  blur: number;
}
export type AppearanceMaterials = Record<'header' | 'body', AppearanceMaterial>;
export type AppearanceMaterialOverrides = Partial<
  Record<'header' | 'body', Partial<AppearanceMaterial>>
>;
export type MaterialLayers = Readonly<
  Record<'--tobs-layer-raised' | '--tobs-layer-canvas', string>
>;

export function appearanceMaterials(
  config: AppearanceModeConfig,
  mode: AppearanceMode,
  layers: MaterialLayers = TOBS_TOKENS[mode],
): AppearanceMaterials {
  return {
    header: {
      color: layers['--tobs-layer-raised'],
      opacity: 100,
      blur: 0,
      ...config.materials?.header,
    },
    body: {
      color: layers['--tobs-layer-canvas'],
      opacity: 100,
      blur: 0,
      ...config.materials?.body,
    },
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
