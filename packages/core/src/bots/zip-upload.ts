import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { BOT_ZIP_MAX_BYTES } from './bot-zip.js';
import { validBotCreationKey } from './creation.js';

export const BOT_ZIP_UPLOAD_CHUNK_BYTES = 256 * 1024;
export const BOT_ZIP_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
export const BOT_ZIP_UPLOAD_MAX_SESSIONS = 8;
export const BOT_ZIP_UPLOAD_MAX_RESERVED_BYTES = 400 * 1024 * 1024;

export interface BotZipUploadIdentity {
  uploadKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface BotZipUploadStatus extends BotZipUploadIdentity {
  offset: number;
  chunkBytes: number;
  expiresAt: number;
}

interface Manifest extends BotZipUploadIdentity {
  expiresAt: number;
}

export class BotZipUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'BotZipUploadError';
  }
}

export interface BotZipUploads {
  begin(input: BotZipUploadIdentity): BotZipUploadStatus;
  chunk(input: BotZipUploadIdentity & { offset: number; dataBase64: string }): BotZipUploadStatus;
  read(input: BotZipUploadIdentity): Buffer;
}

function checkedIdentity(input: BotZipUploadIdentity): void {
  if (
    typeof input.uploadKey !== 'string' ||
    typeof input.sha256 !== 'string' ||
    !validBotCreationKey(input.uploadKey) ||
    !/^[a-f0-9]{64}$/u.test(input.sha256)
  ) {
    throw new BotZipUploadError('invalid-upload');
  }
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes < 22 ||
    input.sizeBytes > BOT_ZIP_MAX_BYTES
  ) {
    throw new BotZipUploadError('too-large');
  }
}

