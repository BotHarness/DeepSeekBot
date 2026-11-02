import {
  inspectImage,
  ImageFormatError,
  isMemoryImagePath,
  type ImageMime,
} from '../media/image-format.js';
export { isMemoryImagePath };
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { relative } from 'node:path';
import { resolveMemoryPath, toMemoryRelativePath } from './jail.js';

export const MAX_MEMORY_IMAGE_BYTES = 25 * 1024 * 1024;
export interface MemoryImage {
  mime?: ImageMime;
  source: string;
  status: 'ready' | 'missing' | 'unsupported' | 'too-large' | 'stale';
  revision?: string;
  size?: number;
  width?: number;
  height?: number;
}
export interface MemoryImageComparison {
  before?: MemoryImage;
  after?: MemoryImage;
}
export class MemoryImageError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type MemoryGit = (root: string, args: string[], maxBuffer?: number) => Buffer;

export function readMemoryBytes(
  root: string,
  input: string,
  source: string,
  git: MemoryGit,
  maxBytes = MAX_MEMORY_IMAGE_BYTES,
): { status: MemoryImage['status']; bytes?: Buffer } {
  const path = toMemoryRelativePath(input);
  const fail = (status: MemoryImage['status']) => ({ status });
  let bytes: Buffer;
  if (source === 'worktree') {
    const target = resolveMemoryPath(root, path);
    let fd: number;
    try {
      fd = openSync(
        target,
        constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
      );
    } catch (error) {
      if (['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? ''))
        return fail('missing');
      throw error;
    }
    try {
      const realRoot = realpathSync(root);
      const current = realpathSync(resolveMemoryPath(root, path));
      toMemoryRelativePath(relative(realRoot, current));
      const before = fstatSync(fd);
      const latest = statSync(current);
      if (!before.isFile() || before.dev !== latest.dev || before.ino !== latest.ino)
        return fail('stale');
      if (before.size > maxBytes) return fail('too-large');
      bytes = Buffer.alloc(before.size + 1);
      let count = 0;
      while (count < bytes.length) {
        const read = readSync(fd, bytes, count, bytes.length - count, null);
        if (read === 0) break;
        count += read;
      }
      const after = fstatSync(fd);
      const finalPath = realpathSync(resolveMemoryPath(root, path));
      const final = statSync(finalPath);
      if (count > maxBytes) return fail('too-large');
      if (
        count !== before.size ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        finalPath !== current ||
        final.ino !== before.ino ||
        final.dev !== before.dev
      )
        return fail('stale');
      bytes = bytes.subarray(0, count);
    } finally {
      closeSync(fd);
    }
  } else {
    if (source !== 'index') {
      if (!/^[0-9a-f]{40}$/u.test(source))
        throw new MemoryImageError('memory-unknown-commit', 'Invalid image revision');
      if (git(root, ['cat-file', '-t', source]).toString().trim() !== 'commit')
        throw new MemoryImageError('memory-unknown-commit', 'Unknown image commit');
      const branches = git(root, ['branch', '--contains', source, '--format=%(refname)'])
        .toString()
        .trim();
      let reachable = false;
      try {
        git(root, ['merge-base', '--is-ancestor', source, 'HEAD']);
        reachable = true;
      } catch {}
      if (!reachable && !branches)
        throw new MemoryImageError('memory-unknown-commit', 'Image commit is not reachable');
    }
    const listing =
      source === 'index'
        ? git(root, ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', path]).toString()
        : git(root, ['--literal-pathspecs', 'ls-tree', '-z', source, '--', path]).toString();
    const entries = listing.split('\0').filter(Boolean);
    if (entries.length === 0) return fail('missing');
    if (entries.length !== 1) return fail('stale');
    const entry = entries[0]!;
    const tab = entry.indexOf('\t');
    const metadata = entry.slice(0, tab).split(' ');
    if (entry.slice(tab + 1) !== path || !['100644', '100755'].includes(metadata[0] ?? ''))
      return fail('unsupported');
    const oid = source === 'index' ? metadata[1] : metadata[2];
    if (source === 'index' && metadata[2] !== '0') return fail('stale');
    if (!oid || !/^[0-9a-f]{40}$/u.test(oid)) return fail('unsupported');
    const size = Number(git(root, ['cat-file', '-s', oid]).toString());
    if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) return fail('too-large');
    bytes = git(root, ['cat-file', 'blob', oid], maxBytes + 1);
    if (
      source === 'index' &&
      git(root, ['--literal-pathspecs', 'ls-files', '--stage', '-z', '--', path]).toString() !==
        listing
    )
      return fail('stale');
  }
  return { status: 'ready', bytes };
}

export function readMemoryImage(
  root: string,
  input: string,
  source: string,
  git: MemoryGit,
): { image: MemoryImage; bytes?: Buffer } {
  const fail = (status: MemoryImage['status']) => ({ image: { source, status } });
  const result = readMemoryBytes(root, input, source, git);
  const bytes = result.bytes;
  if (result.status !== 'ready' || bytes === undefined) return fail(result.status);
  try {
    const format = inspectImage(bytes);
    return {
      image: {
        source,
        status: 'ready',
        mime: format.mime,
        revision: createHash('sha256').update(bytes).digest('hex'),
        size: bytes.length,
        width: format.width,
        height: format.height,
      },
      bytes,
    };
  } catch (error) {
    if (error instanceof ImageFormatError) return fail(error.status);
    throw error;
  }
}
