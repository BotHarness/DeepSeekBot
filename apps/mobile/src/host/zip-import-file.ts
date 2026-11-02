import { archiveHasher } from '../../../../packages/core/src/portability/archive-hash';
import { BotCreationFailure } from './bot-creation';

export const ZIP_CHUNK_BYTES = 256 * 1024;
export const ZIP_MAX_BYTES = 100 * 1024 * 1024;

export interface ZipImportFile {
  fileId: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
}

export interface ZipFileReader {
  sizeBytes: number;
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): void;
}

export interface ZipFilePort {
  pick(): Promise<ZipImportFile | null>;
  discard?(file: ZipImportFile): void;
  open(file: ZipImportFile): Promise<ZipFileReader>;
}

export function zipFile(value: unknown): ZipImportFile {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('fileId' in value) ||
    typeof value.fileId !== 'string' ||
    !/^[a-f0-9-]{36}$/u.test(value.fileId) ||
    !('fileName' in value) ||
    typeof value.fileName !== 'string' ||
    !('sha256' in value) ||
    typeof value.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value.sha256) ||
    !('sizeBytes' in value) ||
    typeof value.sizeBytes !== 'number' ||
    !Number.isSafeInteger(value.sizeBytes) ||
    value.sizeBytes < 22 ||
    value.sizeBytes > ZIP_MAX_BYTES
  )
    throw new BotCreationFailure('zip-file-invalid');
  return {
    fileId: value.fileId,
    fileName: value.fileName,
    sha256: value.sha256,
    sizeBytes: value.sizeBytes,
  };
}

export async function hashZipFile(reader: ZipFileReader): Promise<string> {
  if (reader.sizeBytes < 22 || reader.sizeBytes > ZIP_MAX_BYTES)
    throw new BotCreationFailure('zip-file-too-large');
  const hash = archiveHasher();
  for (let offset = 0; offset < reader.sizeBytes; offset += ZIP_CHUNK_BYTES) {
    const length = Math.min(ZIP_CHUNK_BYTES, reader.sizeBytes - offset);
    const bytes = await reader.read(offset, length);
    if (bytes.length !== length) throw new BotCreationFailure('zip-file-changed');
    hash.update(bytes);
  }
  return hash.finish();
}

export async function verifyZipFile(
  port: ZipFilePort,
  file: ZipImportFile,
): Promise<ZipFileReader> {
  const reader = await port.open(file);
  try {
    if (reader.sizeBytes !== file.sizeBytes || (await hashZipFile(reader)) !== file.sha256)
      throw new BotCreationFailure('zip-file-changed');
    return reader;
  } catch (error) {
    reader.close();
    throw error;
  }
}
