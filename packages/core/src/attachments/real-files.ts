import { createHash, randomUUID } from 'node:crypto';
import {
  constants,
  closeSync,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readSync,
  realpathSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import {
  ATTACHMENT_FILE_ID_PATTERN,
  isChannelAttachmentRef,
  type ChannelAttachmentRef,
} from './ref.js';
import { ChannelAttachmentError, sniffAttachmentMime } from './store.js';

interface Receipt {
  ref: ChannelAttachmentRef & { fileId: string };
  checksum: string;
}

function destinationName(name?: string): string {
  const leaf = (name ?? '').replaceAll('\\', '/').split('/').at(-1) ?? '';
  let safe = leaf
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f/\\<>:"|?*\ud800-\udfff]/gu, '_')
    .trim()
    .replace(/[. ]+$/u, '');
  if (!safe || safe === '.' || safe === '..') safe = 'attachment';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/iu.test(safe)) safe = '_' + safe;
  const dot = safe.lastIndexOf('.');
  const extension = dot > 0 && safe.length - dot <= 32 ? safe.slice(dot) : '';
  const stem = Array.from(extension ? safe.slice(0, dot) : safe);
  while (
    (stem.join('') + extension).length > 180 ||
    Buffer.byteLength(stem.join('') + extension) > 240
  )
    stem.pop();
  return stem.join('') + extension;
}

