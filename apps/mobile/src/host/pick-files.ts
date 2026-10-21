import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import type { OutgoingFile } from './conversation';

export type PickSource = 'photos' | 'camera' | 'file';

export interface PickedFile extends OutgoingFile {
  id: string;
  kind: 'image' | 'file';
  uri: string;
}

export const MAX_PICKED = 10;

let picked = 0;

function readUri(uri: string): () => Promise<Blob> {
  return async () => (await fetch(uri)).blob();
}

function readDataUri(uri: string, name: string): () => Promise<Blob> {
  return async () => {
    const file = new File(Paths.cache, `${Date.now()}-${name}`);
    await file.write(uri.slice(uri.indexOf(',') + 1), { encoding: 'base64' });
    try {
      return await (await fetch(file.uri)).blob();
    } finally {
      try {
        file.delete();
      } catch {}
    }
  };
}

function extension(mime: string | undefined): string {
  const subtype = mime?.split('/')[1]?.replace(/[^a-z0-9]/gu, '');
  return subtype === undefined || subtype === '' ? '' : `.${subtype === 'jpeg' ? 'jpg' : subtype}`;
}

function fromAsset(asset: ImagePicker.ImagePickerAsset): PickedFile {
  picked += 1;
  const kind = asset.type === 'image' || asset.type === 'livePhoto' ? 'image' : 'file';
  return {
    id: `pick-${picked}`,
    kind,
    uri: asset.uri,
    name: asset.fileName ?? `${asset.type ?? 'photo'}-${picked}${extension(asset.mimeType)}`,
    read: readUri(asset.uri),
  };
}

function fromDocument(asset: DocumentPicker.DocumentPickerAsset): PickedFile {
  picked += 1;
  return {
    id: `pick-${picked}`,
    kind: asset.mimeType?.startsWith('image/') === true ? 'image' : 'file',
    uri: asset.uri,
    name: asset.name,
    read: readUri(asset.uri),
  };
}

export function fromClipboardImage(data: string): PickedFile {
  picked += 1;
  const mime = /^data:([^;,]+)/u.exec(data)?.[1];
  const name = `pasted-${picked}${extension(mime)}`;
  return {
    id: `pick-${picked}`,
    kind: 'image',
    uri: data,
    name,
    read: readDataUri(data, name),
  };
}

export function fromSharedFile(uri: string, name: string | null, mime: string | null): PickedFile {
  picked += 1;
  return {
    id: `pick-${picked}`,
    kind: mime?.startsWith('image/') === true ? 'image' : 'file',
    uri,
    name: name ?? `shared-${picked}${extension(mime ?? undefined)}`,
    read: readUri(uri),
  };
}

export async function pickFiles(source: PickSource, limit: number): Promise<PickedFile[]> {
  if (limit <= 0) return [];
  if (source === 'file') {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: limit > 1,
      copyToCacheDirectory: true,
    });
    return result.canceled ? [] : result.assets.slice(0, limit).map(fromDocument);
  }
  if (source === 'camera') {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) throw new Error('camera-denied');
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    return result.canceled ? [] : result.assets.slice(0, 1).map(fromAsset);
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 0.8,
  });
  return result.canceled ? [] : result.assets.slice(0, limit).map(fromAsset);
}
