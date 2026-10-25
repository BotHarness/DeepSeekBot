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
  try {
    if (!file.exists) throw new BotCreationFailure('zip-file-missing');
    const handle = file.open(FileMode.ReadOnly);
    return {
      sizeBytes: handle.size ?? 0,
      async read(offset, length) {
        try {
          handle.offset = offset;
          return await handle.readBytes(length);
        } catch {
          throw new BotCreationFailure('zip-file-read');
        }
      },
      close: () => handle.close(),
    };
  } catch (error) {
    throw error instanceof BotCreationFailure ? error : new BotCreationFailure('zip-file-read');
  }
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
    const fileId = randomUUID();
    const retained = retainedFile(fileId);
    let reader: ZipFileReader | undefined;
    let completed = false;
    try {
      const source = new File(asset.uri);
      if (source.size > ZIP_MAX_BYTES) throw new BotCreationFailure('zip-file-too-large');
      const folder = directory();
      folder.create({ intermediates: true, idempotent: true });
      selecting.add(fileId);
      await source.copy(retained);
      reader = open(retained);
      const sha256 = await hashZipFile(reader);
      completed = true;
      return { fileId, fileName: asset.name, sha256, sizeBytes: reader.sizeBytes };
    } catch (error) {
      throw error instanceof BotCreationFailure ? error : new BotCreationFailure('zip-file-read');
    } finally {
      try {
        reader?.close();
      } catch {}
      if (!completed) {
        selecting.delete(fileId);
        try {
          if (retained.exists) retained.delete();
        } catch {}
      }
    }
  },
  async open(file) {
    return open(retainedFile(file.fileId));
  },
};
