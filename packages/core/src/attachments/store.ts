import { createHash } from 'node:crypto';
import {
  closeSync,
  createReadStream,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  unlinkSync,
} from 'node:fs';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { ATTACHMENT_HASH_PATTERN, type ChannelAttachmentRef } from './ref.js';
import { createRealAttachments } from './real-files.js';

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const STAGED = /^[0-9a-f-]{36}\.part$/u;

export class ChannelAttachmentError extends Error {
  constructor(
    message: string,
    readonly code: 'invalid-ref' | 'too-large' | 'not-found' | 'corrupt',
  ) {
    super(message);
    this.name = 'ChannelAttachmentError';
  }
}

export interface AttachmentStore {
  readonly rootDir: string;
  readonly maxBytes: number;
  upload(input: {
    data: AsyncIterable<Uint8Array>;
    name?: string;
    signal?: AbortSignal;
    uploadId?: string;
  }): Promise<ChannelAttachmentRef>;
  acquire(input: {
    uploadId: string;
    name: string;
    signal: AbortSignal;
    load(): Promise<AsyncIterable<Uint8Array>>;
  }): Promise<ChannelAttachmentRef>;
  current(ref: ChannelAttachmentRef): ChannelAttachmentRef;
  contentVersion(ref: ChannelAttachmentRef): string;
  acquired(uploadId: string): ChannelAttachmentRef | undefined;
  fileTarget(fileId: string): { path: string; relativePath: string; kind: 'file' };
  has(ref: ChannelAttachmentRef): boolean;
  download(
    identity: string,
    name?: string,
    signal?: AbortSignal,
  ): Promise<{ ref: ChannelAttachmentRef; body: ReadableStream<Uint8Array> }>;

  sweepStaged(olderThan: Date): Promise<number>;

  sweepUnreferenced(olderThan: Date, readReferences: () => ReadonlySet<string>): number;
  purgeReviewed(
    identity: string,
    readReferences: () => ReadonlySet<string>,
  ): 'removed' | 'shared' | 'pending';
}

export function safeAttachmentName(raw?: string): string {
  const leaf = (raw ?? '').replaceAll('\\', '/').split('/').at(-1) ?? '';
  const clean = leaf
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\]/gu, '_')
    .trim()
    .slice(0, 180);
  return clean && clean !== '.' && clean !== '..' ? clean : 'attachment';
}

export function sniffAttachmentMime(b: Uint8Array): string {
  const ascii = (from: number, to: number): string => String.fromCharCode(...b.subarray(from, to));
  if (b.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v))
    return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 6 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return 'audio/wav';
  if (
    b.length >= 10 &&
    (ascii(0, 9) === '#!SILK_V3' || (b[0] === 2 && ascii(1, 10) === '#!SILK_V3'))
  )
    return 'audio/silk';
  if (
    b.length >= 16 &&
    ascii(4, 8) === 'ftyp' &&
    new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0) >= 16 &&
    new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(0) <= b.byteLength &&
    ['isom', 'iso2', 'mp41', 'mp42', 'avc1'].includes(ascii(8, 12))
  )
    return 'video/mp4';
  if (b.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (b.length === 0) return 'application/octet-stream';
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(b);
    if (!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(text)) return 'text/plain';
  } catch {}
  return 'application/octet-stream';
}

function pathFor(root: string, hash: string): string {
  if (!ATTACHMENT_HASH_PATTERN.test(hash))
    throw new ChannelAttachmentError('Invalid attachment hash', 'invalid-ref');
  const hex = hash.slice(7);
  return join(root, 'objects', hex.slice(0, 2), hex);
}

function inspect(
  root: string,
  hash: string,
  name?: string,
): ChannelAttachmentRef & { hash: string } {
  const path = pathFor(root, hash);
  let size: number;
  try {
    const info = lstatSync(path);
    if (!info.isFile()) throw new ChannelAttachmentError('Attachment is missing', 'not-found');
    size = info.size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      throw new ChannelAttachmentError('Attachment is missing', 'not-found');
    throw error;
  }
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(Math.min(size, 512));
  let headSize = 0;
  try {
    headSize = readSync(fd, head, 0, head.length, 0);
  } finally {
    closeSync(fd);
  }
  return {
    hash,
    name: safeAttachmentName(name),
    mime: sniffAttachmentMime(head.subarray(0, headSize)),
    size,
  };
}

