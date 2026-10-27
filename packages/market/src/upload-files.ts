export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MAX_UPLOAD_FILES = 2_000;
export const MAX_UPLOAD_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_BOTS_PER_ACCOUNT = 20;
export const MAX_UPLOAD_PATH_LENGTH = 300;

export type UploadFileKind = 'text' | 'script' | 'image';

export type UploadFileType = 'markdown' | 'text' | 'data' | 'script' | 'image';

export const UPLOAD_FILE_TYPES: readonly UploadFileType[] = [
  'markdown',
  'text',
  'data',
  'script',
  'image',
];

export interface FileTypeSummary {
  type: UploadFileType;
  count: number;
  size: number;
}

export interface FileSummary {
  count: number;
  size: number;
  types: FileTypeSummary[];
}

const TEXT = new Set([
  'md',
  'markdown',
  'mdx',
  'txt',
  'text',
  'rst',
  'org',
  'adoc',
  'tex',
  'json',
  'jsonc',
  'jsonl',
  'ndjson',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'csv',
  'tsv',
  'xml',
  'html',
  'htm',
  'css',
  'svg',
  'log',
  'diff',
  'patch',
]);

const SCRIPT = new Set([
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'mts',
  'cts',
  'tsx',
  'py',
  'rb',
  'pl',
  'php',
  'lua',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'r',
  'sql',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'psm1',
  'bat',
  'cmd',
  'applescript',
]);

const MARKDOWN = new Set(['md', 'markdown', 'mdx']);
const DATA = new Set([
  'json',
  'jsonc',
  'jsonl',
  'ndjson',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'conf',
  'csv',
  'tsv',
  'xml',
]);

const IMAGE: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

const BARE_TEXT = new Set([
  'license',
  'licence',
  'readme',
  'notice',
  'authors',
  'changelog',
  'contributing',
  '.gitignore',
  '.gitattributes',
  '.editorconfig',
]);
const BARE_SCRIPT = new Set(['makefile', 'dockerfile', 'justfile', 'procfile']);

function extension(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? undefined : name.slice(dot + 1).toLowerCase();
}

export function uploadFileKind(path: string): UploadFileKind | undefined {
  const name = path.split('/').at(-1) ?? '';
  const lower = name.toLowerCase();
  if (BARE_TEXT.has(lower)) return 'text';
  if (BARE_SCRIPT.has(lower)) return 'script';
  const ext = extension(name);
  if (ext === undefined) return undefined;
  if (IMAGE[ext] !== undefined) return 'image';
  if (SCRIPT.has(ext)) return 'script';
  return TEXT.has(ext) ? 'text' : undefined;
}

export function uploadFileType(path: string, kind: UploadFileKind): UploadFileType {
  if (kind !== 'text') return kind;
  const ext = extension(path.split('/').at(-1) ?? '');
  if (ext !== undefined && MARKDOWN.has(ext)) return 'markdown';
  return ext !== undefined && DATA.has(ext) ? 'data' : 'text';
}

export function summarizeFiles(
  files: ReadonlyArray<{ path: string; size: number; kind: UploadFileKind }>,
): FileSummary {
  const totals = new Map<UploadFileType, FileTypeSummary>();
  let size = 0;
  for (const file of files) {
    const type = uploadFileType(file.path, file.kind);
    const entry = totals.get(type) ?? { type, count: 0, size: 0 };
    entry.count += 1;
    entry.size += file.size;
    totals.set(type, entry);
    size += file.size;
  }
  const types = [...totals.values()].sort(
    (left, right) =>
      right.size - left.size ||
      UPLOAD_FILE_TYPES.indexOf(left.type) - UPLOAD_FILE_TYPES.indexOf(right.type),
  );
  return { count: files.length, size, types };
}

export function imageContentType(path: string): string | undefined {
  const ext = extension(path.split('/').at(-1) ?? '');
  return ext === undefined ? undefined : IMAGE[ext];
}

function hasControl(text: string): boolean {
  return [...text].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
}

export function isUploadPath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_UPLOAD_PATH_LENGTH) return false;
  if (path.startsWith('/') || path.includes('\\') || hasControl(path)) return false;
  if (path.normalize('NFC') !== path) return false;
  return path
    .split('/')
    .every((part) => part !== '' && part !== '.' && part !== '..' && part.toLowerCase() !== '.git');
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

export function contentMatchesKind(path: string, bytes: Uint8Array): boolean {
  const kind = uploadFileKind(path);
  if (kind === undefined) return false;
  if (kind === 'image') {
    const type = imageContentType(path);
    if (type === 'image/png')
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    if (type === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff]);
    if (type === 'image/gif') return startsWith(bytes, [0x47, 0x49, 0x46, 0x38]);
    return (
      startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)
    );
  }
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function sha256Hex(bytes: Uint8Array<ArrayBuffer> | ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
