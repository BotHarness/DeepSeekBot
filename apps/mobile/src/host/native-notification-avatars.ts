import { requireOptionalNativeModule } from 'expo';
import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { createNotificationAvatars, safeName } from './notification-avatars';

const SIZE = 192;
const INDEX = 'index.json';
const STATUS = 'status.json';

const conversationNotifications = requireOptionalNativeModule<{
  rasterizeSvgAsync(svg: string, target: string, size: number): Promise<void>;
}>('ConversationNotifications');

function root(): Directory | undefined {
  if (Platform.OS === 'android') return new Directory(Paths.document, 'notification-avatars');
  if (Platform.OS !== 'ios') return undefined;
  const group = Paths.appleSharedContainers[`group.${Application.applicationId ?? ''}`];
  return group === undefined ? undefined : new Directory(group, 'notification-avatars');
}

function hostDir(host: string): Directory | undefined {
  const base = root();
  return base === undefined ? undefined : new Directory(base, safeName(host));
}

export const notificationAvatars = createNotificationAvatars({
  async read(host) {
    const index = hostDir(host);
    if (index === undefined) throw Error('notification-avatars-unavailable');
    const file = new File(index, INDEX);
    if (!file.exists) return {};
    try {
      const value = JSON.parse(await file.text()) as unknown;
      return typeof value === 'object' && value !== null ? (value as Record<string, string>) : {};
    } catch {
      return {};
    }
  },
  async render(host, file, image, signal) {
    const dir = hostDir(host);
    if (dir === undefined) throw Error('notification-avatars-unavailable');
    if (Platform.OS === 'android' && image.svg !== undefined) {
      if (conversationNotifications === null) throw Error('svg-rasterizer-unavailable');
      if (!dir.exists) dir.create({ intermediates: true });
      await conversationNotifications.rasterizeSvgAsync(image.svg, new File(dir, file).uri, SIZE);
      if (signal.aborted) throw Error('render-timeout');
      return;
    }
    const source = await Image.loadAsync(
      { uri: image.uri, ...(image.headers === undefined ? {} : { headers: image.headers }) },
      {
        maxWidth: SIZE,
        maxHeight: SIZE,
      },
    );
    const context = ImageManipulator.manipulate(source);
    let rendered: ImageRef | undefined;
    try {
      context.resize({ width: SIZE, height: SIZE });
      rendered = await context.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.PNG });
      if (!dir.exists) dir.create({ intermediates: true });
      const target = new File(dir, file);
      const temporary = new File(saved.uri);
      try {
        if (signal.aborted) throw Error('render-timeout');
        if (target.exists) target.delete();
        await temporary.copy(target);
      } finally {
        if (temporary.exists) temporary.delete();
      }
    } finally {
      rendered?.release();
      context.release();
      source.release();
    }
  },
  remove(host, file) {
    try {
      const dir = hostDir(host);
      if (dir === undefined) return;
      const target = new File(dir, file);
      if (target.exists) target.delete();
    } catch {}
  },
  write(host, index) {
    try {
      const dir = hostDir(host);
      if (dir === undefined) return;
      writeJson(dir, INDEX, index);
    } catch {}
  },
  report(host, errors) {
    const status: Record<string, unknown> = { host, at: new Date().toISOString(), errors };
    try {
      status.root = root()?.uri ?? 'unavailable';
      const dir = hostDir(host);
      if (dir !== undefined) writeJson(dir, STATUS, status);
    } catch (error) {
      status.write = error instanceof Error ? error.message : String(error);
    }
    if (Object.keys(errors).length > 0 || status.write !== undefined)
      console.warn('notification avatars', status);
    try {
      writeJson(Paths.document, `notification-avatars-${STATUS}`, status);
    } catch {}
  },
});

function writeJson(dir: Directory, name: string, value: unknown): void {
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, name);
  if (!file.exists) file.create();
  file.writeSync(JSON.stringify(value));
}
