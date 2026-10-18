import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useSyncExternalStore } from 'react';
import {
  createChatBackgrounds,
  parseBackgroundDocument,
  type BackgroundDocument,
  type BackgroundDimensions,
  type BackgroundSource,
} from './chat-background';

const root = () => new Directory(Paths.document, 'chat-backgrounds');
const images = () => new Directory(root(), 'images');
const records = () => new Directory(root(), 'settings');
const MAX_EDGE = 2048;
const MAX_SOURCE_PIXELS = 16_000_000;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const imageId = (id: string) => /^[\w-]+\.jpg$/u.test(id);

export function backgroundImageUri(id: string): string {
  if (!imageId(id)) throw Error('background-invalid-image');
  return new File(images(), id).uri;
}

export function nativeBackgroundPorts() {
  let revision = 0;
  return {
    async read() {
      const dir = records();
      if (!dir.exists) return undefined;
      let value: unknown;
      let found = false;
      for (const entry of dir.list()) {
        if (!(entry instanceof File) || !/^record-\d+\.json$/u.test(entry.name)) continue;
        found = true;
        let text: string;
        try {
          text = await entry.text();
        } catch {
          throw Error('background-storage-unreadable');
        }
        try {
          const parsed = JSON.parse(text) as {
            revision?: unknown;
            document?: unknown;
          };
          if (
            typeof parsed.revision === 'number' &&
            Number.isSafeInteger(parsed.revision) &&
            parsed.revision > revision &&
            parseBackgroundDocument(parsed.document)
          ) {
            value = parsed.document;
            revision = parsed.revision;
          }
        } catch {}
      }
      if (found && value === undefined) throw Error('background-storage-unreadable');
      return value;
    },
    async write(document: BackgroundDocument) {
      const dir = records();
      if (!dir.exists) dir.create({ intermediates: true });
      const next = revision + 1;
      const file = new File(dir, `record-${next}.json`);
      const body = JSON.stringify({ revision: next, document });
      try {
        file.create({ overwrite: true });
        file.writeSync(body);
      } catch {
        if (!file.exists || file.textSync() !== body) throw Error('background-storage-failed');
      }
      if (file.textSync() !== body) throw Error('background-storage-failed');
      revision = next;
      try {
        for (const entry of dir.list()) {
          if (
            entry instanceof File &&
            /^record-\d+\.json$/u.test(entry.name) &&
            Number(entry.name.slice(7, -5)) < revision - 1
          )
            entry.delete();
        }
      } catch {}
    },
    async importImage(uri: string, dimensions?: BackgroundDimensions) {
      if (
        !dimensions ||
        !Number.isSafeInteger(dimensions.width) ||
        !Number.isSafeInteger(dimensions.height) ||
        dimensions.width < 1 ||
        dimensions.height < 1 ||
        Math.max(dimensions.width, dimensions.height) > 16384 ||
        dimensions.width * dimensions.height > MAX_SOURCE_PIXELS
      )
        throw Error('background-image-budget');
      const context = ImageManipulator.manipulate(uri);
      let rendered: ImageRef | undefined;
      try {
        if (Math.max(dimensions.width, dimensions.height) > MAX_EDGE) {
          context.resize(
            dimensions.width >= dimensions.height ? { width: MAX_EDGE } : { height: MAX_EDGE },
          );
        }
        rendered = await context.renderAsync();
        const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.88 });
        const dir = images();
        if (!dir.exists) dir.create({ intermediates: true });
        const id = `image-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const target = new File(dir, id);
        const temporary = new File(saved.uri);
        try {
          await temporary.copy(target);
          if (!target.exists || target.size === 0 || target.size > MAX_FILE_BYTES)
            throw Error('background-copy-failed');
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
    },
    async listImages() {
      const dir = images();
      return dir.exists
        ? dir
            .list()
            .filter((entry) => entry instanceof File && imageId(entry.name))
            .map((entry) => entry.name)
        : [];
    },
    async removeImage(id: string) {
      const file = new File(backgroundImageUri(id));
      if (file.exists) file.delete();
    },
  };
}

export const chatBackgrounds = createChatBackgrounds(nativeBackgroundPorts());

export function useChatBackgrounds() {
  return useSyncExternalStore(chatBackgrounds.subscribe, chatBackgrounds.getSnapshot);
}

export async function pickBackgroundImage(): Promise<BackgroundSource | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset === undefined
    ? undefined
    : { uri: asset.uri, width: asset.width, height: asset.height };
}