export function createBotZipUploads(options: {
  rootDir: string;
  now?: () => number;
}): BotZipUploads {
  const now = options.now ?? Date.now;
  const folder = (key: string) =>
    join(options.rootDir, createHash('sha256').update(key).digest('hex'));
  const temporaryName = /^[a-f0-9-]{36}\.tmp$/u;
  const pruneOrphan = (dir: string): boolean => {
    if (existsSync(join(dir, 'manifest.json'))) return false;
    if (!readdirSync(dir).every((name) => temporaryName.test(name)))
      throw new BotZipUploadError('upload-unavailable');
    rmSync(dir, { recursive: true, force: true });
    return true;
  };
  const readManifest = (dir: string): Manifest => {
    try {
      const value = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as Manifest;
      checkedIdentity(value);
      if (!Number.isSafeInteger(value.expiresAt)) throw new Error();
      return value;
    } catch {
      throw new BotZipUploadError('upload-unavailable');
    }
  };
  const current = (input: BotZipUploadIdentity): Manifest => {
    checkedIdentity(input);
    const dir = folder(input.uploadKey);
    if (!existsSync(dir)) throw new BotZipUploadError('upload-expired');
    const manifest = readManifest(dir);
    if (
      manifest.sha256 !== input.sha256 ||
      manifest.sizeBytes !== input.sizeBytes ||
      manifest.uploadKey !== input.uploadKey
    ) {
      throw new BotZipUploadError('upload-key-conflict');
    }
    if (manifest.expiresAt <= now()) throw new BotZipUploadError('upload-expired');
    return manifest;
  };
  const status = (manifest: Manifest): BotZipUploadStatus => {
    let offset = 0;
    const dir = folder(manifest.uploadKey);
    while (offset < manifest.sizeBytes) {
      const file = join(dir, `${offset}.chunk`);
      if (!existsSync(file)) break;
      const expected = Math.min(BOT_ZIP_UPLOAD_CHUNK_BYTES, manifest.sizeBytes - offset);
      if (statSync(file).size !== expected) throw new BotZipUploadError('upload-unavailable');
      offset += expected;
    }
    return { ...manifest, offset, chunkBytes: BOT_ZIP_UPLOAD_CHUNK_BYTES };
  };
  const write = (dir: string, file: string, contents: string | Buffer): void => {
    const temporary = join(dir, `${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx', flush: true });
      renameSync(temporary, join(dir, file));
    } finally {
      rmSync(temporary, { force: true });
    }
  };
  return {
    begin(input) {
      checkedIdentity(input);
      mkdirSync(options.rootDir, { recursive: true, mode: 0o700 });
      const dir = folder(input.uploadKey);
      if (existsSync(dir) && !pruneOrphan(dir)) {
        const existing = readManifest(dir);
        if (
          existing.sha256 !== input.sha256 ||
          existing.sizeBytes !== input.sizeBytes ||
          existing.uploadKey !== input.uploadKey
        ) {
          throw new BotZipUploadError('upload-key-conflict');
        }
        if (existing.expiresAt > now()) {
          for (const name of readdirSync(dir)) {
            if (temporaryName.test(name)) rmSync(join(dir, name), { force: true });
          }
          return status(existing);
        }
      }
      let count = 0;
      let reserved = 0;
      for (const name of readdirSync(options.rootDir)) {
        if (!/^[a-f0-9]{64}$/u.test(name)) continue;
        const path = join(options.rootDir, name);
        if (pruneOrphan(path)) continue;
        const manifest = readManifest(path);
        if (manifest.expiresAt <= now()) {
          rmSync(path, { recursive: true, force: true });
        } else {
          count += 1;
          reserved += manifest.sizeBytes;
        }
      }
      if (
        count >= BOT_ZIP_UPLOAD_MAX_SESSIONS ||
        reserved + input.sizeBytes > BOT_ZIP_UPLOAD_MAX_RESERVED_BYTES
      ) {
        throw new BotZipUploadError('upload-capacity');
      }
      mkdirSync(dir, { mode: 0o700 });
      const manifest = {
        uploadKey: input.uploadKey,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        expiresAt: now() + BOT_ZIP_UPLOAD_TTL_MS,
      };
      write(dir, 'manifest.json', JSON.stringify(manifest));
      return status(manifest);
    },
    chunk(input) {
      const manifest = current(input);
      if (
        typeof input.dataBase64 !== 'string' ||
        input.dataBase64.length > Math.ceil(BOT_ZIP_UPLOAD_CHUNK_BYTES / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(input.dataBase64)
      ) {
        throw new BotZipUploadError('invalid-upload-chunk');
      }
      const data = Buffer.from(input.dataBase64, 'base64');
      if (
        !Number.isSafeInteger(input.offset) ||
        input.offset < 0 ||
        input.offset % BOT_ZIP_UPLOAD_CHUNK_BYTES !== 0 ||
        input.offset >= manifest.sizeBytes ||
        data.length !== Math.min(BOT_ZIP_UPLOAD_CHUNK_BYTES, manifest.sizeBytes - input.offset) ||
        data.toString('base64') !== input.dataBase64
      ) {
        throw new BotZipUploadError('invalid-upload-chunk');
      }
      const before = status(manifest);
      if (input.offset > before.offset) throw new BotZipUploadError('upload-offset-conflict');
      const dir = folder(input.uploadKey);
      const file = `${input.offset}.chunk`;
      if (input.offset < before.offset) {
        if (!readFileSync(join(dir, file)).equals(data))
          throw new BotZipUploadError('upload-chunk-conflict');
      } else {
        write(dir, file, data);
      }
      return status(manifest);
    },
    read(input) {
      const manifest = current(input);
      if (status(manifest).offset !== input.sizeBytes)
        throw new BotZipUploadError('upload-incomplete');
      const chunks: Buffer[] = [];
      for (let offset = 0; offset < manifest.sizeBytes; offset += BOT_ZIP_UPLOAD_CHUNK_BYTES) {
        chunks.push(readFileSync(join(folder(input.uploadKey), `${offset}.chunk`)));
      }
      const archive = Buffer.concat(chunks);
      if (createHash('sha256').update(archive).digest('hex') !== input.sha256)
        throw new BotZipUploadError('upload-hash-mismatch');
      return archive;
    },
  };
}
