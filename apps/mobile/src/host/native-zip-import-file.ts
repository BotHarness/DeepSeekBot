import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, FileMode, Paths } from 'expo-file-system';
import { randomUUID } from 'expo-crypto';
import { BotCreationFailure } from './bot-creation';
import {
  hashZipFile,
  ZIP_MAX_BYTES,
  type ZipFilePort,
  type ZipFileReader,
} from './zip-import-file';

const directory = () => new Directory(Paths.document, 'bot-imports');
const retainedFile = (id: string) => new File(directory(), `${id}.zip`);
const selecting = new Set<string>();

export function pruneZipFiles(retained: readonly string[]) {
  for (const id of retained) selecting.delete(id);
  const keep = new Set(retained.map((id) => `${id}.zip`));
  for (const id of selecting) keep.add(`${id}.zip`);
  try {
    const folder = directory();
    if (!folder.exists) return;
    for (const entry of folder.list()) {
      if (
        entry instanceof File &&
        /^[a-f0-9-]{36}\.zip$/u.test(entry.name) &&
        !keep.has(entry.name)
      ) {
        try {
          entry.delete();
        } catch {}
      }
    }
  } catch {}
}

function open(file: File): ZipFileReader {
  if (!file.exists) throw new BotCreationFailure('zip-file-missing');
  const handle = file.open(FileMode.ReadOnly);
  return {
    sizeBytes: handle.size ?? 0,
    async read(offset, length) {
      handle.offset = offset;
      return handle.readBytes(length);
    },
    close: () => handle.close(),
  };
}

export const nativeZipFiles: ZipFilePort = {
  discard(file) {
    if (!selecting.delete(file.fileId)) return;
    try {
      const picked = retainedFile(file.fileId);
      if (picked.exists) picked.delete();
    } catch {}
  },
  async pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed'],
      multiple: false,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset) return null;
    const source = new File(asset.uri);
    if (source.size > ZIP_MAX_BYTES) throw new BotCreationFailure('zip-file-too-large');
    const folder = directory();
    folder.create({ intermediates: true, idempotent: true });
    const fileId = randomUUID();
    const retained = retainedFile(fileId);
    selecting.add(fileId);
    try {
      await source.copy(retained);
    } catch (error) {
      selecting.delete(fileId);
      throw error;
    }
    const reader = open(retained);
    let completed = false;
    try {
      const sha256 = await hashZipFile(reader);
      completed = true;
      return { fileId, fileName: asset.name, sha256, sizeBytes: reader.sizeBytes };
    } finally {
      reader.close();
      if (!completed) {
        selecting.delete(fileId);
        retained.delete();
      }
    }
  },
  async open(file) {
    return open(retainedFile(file.fileId));
  },
};
