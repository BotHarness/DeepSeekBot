import type { AppearanceMode, AppearanceModeConfig } from './appearance.js';
import {
  appearanceMaterials,
  validMaterials,
  validMaterial,
  type AppearanceMaterialOverrides,
  type AppearanceMaterials,
} from './appearance-materials.js';
export interface AppearanceTarget {
  id: string;
  label: string;
}
export type PanelMaterialPatch = Partial<
  Record<
    'header' | 'body',
    Partial<{ color: string | null; opacity: number | null; blur: number | null }>
  >
>;
export interface AppearancePanelPatch {
  id: string;
  materials?: PanelMaterialPatch;
  reset?: true;
}
export const panelTargetId = (id: string): string => `dock:${id}`;
export const validTargetId = (id: unknown): id is string =>
  typeof id === 'string' && /^dock:[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(id);
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export function validPanelOverrides(v: unknown): v is Record<string, AppearanceMaterialOverrides> {
  return (
    record(v) &&
    Object.entries(v).every(([id, materials]) => validTargetId(id) && validMaterials(materials))
  );
}
export function validPanelPatch(v: unknown): v is AppearancePanelPatch {
  if (
    !record(v) ||
    !validTargetId(v.id) ||
    Object.keys(v).some((k) => !['id', 'materials', 'reset'].includes(k))
  )
    return false;
  if (v.reset !== undefined) return v.reset === true && v.materials === undefined;
  const materials = v.materials;
  if (!record(materials) || !Object.keys(materials).length) return false;
  return Object.entries(materials).every(
    ([part, fields]) =>
      ['header', 'body'].includes(part) &&
      record(fields) &&
      Object.keys(fields).length > 0 &&
      Object.entries(fields).every(
        ([field, value]) =>
          ['color', 'opacity', 'blur'].includes(field) &&
          (value === null || validMaterial({ [field]: value }, true)),
      ),
  );
}
export function panelMaterials(
  config: AppearanceModeConfig,
  mode: AppearanceMode,
  id: string,
): AppearanceMaterials {
  const global = appearanceMaterials(config, mode);
  const own = config.panels?.[id];
  return { header: { ...global.header, ...own?.header }, body: { ...global.body, ...own?.body } };
}
export function applyPanelPatch(config: AppearanceModeConfig, patch: AppearancePanelPatch): void {
  config.panels ??= {};
  if (patch.reset) {
    delete config.panels[patch.id];
    return;
  }
  const current = (config.panels[patch.id] ??= {});
  for (const part of ['header', 'body'] as const) {
    const fields = patch.materials?.[part];
    if (!fields) continue;
    const surface = (current[part] ??= {});
    for (const [field, value] of Object.entries(fields)) {
      if (value === null) delete surface[field];
      else surface[field] = value;
    }
    if (!Object.keys(surface).length) delete current[part];
  }
  if (!Object.keys(current).length) delete config.panels[patch.id];
}
