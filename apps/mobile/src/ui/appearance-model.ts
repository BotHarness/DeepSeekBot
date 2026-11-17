import type { PlatformOS } from './design/tokens';

export const APPEARANCE_VERSION = 1;
export const APPEARANCE_PRESETS = [
  'classic-blue',
  'mist-purple',
  'forest-green',
  'warm-amber',
] as const;
export type ThemePreset = (typeof APPEARANCE_PRESETS)[number];
export type ThemeStyle = 'default' | 'glass' | 'image';
export type Preference = 'system' | 'light' | 'dark';
export type Scheme = 'light' | 'dark';
export type Material = { color: string; opacity: number; blur: number };

export type WallpaperMedia =
  | { kind: 'color'; color: string }
  | { kind: 'image'; id: string; fit: 'cover' | 'contain'; x: number; y: number; fade: number }
  | {
      kind: 'video';
      id: string;
      posterId?: string;
      fit: 'cover' | 'contain';
      x: number;
      y: number;
      fade: number;
    };

export type ModeConfig = {
  preset: ThemePreset;
  primary?: string;
  materials?: { header?: Partial<Material>; body?: Partial<Material> };
};

export type AppearanceDocument = {
  version: typeof APPEARANCE_VERSION;
  revision: number;
  preference: Preference;
  style: ThemeStyle;
  modes: { light: ModeConfig; dark: ModeConfig };
  wallpaper?: WallpaperMedia;
  materialEnabled: boolean;
};

const HEX = /^#[\da-f]{6}$/iu;
const MEDIA_ID = /^[\w-]+\.(?:jpg|jpeg|png|mp4|mov|webm)$/iu;
const PREFERENCES: readonly Preference[] = ['system', 'light', 'dark'];
const STYLES: readonly ThemeStyle[] = ['default', 'glass', 'image'];

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const oneOf = <T extends string>(value: unknown, set: readonly T[]): value is T =>
  typeof value === 'string' && (set as readonly string[]).includes(value);

export function defaultAppearanceDocument(): AppearanceDocument {
  return {
    version: APPEARANCE_VERSION,
    revision: 1,
    preference: 'system',
    style: 'default',
    modes: {
      light: { preset: 'classic-blue' },
      dark: { preset: 'classic-blue' },
    },
    materialEnabled: false,
  };
}

function coerceMaterial(part: unknown): Partial<Material> | undefined {
  if (!isObject(part)) return undefined;
  const out: Partial<Material> = {};
  if (typeof part['color'] === 'string' && HEX.test(part['color']))
    out.color = part['color'].toLowerCase();
  if (finite(part['opacity'], 0, 100)) out.opacity = part['opacity'];
  if (finite(part['blur'], 0, 100)) out.blur = part['blur'];
  return Object.keys(out).length > 0 ? out : undefined;
}

function coerceMode(raw: unknown, fallback: ModeConfig): ModeConfig {
  if (!isObject(raw)) return fallback;
  const preset = oneOf(raw['preset'], APPEARANCE_PRESETS) ? raw['preset'] : fallback.preset;
  const primary =
    typeof raw['primary'] === 'string' && HEX.test(raw['primary'])
      ? raw['primary'].toLowerCase()
      : undefined;
  const materialsRaw = isObject(raw['materials']) ? raw['materials'] : undefined;
  const header = coerceMaterial(materialsRaw?.['header']);
  const body = coerceMaterial(materialsRaw?.['body']);
  const materials =
    header !== undefined || body !== undefined
      ? {
          ...(header !== undefined ? { header } : {}),
          ...(body !== undefined ? { body } : {}),
        }
      : undefined;
  return {
    preset,
    ...(primary !== undefined ? { primary } : {}),
    ...(materials !== undefined ? { materials } : {}),
  };
}

export function coerceWallpaper(value: unknown): WallpaperMedia | undefined {
  if (!isObject(value)) return undefined;
  const placement = (raw: Record<string, unknown>) => ({
    fit: raw['fit'] === 'contain' ? ('contain' as const) : ('cover' as const),
    x: finite(raw['x'], 0, 1) ? raw['x'] : 0.5,
    y: finite(raw['y'], 0, 1) ? raw['y'] : 0.5,
    fade:
      typeof raw['fade'] === 'number' && Number.isFinite(raw['fade'])
        ? Math.max(0, Math.min(100, raw['fade']))
        : 60,
  });
  if (value['kind'] === 'color') {
    return typeof value['color'] === 'string' && HEX.test(value['color'])
      ? { kind: 'color', color: value['color'].toLowerCase() }
      : undefined;
  }
  if (value['kind'] === 'image' && typeof value['id'] === 'string' && MEDIA_ID.test(value['id']))
    return { kind: 'image', id: value['id'], ...placement(value) };
  if (value['kind'] === 'video' && typeof value['id'] === 'string' && MEDIA_ID.test(value['id'])) {
    const poster =
      typeof value['posterId'] === 'string' && MEDIA_ID.test(value['posterId'])
        ? value['posterId']
        : undefined;
    return {
      kind: 'video',
      id: value['id'],
      ...(poster !== undefined ? { posterId: poster } : {}),
      ...placement(value),
    };
  }
  return undefined;
}