function streamVerified(
  root: string,
  ref: ChannelAttachmentRef & { hash: string },
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const source = createReadStream(pathFor(root, ref.hash), { highWaterMark: 64 * 1024 });
  const iterator = source[Symbol.asyncIterator]();
  const digest = createHash('sha256');
  let size = 0;
  const abort = (): void => {
    source.destroy(signal?.reason);
  };
  signal?.addEventListener('abort', abort, { once: true });
  const cleanup = (): void => signal?.removeEventListener('abort', abort);
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) {
          cleanup();
          if (size !== ref.size || `sha256:${digest.digest('hex')}` !== ref.hash)
            controller.error(
              new ChannelAttachmentError('Attachment integrity check failed', 'corrupt'),
            );
          else controller.close();
          return;
        }
        const bytes = new Uint8Array(next.value);
        size += bytes.byteLength;
        digest.update(bytes);
        controller.enqueue(bytes);
      } catch (error) {
        cleanup();
        controller.error(error);
      }
    },
    cancel() {
      cleanup();
      source.destroy();
    },
  });
}

export function createAttachmentStore(options: {
  rootDir: string;
  maxBytes?: number;
}): AttachmentStore {
  const { rootDir } = options;
  const maxBytes = options.maxBytes ?? MAX_ATTACHMENT_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
    throw new Error('Attachment maxBytes must be a positive integer');
  const real = createRealAttachments(rootDir, maxBytes);
  const purged = new Set<string>();
  return {
    rootDir,
    maxBytes,
    upload: (input) => real.upload(input),
    acquire: (input) => real.acquire(input),
    acquired: (id) => real.acquired(id),
    fileTarget: (id) => real.target(id),
    current(ref) {
      if (purged.has(ref.fileId ?? ref.hash))
        throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
      return ref.fileId === undefined
        ? inspect(rootDir, ref.hash, ref.name)
        : real.current(ref.fileId);
    },
    contentVersion(ref) {
      if (purged.has(ref.fileId ?? ref.hash))
        throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
      if (ref.fileId !== undefined) return real.contentVersion(ref.fileId);
      inspect(rootDir, ref.hash, ref.name);
      return ref.hash;
    },
    has(ref) {
      try {
        if (ref.fileId !== undefined) return real.current(ref.fileId).name === ref.name;
        const actual = inspect(rootDir, ref.hash, ref.name);
        return actual.name === ref.name && actual.size === ref.size && actual.mime === ref.mime;
      } catch {
        return false;
      }
    },
    async download(identity, name, signal) {
      signal?.throwIfAborted();
      if (purged.has(identity))
        throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
      if (identity.startsWith('file:')) return real.download(identity, signal);
      const ref = inspect(rootDir, identity, name);
      return { ref, body: streamVerified(rootDir, ref, signal) };
    },
    purgeReviewed(identity, readReferences) {
      if (identity.startsWith('file:')) return real.purge(identity, readReferences);
      const path = pathFor(rootDir, identity);
      if (readReferences().has(identity)) return 'shared';
      purged.add(identity);
      if (lstatSync(path, { throwIfNoEntry: false }) === undefined) return 'removed';
      for (const part of [
        join(rootDir, 'objects'),
        join(rootDir, 'objects', identity.slice(7, 9)),
        path,
      ]) {
        const local = relative(realpathSync(rootDir), realpathSync(part));
        if (lstatSync(part).isSymbolicLink() || local === '..' || local.startsWith('..' + sep))
          throw new ChannelAttachmentError('Attachment escaped its profile', 'not-found');
      }
      if (!lstatSync(path).isFile())
        throw new ChannelAttachmentError('Attachment is unavailable', 'not-found');
      if (readReferences().has(identity)) {
        purged.delete(identity);
        return 'shared';
      }
      unlinkSync(path);
      return 'removed';
    },
    sweepUnreferenced(olderThan, readReferences) {
      const referenced = readReferences();
      const filesRemoved = real.sweep(olderThan, referenced);
      const objects = join(rootDir, 'objects');
      let shards;
      try {
        shards = readdirSync(objects, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return filesRemoved;
        throw error;
      }
      let removed = filesRemoved;
      for (const shard of shards) {
        if (!shard.isDirectory() || !/^[0-9a-f]{2}$/u.test(shard.name)) continue;
        for (const object of readdirSync(join(objects, shard.name), { withFileTypes: true })) {
          if (
            !object.isFile() ||
            !/^[0-9a-f]{64}$/u.test(object.name) ||
            !object.name.startsWith(shard.name)
          )
            continue;
          const hash = `sha256:${object.name}`;
          if (referenced.has(hash)) continue;
          const path = join(objects, shard.name, object.name);
          const info = lstatSync(path);
          if (!info.isFile() || info.mtimeMs >= olderThan.getTime()) continue;
          unlinkSync(path);
          removed += 1;
        }
      }
      return removed;
    },
    async sweepStaged(olderThan) {
      let entries;
      try {
        entries = await readdir(join(rootDir, 'staging'), { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
      }
      let removed = 0;
      for (const entry of entries) {
        if (!entry.isFile() || !STAGED.test(entry.name)) continue;
        const path = join(rootDir, 'staging', entry.name);
        if ((await stat(path)).mtimeMs >= olderThan.getTime()) continue;
        await unlink(path);
        removed += 1;
      }
      return removed;
    },
  };
}