export function createRealAttachments(root: string, maxBytes: number) {
  const pending = new Map<string, Promise<ChannelAttachmentRef>>();
  const acquisitions = new Map<string, Promise<ChannelAttachmentRef>>();
  const purged = new Set<string>();
  const checkedDirectory = (path: string): void => {
    const info = lstatSync(path);
    const local = relative(realpathSync(root), realpathSync(path));
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      local === '..' ||
      local.startsWith('..' + sep)
    )
      throw new ChannelAttachmentError('Attachment storage directory is unavailable', 'not-found');
  };
  const directory = (id: string): string => {
    if (!ATTACHMENT_FILE_ID_PATTERN.test(id))
      throw new ChannelAttachmentError('Invalid attachment identity', 'invalid-ref');
    return join(root, 'files', id.slice(5));
  };
  const receipt = (id: string): Receipt => {
    if (purged.has(id))
      throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
    try {
      const dir = directory(id);
      const record = join(dir, 'record.json');
      if (
        !lstatSync(dir).isDirectory() ||
        lstatSync(dir).isSymbolicLink() ||
        !lstatSync(record).isFile() ||
        lstatSync(record).isSymbolicLink()
      )
        throw new Error('Invalid attachment record');
      const value = JSON.parse(readFileSync(record, 'utf8')) as Receipt;
      if (
        !isChannelAttachmentRef(value.ref) ||
        value.ref.fileId !== id ||
        destinationName(value.ref.name) !== value.ref.name ||
        !/^[0-9a-f]{64}$/u.test(value.checksum)
      )
        throw new Error('Invalid attachment record');
      return value;
    } catch (error) {
      if (error instanceof ChannelAttachmentError) throw error;
      throw new ChannelAttachmentError('Attachment is unavailable', 'not-found');
    }
  };
  const target = (id: string) => {
    const { ref } = receipt(id);
    const dir = directory(id);
    const path = join(dir, 'data', ref.name);
    try {
      for (const part of [join(root, 'files'), dir, join(dir, 'data'), path]) {
        if (lstatSync(part).isSymbolicLink()) throw new Error('Attachment symlink');
      }
      const realRoot = realpathSync(root);
      const real = realpathSync(path);
      const local = relative(realRoot, real);
      if (local.startsWith('..' + sep) || local === '..' || !lstatSync(real).isFile())
        throw new Error('Attachment escaped its profile');
      return { path: real, relativePath: ref.name, kind: 'file' as const };
    } catch {
      throw new ChannelAttachmentError('Attachment file is unavailable', 'not-found');
    }
  };
  const opened = (id: string) => {
    const checked = target(id);
    let fd: number;
    try {
      fd = openSync(checked.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch {
      throw new ChannelAttachmentError('Attachment file is unavailable', 'not-found');
    }
    try {
      const info = fstatSync(fd);
      const latest = lstatSync(target(id).path);
      if (!info.isFile() || latest.dev !== info.dev || latest.ino !== info.ino)
        throw new ChannelAttachmentError('Attachment changed while opening; retry', 'not-found');
      const head = Buffer.alloc(Math.min(512, info.size));
      const count = readSync(fd, head, 0, head.length, 0);
      const ref = {
        fileId: id,
        name: checked.relativePath,
        mime: sniffAttachmentMime(head.subarray(0, count)),
        size: info.size,
      };
      return { fd, ref, path: checked.path };
    } catch (error) {
      closeSync(fd);
      throw error;
    }
  };
  const acquired = async (input: {
    uploadId: string;
    name: string;
    signal: AbortSignal;
    load(): Promise<AsyncIterable<Uint8Array>>;
  }): Promise<ChannelAttachmentRef> => {
    const id = 'file:' + input.uploadId;
    const dir = directory(id);
    input.signal.throwIfAborted();
    if (lstatSync(join(dir, 'record.json'), { throwIfNoEntry: false }) !== undefined) {
      const { fd, ref } = opened(id);
      closeSync(fd);
      return ref;
    }
    const previous = acquisitions.get(id);
    if (previous !== undefined) {
      await previous.catch(() => undefined);
      return acquired(input);
    }
    const operation = (async () =>
      real.upload({
        ...input,
        data: await input.load(),
      }))();
    acquisitions.set(id, operation);
    try {
      return await operation;
    } finally {
      if (acquisitions.get(id) === operation) acquisitions.delete(id);
    }
  };
  const real = {
    acquired(uploadId: string): ChannelAttachmentRef | undefined {
      const id = 'file:' + uploadId;
      if (lstatSync(join(directory(id), 'record.json'), { throwIfNoEntry: false }) === undefined)
        return;
      const { fd, ref } = opened(id);
      closeSync(fd);
      return ref;
    },
    acquire: acquired,
    target,
    current(id: string): ChannelAttachmentRef {
      const { fd, ref } = opened(id);
      closeSync(fd);
      return ref;
    },
    contentVersion(id: string): string {
      const { fd } = opened(id);
      try {
        const before = fstatSync(fd, { bigint: true });
        if (before.size > BigInt(maxBytes))
          throw new ChannelAttachmentError('Attachment exceeds review size limit', 'too-large');
        const hash = createHash('sha256');
        const chunk = Buffer.alloc(64 * 1024);
        let offset = 0;
        while (offset < Number(before.size)) {
          const count = readSync(
            fd,
            chunk,
            0,
            Math.min(chunk.length, Number(before.size) - offset),
            offset,
          );
          if (count === 0)
            throw new ChannelAttachmentError('Attachment changed during review', 'not-found');
          hash.update(chunk.subarray(0, count));
          offset += count;
        }
        const after = fstatSync(fd, { bigint: true });
        const current = lstatSync(target(id).path, { bigint: true });
        if (
          before.size !== after.size ||
          before.mtimeNs !== after.mtimeNs ||
          before.ctimeNs !== after.ctimeNs ||
          before.dev !== current.dev ||
          before.ino !== current.ino ||
          after.mtimeNs !== current.mtimeNs ||
          after.ctimeNs !== current.ctimeNs
        )
          throw new ChannelAttachmentError('Attachment changed during review', 'not-found');
        return hash.digest('hex');
      } finally {
        closeSync(fd);
      }
    },
    download(id: string, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const { fd, ref, path } = opened(id);
      if (ref.size === 0) {
        closeSync(fd);
        return {
          ref,
          body: new ReadableStream<Uint8Array>({ start: (controller) => controller.close() }),
        };
      }
      try {
        const source = createReadStream(path, {
          fd,
          autoClose: true,
          start: 0,
          end: ref.size - 1,
          ...(signal === undefined ? {} : { signal }),
        });
        return { ref, body: Readable.toWeb(source) as ReadableStream<Uint8Array> };
      } catch (error) {
        closeSync(fd);
        throw error;
      }
    },
    async upload(input: {
      data: AsyncIterable<Uint8Array>;
      name?: string;
      signal?: AbortSignal;
      uploadId?: string;
    }): Promise<ChannelAttachmentRef> {
      const id = 'file:' + (input.uploadId ?? randomUUID());
      directory(id);
      if (purged.has(id))
        throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
      while (pending.has(id)) await pending.get(id)!.catch(() => undefined);
      const operation = (async () => {
        input.signal?.throwIfAborted();
        const staging = join(root, 'staging');
        await mkdir(staging, { recursive: true });
        checkedDirectory(staging);
        const temp = join(staging, randomUUID() + '.part');
        const file = await open(temp, 'wx', 0o600);
        let closed = false;
        let size = 0;
        const digest = createHash('sha256');
        const head = Buffer.alloc(512);
        let headSize = 0;
        try {
          for await (const chunk of input.data) {
            input.signal?.throwIfAborted();
            size += chunk.byteLength;
            if (size > maxBytes)
              throw new ChannelAttachmentError('Attachment exceeds upload limit', 'too-large');
            digest.update(chunk);
            const count = Math.min(head.length - headSize, chunk.byteLength);
            head.set(chunk.subarray(0, count), headSize);
            headSize += count;
            let offset = 0;
            while (offset < chunk.byteLength) {
              const result = await file.write(chunk, offset, chunk.byteLength - offset);
              if (result.bytesWritten === 0) throw new Error('Attachment write made no progress');
              offset += result.bytesWritten;
            }
          }
          input.signal?.throwIfAborted();
          await file.sync();
          await file.close();
          closed = true;
          const checksum = digest.digest('hex');
          const name = destinationName(input.name);
          let existing: Receipt | undefined;
          try {
            existing = receipt(id);
          } catch (error) {
            if (
              !(error instanceof ChannelAttachmentError) ||
              error.code !== 'not-found' ||
              lstatSync(join(directory(id), 'record.json'), { throwIfNoEntry: false }) !== undefined
            )
              throw error;
          }
          if (existing !== undefined) {
            if (existing.checksum !== checksum || existing.ref.name !== name)
              throw new ChannelAttachmentError(
                'Upload identity was already used for another transfer',
                'invalid-ref',
              );
            target(id);
            return existing.ref;
          }
          const dir = directory(id);
          if (purged.has(id))
            throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
          await mkdir(join(root, 'files'), { recursive: true });
          checkedDirectory(join(root, 'files'));
          await rm(dir, { recursive: true, force: true });
          await mkdir(dir, { recursive: false });
          try {
            await mkdir(join(dir, 'data'));
            await rename(temp, join(dir, 'data', name));
            const ref = {
              fileId: id,
              name,
              mime: sniffAttachmentMime(head.subarray(0, headSize)),
              size,
            };
            const record = join(dir, 'record.json');
            await writeFile(record, JSON.stringify({ ref, checksum }), { flag: 'wx', mode: 0o600 });
            const handle = await open(record, 'r+');
            try {
              await handle.sync();
            } finally {
              await handle.close();
            }
            if (purged.has(id))
              throw new ChannelAttachmentError('Attachment content was purged', 'not-found');
            return ref;
          } catch (error) {
            await rm(dir, { recursive: true, force: true });
            throw error;
          }
        } finally {
          if (!closed) await file.close();
          await rm(temp, { force: true });
        }
      })();
      pending.set(id, operation);
      try {
        return await operation;
      } finally {
        if (pending.get(id) === operation) pending.delete(id);
      }
    },
    purge(id: string, references: () => ReadonlySet<string>): 'removed' | 'shared' | 'pending' {
      const path = directory(id);
      if (references().has(id)) return 'shared';
      purged.add(id);
      if (pending.has(id) || acquisitions.has(id)) return 'pending';
      if (lstatSync(path, { throwIfNoEntry: false }) === undefined) return 'removed';
      checkedDirectory(join(root, 'files'));
      checkedDirectory(path);
      if (references().has(id)) {
        purged.delete(id);
        return 'shared';
      }
      rmSync(path, { recursive: true });
      return 'removed';
    },
    sweep(olderThan: Date, references: ReadonlySet<string>): number {
      const files = join(root, 'files');
      let entries;
      try {
        checkedDirectory(files);
        entries = readdirSync(files, { withFileTypes: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0;
        throw error;
      }
      let removed = 0;
      for (const entry of entries) {
        const id = 'file:' + entry.name;
        if (
          !entry.isDirectory() ||
          !ATTACHMENT_FILE_ID_PATTERN.test(id) ||
          references.has(id) ||
          pending.has(id) ||
          acquisitions.has(id)
        )
          continue;
        const path = directory(id);
        if (lstatSync(path).mtimeMs >= olderThan.getTime()) continue;
        rmSync(path, { recursive: true });
        removed += 1;
      }
      return removed;
    },
  };
  return real;
}