export function coerceAppearanceDocument(value: unknown): AppearanceDocument | undefined {
  if (!isObject(value) || value['version'] !== APPEARANCE_VERSION) return undefined;
  const revision = value['revision'];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1)
    return undefined;

  const base = defaultAppearanceDocument();
  const modes = isObject(value['modes']) ? value['modes'] : {};
  const wallpaper = coerceWallpaper(value['wallpaper']);

  return {
    version: APPEARANCE_VERSION,
    revision,
    preference: oneOf(value['preference'], PREFERENCES) ? value['preference'] : base.preference,
    style: oneOf(value['style'], STYLES) ? value['style'] : base.style,
    modes: {
      light: coerceMode(modes['light'], base.modes.light),
      dark: coerceMode(modes['dark'], base.modes.dark),
    },
    ...(wallpaper !== undefined ? { wallpaper } : {}),
    materialEnabled: value['materialEnabled'] === true,
  };
}

export function parseAppearanceDocument(raw: string): AppearanceDocument {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw Error('appearance-invalid-json');
  }
  const doc = coerceAppearanceDocument(value);
  if (doc === undefined) throw Error('appearance-invalid-document');
  return doc;
}

export function modeFor(doc: AppearanceDocument, system: Scheme): ModeConfig {
  const scheme: Scheme = doc.preference === 'system' ? system : doc.preference;
  return doc.modes[scheme];
}

export function paintSource(wallpaper: WallpaperMedia | undefined): string | undefined {
  if (wallpaper === undefined || wallpaper.kind === 'color') return undefined;
  if (wallpaper.kind === 'image') return wallpaper.id;
  return wallpaper.posterId ?? wallpaper.id;
}

export type ResolvedWallpaper = {
  uri: string;
  kind: 'image' | 'video';
  fit: 'cover' | 'contain';
  x: number;
  y: number;
  fade: number;
};

export function resolveWallpaperSource(
  doc: AppearanceDocument,
  imageUri: (id: string) => string,
): ResolvedWallpaper | undefined {
  const wallpaper = doc.wallpaper;
  if (wallpaper === undefined || wallpaper.kind === 'color') return undefined;
  const id = wallpaper.kind === 'video' ? (wallpaper.posterId ?? wallpaper.id) : wallpaper.id;
  return {
    uri: imageUri(id),
    kind: wallpaper.kind,
    fit: wallpaper.fit,
    x: wallpaper.x,
    y: wallpaper.y,
    fade: wallpaper.fade,
  };
}

export function usesGlass(doc: AppearanceDocument, os: PlatformOS): boolean {
  if (!doc.materialEnabled || (doc.style !== 'glass' && doc.style !== 'image')) return false;
  return os === 'ios' || os === 'android';
}

export function setPreference(doc: AppearanceDocument, preference: Preference): AppearanceDocument {
  return { ...doc, preference, revision: doc.revision + 1 };
}

export function setStyle(doc: AppearanceDocument, style: ThemeStyle): AppearanceDocument {
  return { ...doc, style, revision: doc.revision + 1 };
}

export function setMaterialEnabled(doc: AppearanceDocument, enabled: boolean): AppearanceDocument {
  return { ...doc, materialEnabled: enabled, revision: doc.revision + 1 };
}

export function setGlass(doc: AppearanceDocument, enabled: boolean): AppearanceDocument {
  const style: ThemeStyle = enabled ? (doc.style === 'default' ? 'glass' : doc.style) : 'default';
  return { ...doc, materialEnabled: enabled, style, revision: doc.revision + 1 };
}

export function setPreset(
  doc: AppearanceDocument,
  scheme: Scheme,
  preset: ThemePreset,
): AppearanceDocument {
  return {
    ...doc,
    modes: { ...doc.modes, [scheme]: { ...doc.modes[scheme], preset } },
    revision: doc.revision + 1,
  };
}

export function setWallpaper(
  doc: AppearanceDocument,
  wallpaper: WallpaperMedia | undefined,
): AppearanceDocument {
  const next: AppearanceDocument = { ...doc, revision: doc.revision + 1 };
  if (wallpaper === undefined) {
    delete next.wallpaper;
  } else {
    next.wallpaper = wallpaper;
  }
  return next;
}
