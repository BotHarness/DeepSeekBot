import { File, Paths } from 'expo-file-system';

import {
  defaultAppearanceDocument,
  parseAppearanceDocument,
  type AppearanceDocument,
} from './appearance-model';

export {
  APPEARANCE_PRESETS,
  APPEARANCE_VERSION,
  coerceAppearanceDocument,
  coerceWallpaper,
  defaultAppearanceDocument,
  modeFor,
  paintSource,
  parseAppearanceDocument,
  setMaterialEnabled,
  setPreference,
  setPreset,
  setStyle,
  setWallpaper,
  usesGlass,
  type AppearanceDocument,
  type Material,
  type ModeConfig,
  type Preference,
  type Scheme,
  type ThemePreset,
  type ThemeStyle,
  type WallpaperMedia,
} from './appearance-model';

const FILE_NAME = 'deepseekbot-appearance.json';

export function appearanceFile() {
  return new File(Paths.document, FILE_NAME);
}

export function writeAppearanceDocument(doc: AppearanceDocument, expectedRevision?: number): void {
  const f = appearanceFile();
  if (expectedRevision !== undefined) {
    if (!f.exists) throw Error('appearance-revision-conflict');
    let current: AppearanceDocument;
    try {
      current = parseAppearanceDocument(f.textSync());
    } catch {
      throw Error('appearance-storage-unreadable');
    }
    if (current.revision !== expectedRevision) throw Error('appearance-revision-conflict');
  }
  const body = JSON.stringify(doc);
  try {
    if (!f.exists) f.create();
    f.writeSync(body);
  } catch {
    if (!f.exists || f.textSync() !== body) throw Error('appearance-storage-failed');
  }
  if (f.textSync() !== body) throw Error('appearance-storage-failed');
}

export async function readAppearanceDocument(): Promise<AppearanceDocument> {
  const f = appearanceFile();
  if (!f.exists) return defaultAppearanceDocument();
  return parseAppearanceDocument(await f.text());
}
