import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useSyncExternalStore } from 'react';

import type { HostLook } from '../ui/design/host-look';
import { createHostLooks } from './host-look';

const file = (): File => new File(Paths.document, 'deepseekbot-host-looks.json');
const folder = (): Directory => new Directory(Paths.document, 'host-looks');

export const hostLooks = createHostLooks({
  async read() {
    const stored = file();
    return stored.exists ? (JSON.parse(await stored.text()) as unknown) : undefined;
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

/** Removes a picture this module copied once no look points at it anymore. */
export function forgetImage(uri: string | undefined): void {
  if (uri === undefined) return;
  try {
    const dir = folder();
    if (!uri.startsWith(dir.uri)) return;
    const stale = new File(uri);
    if (stale.exists) stale.delete();
  } catch {}
}

/**
 * Picks a photo for a Host's avatar (cropped square) or banner (kept whole; the header covers
 * it), and copies it next to the app's documents so it outlives the picker's cache.
 */
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
