import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { MemoryImageError, readMemoryBytes, type MemoryGit } from './image.js';
import { toMemoryRelativePath } from './jail.js';

export const MAX_MEMORY_MARKDOWN_BYTES = 4 * 1024 * 1024;
export interface MemoryMarkdown {
  source: string;
  status: 'ready' | 'missing' | 'unsupported' | 'too-large' | 'stale';
  revision?: string;
  body: string;
}
export interface MemoryMarkdownComparison {
  before?: MemoryMarkdown;
  after?: MemoryMarkdown;
}
export const isMemoryMarkdown = (path: string): boolean => /\.(?:md|markdown)$/iu.test(path);
export function readMemoryMarkdown(
  root: string,
  path: string,
  source: string,
  git: MemoryGit,
  maxBytes = MAX_MEMORY_MARKDOWN_BYTES,
): MemoryMarkdown {
  if (!isMemoryMarkdown(path)) return { source, status: 'unsupported', body: '' };
  const { bytes, status } = readMemoryBytes(root, path, source, git, maxBytes);
  if (bytes === undefined) return { source, status, body: '' };
  try {
    if (bytes.includes(0)) return { source, status: 'unsupported', body: '' };
    return {
      source,
      status: 'ready',
      revision: createHash('sha256').update(bytes).digest('hex'),
      body: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    return { source, status: 'unsupported', body: '' };
  }
}
export function memoryMarkdownImagePath(document: string, reference: string): string {
  const invalid = (): never => {
    throw new MemoryImageError('memory-image-invalid', 'Image reference must stay inside Memory');
  };
  if (!reference || /[\\\u0000-\u001f\u007f]/u.test(reference) || reference.startsWith('//'))
    invalid();
  let decoded: string;
  try {
    decoded = decodeURIComponent(reference.split(/[?#]/u)[0]!);
  } catch {
    return invalid();
  }
  if (!decoded || /[\\:\u0000-\u001f\u007f]/u.test(decoded) || decoded.startsWith('//')) invalid();
  const segments = decoded.startsWith('/')
    ? []
    : posix
        .dirname(toMemoryRelativePath(document))
        .split('/')
        .filter((p) => p !== '.');
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part.toLowerCase() === '.git') invalid();
    if (part === '..') {
      if (segments.length === 0) invalid();
      segments.pop();
    } else segments.push(part);
  }
  return toMemoryRelativePath(segments.join('/'));
}
