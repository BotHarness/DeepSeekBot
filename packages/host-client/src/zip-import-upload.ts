import { BotCreationFailure } from './bot-creation';
import { encodeBase64 } from './encrypted-carrier';
import {
  verifyZipFile,
  ZIP_CHUNK_BYTES,
  type ZipFilePort,
  type ZipImportFile,
} from './zip-import-file';

export interface ZipImportSource extends ZipImportFile {
  kind: 'zip';
  uploadKey: string;
}

export interface ZipImportPreview {
  source: ZipImportSource;
  displayName: string;
  description?: string;
  roles?: string[];
}

export type ZipUploadRequest = (method: string, args: Record<string, unknown>) => Promise<unknown>;

export function zipUploadIdentity(source: ZipImportSource) {
  return { uploadKey: source.uploadKey, sha256: source.sha256, sizeBytes: source.sizeBytes };
}

function acknowledgedOffset(value: unknown, source: ZipImportSource): number {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('uploadKey' in value) ||
    value.uploadKey !== source.uploadKey ||
    !('sha256' in value) ||
    value.sha256 !== source.sha256 ||
    !('sizeBytes' in value) ||
    value.sizeBytes !== source.sizeBytes ||
    !('chunkBytes' in value) ||
    value.chunkBytes !== ZIP_CHUNK_BYTES ||
    !('offset' in value) ||
    typeof value.offset !== 'number' ||
    !Number.isSafeInteger(value.offset) ||
    value.offset < 0 ||
    value.offset > source.sizeBytes ||
    (value.offset !== source.sizeBytes && value.offset % ZIP_CHUNK_BYTES !== 0)
  )
    throw new BotCreationFailure('zip-upload-invalid');
  return value.offset;
}

export async function uploadZip(
  source: ZipImportSource,
  files: ZipFilePort,
  request: ZipUploadRequest,
  progress?: (bytes: number, total: number) => void,
): Promise<void> {
  const reader = await verifyZipFile(files, source);
  try {
    const identity = zipUploadIdentity(source);
    let offset = acknowledgedOffset(await request('zipUploadBegin', identity), source);
    progress?.(offset, source.sizeBytes);
    while (offset < source.sizeBytes) {
      const length = Math.min(ZIP_CHUNK_BYTES, source.sizeBytes - offset);
      const bytes = await reader.read(offset, length);
      if (bytes.length !== length) throw new BotCreationFailure('zip-file-changed');
      const next = acknowledgedOffset(
        await request('zipUploadChunk', {
          ...identity,
          offset,
          dataBase64: encodeBase64(bytes),
        }),
        source,
      );
      if (next !== offset + length) throw new BotCreationFailure('zip-upload-invalid');
      offset = next;
      progress?.(offset, source.sizeBytes);
    }
  } finally {
    reader.close();
  }
}
