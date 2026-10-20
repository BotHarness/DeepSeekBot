import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { createNotificationAvatars, safeName } from './notification-avatars';

const SIZE = 192;
const INDEX = 'index.json';

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
  async render(host, file, image) {
    const dir = hostDir(host);
    if (dir === undefined) throw Error('notification-avatars-unavailable');
    const source = await Image.loadAsync(image, { maxWidth: SIZE, maxHeight: SIZE });
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
      if (!dir.exists) dir.create({ intermediates: true });
      const file = new File(dir, INDEX);
      if (!file.exists) file.create();
      file.writeSync(JSON.stringify(index));
    } catch {}
  },
});
