import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useSyncExternalStore } from 'react';

import type { HostLook } from '../ui/design/host-look';
import { createHostLooks, LOOK_IMAGES, rebaseLookImages } from './host-look';

const file = (): File => new File(Paths.document, 'deepseekbot-host-looks.json');
const folder = (): Directory => new Directory(Paths.document, LOOK_IMAGES);

export const hostLooks = createHostLooks({
  async read() {
    const stored = file();
    if (!stored.exists) return undefined;
    return rebaseLookImages(JSON.parse(await stored.text()) as unknown, folder().uri);
  },
  write(value) {
    try {
      const stored = file();
      if (!stored.exists) stored.create();
      stored.write(JSON.stringify(value));
    } catch {}
  },
});

export function useHostLook(hostId: string | undefined): HostLook {
  return useSyncExternalStore(
    hostLooks.subscribe,
    useCallback(() => hostLooks.look(hostId ?? ''), [hostId]),
  );
}

let imported = 0;

async function keep(uri: string, hostId: string, slot: 'avatar' | 'banner'): Promise<string> {
  try {
    const dir = folder();
    if (!dir.exists) dir.create({ intermediates: true });
    imported += 1;
    const extension = /\.(png|jpe?g|heic|webp|gif)$/i.exec(uri)?.[0] ?? '.jpg';
    const safe = hostId.replace(/[^a-z0-9_-]/giu, '_');
    const target = new File(dir, `${safe}-${slot}-${Date.now()}-${imported}${extension}`);
    await new File(uri).copy(target);
    return target.uri;
  } catch {
    return uri;
  }
}

export function forgetImage(uri: string | undefined): void {
  if (uri === undefined) return;
  try {
    const dir = folder();
    if (!uri.startsWith(dir.uri)) return;
    const stale = new File(uri);
    if (stale.exists) stale.delete();
  } catch {}
}

export async function pickLookImage(
  hostId: string,
  slot: 'avatar' | 'banner',
): Promise<string | undefined> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: slot === 'avatar',
    aspect: [1, 1],
    quality: 0.9,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset === undefined ? undefined : keep(asset.uri, hostId, slot);
}
