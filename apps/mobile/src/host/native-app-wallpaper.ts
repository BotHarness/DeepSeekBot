import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const root = () => new Directory(Paths.document, 'app-wallpaper');
const mediaDir = () => new Directory(root(), 'media');
const MAX_EDGE = 2048;
const MAX_SOURCE_PIXELS = 16_000_000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MEDIA_ID = /^[\w-]+\.(?:jpg|jpeg|png|mp4|mov|webm)$/iu;

function nextId(extension: string): string {
  return `wp-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
}

export function wallpaperMediaUri(id: string): string {
  if (!MEDIA_ID.test(id)) throw Error('wallpaper-invalid-media');
  return new File(mediaDir(), id).uri;
}

async function saveJpeg(
  sourceUri: string,
  dimensions?: { width: number; height: number },
): Promise<{ id: string; width: number; height: number }> {
  const context = ImageManipulator.manipulate(sourceUri);
  let rendered: ImageRef | undefined;
  try {
    if (dimensions && (dimensions.width > MAX_EDGE || dimensions.height > MAX_EDGE)) {
      context.resize(
        dimensions.width >= dimensions.height ? { width: MAX_EDGE } : { height: MAX_EDGE },
      );
    }
    rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.88 });
    const dir = mediaDir();
    if (!dir.exists) dir.create({ intermediates: true });
    const id = nextId('jpg');
    const target = new File(dir, id);
    const temporary = new File(saved.uri);
    try {
      await temporary.copy(target);
      if (!target.exists || target.size === 0 || target.size > MAX_FILE_BYTES)
        throw Error('wallpaper-copy-failed');
      return { id, width: saved.width, height: saved.height };
    } catch (error) {
      if (target.exists) target.delete();
      throw error;
    } finally {
      if (temporary.exists) temporary.delete();
    }
  } finally {
    rendered?.release();
    context.release();
  }
}

export type PickedWallpaper =
  | { kind: 'image'; uri: string; width: number; height: number }
  | { kind: 'video-unavailable' };

export async function pickWallpaper(): Promise<PickedWallpaper | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (asset === undefined) return undefined;
  if (asset.type === 'video') {
    return { kind: 'video-unavailable' };
  }
  if (
    !Number.isSafeInteger(asset.width) ||
    !Number.isSafeInteger(asset.height) ||
    (asset.width ?? 0) < 1 ||
    (asset.height ?? 0) < 1 ||
    Math.max(asset.width ?? 0, asset.height ?? 0) > 16384 ||
    (asset.width ?? 0) * (asset.height ?? 0) > MAX_SOURCE_PIXELS
  )
    throw Error('wallpaper-image-budget');
  return { kind: 'image', uri: asset.uri, width: asset.width!, height: asset.height! };
}

export async function importWallpaperImage(source: {
  uri: string;
  width: number;
  height: number;
}): Promise<string> {
  return (await saveJpeg(source.uri, { width: source.width, height: source.height })).id;
}

export function removeWallpaperMedia(id: string): void {
  if (!MEDIA_ID.test(id)) return;
  const file = new File(wallpaperMediaUri(id));
  if (file.exists) file.delete();
}
