import * as Application from 'expo-application';
import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { appIconPreviews, nativeAppIcon } from '../ui/native-app-icon';
import type { AppIconName } from '../ui/app-icon-settings';
import { avatarImageUri } from './native-notification-avatars';
import { avatarFile } from './notification-avatars';

const BADGE = 60;

export type CallActivityBadges = { badge: string; badgeDark: string };

function root(): Directory | undefined {
  if (Platform.OS !== 'ios') return undefined;
  const group = Paths.appleSharedContainers[`group.${Application.applicationId ?? ''}`];
  return group === undefined ? undefined : new Directory(group, 'call-activity');
}

export function callAvatarUri(host: string, slug: string): string | undefined {
  if (Platform.OS !== 'ios') return undefined;
  try {
    const uri = avatarImageUri(host, avatarFile('bot', slug));
    return uri !== undefined && new File(uri).exists ? uri : undefined;
  } catch {
    return undefined;
  }
}

async function writeIcon(source: unknown, target: File): Promise<void> {
  const image = await Image.loadAsync(source as number, {
    maxWidth: BADGE,
    maxHeight: BADGE,
  });
  const context = ImageManipulator.manipulate(image);
  let rendered: ImageRef | undefined;
  try {
    context.resize({ width: BADGE, height: BADGE });
    rendered = await context.renderAsync();
    const saved = new File((await rendered.saveAsync({ format: SaveFormat.PNG })).uri);
    try {
      if (target.exists) target.delete();
      await saved.copy(target);
    } finally {
      if (saved.exists) saved.delete();
    }
  } finally {
    rendered?.release();
    context.release();
    image.release();
  }
}

const written = new Map<AppIconName, Promise<CallActivityBadges | undefined>>();

export function callActivityBadges(): Promise<CallActivityBadges | undefined> {
  const dir = root();
  if (dir === undefined) return Promise.resolve(undefined);
  let icon: AppIconName = 'default';
  try {
    icon = nativeAppIcon.current();
  } catch {}
  const known = written.get(icon);
  if (known !== undefined) return known;
  const work = (async () => {
    if (!dir.exists) dir.create({ intermediates: true });
    const light = new File(dir, `app-icon-${icon}-light.png`);
    const dark = new File(dir, `app-icon-${icon}-dark.png`);
    if (!light.exists) await writeIcon(appIconPreviews[icon].light, light);
    if (!dark.exists) await writeIcon(appIconPreviews[icon].dark, dark);
    return { badge: light.uri, badgeDark: dark.uri };
  })().catch(() => {
    written.delete(icon);
    return undefined;
  });
  written.set(icon, work);
  return work;
}
