import { mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';

import type { EngineBotTool } from './engine-tools.js';

export const ENGINE_MEMORY_TOOL_NAMES: readonly string[] = [
  'memory_list',
  'memory_read',
  'memory_write',
];

const MAX_READ = 256 * 1024;
const MAX_WRITE = 256 * 1024;
const MAX_LIST = 500;

function relativePath(value: unknown, allowRoot: boolean): string {
  const path = typeof value === 'string' ? value.trim() : '';
  if (path === '' || path === '.') {
    if (allowRoot) return '';
    throw new Error('path is required');
  }
  if (isAbsolute(path) || path.includes('\0')) throw new Error('path must be relative to Memory');
  const parts = path.split(/[\\/]+/u).filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..' || part === '.git'))
    throw new Error('path must stay inside Memory and outside .git');
  return parts.join(sep);
}

async function inside(root: string, target: string): Promise<string> {
  const realRoot = await realpath(root);
  let probe = target;
  for (;;) {
    try {
      const real = await realpath(probe);
      const rel = relative(realRoot, real);
      if (rel.startsWith('..') || isAbsolute(rel) || rel.split(sep).includes('.git'))
        throw new Error('path must stay inside Memory and outside .git');
      return join(real, relative(probe, target));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(probe);
      if (parent === probe) throw error;
      probe = parent;
    }
  }
}

export function createEngineMemoryTools(memoryDir: () => string | undefined): EngineBotTool[] {
  const root = (): string => {
    const dir = memoryDir();
    if (dir === undefined) throw new Error('Memory is unavailable');
    return dir;
  };
  return [
    {
      name: 'memory_list',
      description:
        "List files in this PersonaBot's Memory folder (SOUL.md, MEMORY.md and notes). Paths are relative to Memory; .git is hidden.",
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Folder inside Memory; default root.' },
        },
      },
      run: async (args) => {
        const base = root();
        const start = await inside(base, join(base, relativePath(args['path'], true)));
        const realBase = await realpath(base);
        const files: string[] = [];
        const walk = async (dir: string): Promise<void> => {
          for (const entry of await readdir(dir, { withFileTypes: true })) {
            if (files.length >= MAX_LIST) return;
            if (entry.name === '.git') continue;
            const path = join(dir, entry.name);
            if (entry.isDirectory()) await walk(path);
            else if (entry.isFile()) files.push(relative(realBase, path).split(sep).join('/'));
          }
        };
        await walk(start);
        return JSON.stringify({ files: files.sort(), truncated: files.length >= MAX_LIST });
      },
    },
    {
      name: 'memory_read',
      description:
        "Read one text file from this PersonaBot's Memory folder, such as MEMORY.md, SOUL.md or a note.",
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path relative to Memory.' } },
        required: ['path'],
      },
      run: async (args) => {
        const base = root();
        const path = await inside(base, join(base, relativePath(args['path'], false)));
        const info = await stat(path);
        if (!info.isFile()) throw new Error('path is not a file');
        if (info.size > MAX_READ) throw new Error(`file is larger than ${MAX_READ} bytes`);
        return readFile(path, 'utf8');
      },
    },
    {
      name: 'memory_write',
      description:
        "Create or replace one text file in this PersonaBot's Memory folder. Use it to remember things across Sessions: update MEMORY.md for what you must always carry, or keep notes in other files. Never write secrets.",
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to Memory.' },
          content: { type: 'string', description: 'Whole new file content.' },
        },
        required: ['path', 'content'],
      },
      run: async (args) => {
        const content = args['content'];
        if (typeof content !== 'string') throw new Error('content must be a string');
        if (Buffer.byteLength(content, 'utf8') > MAX_WRITE)
          throw new Error(`content is larger than ${MAX_WRITE} bytes`);
        const base = root();
        const rel = relativePath(args['path'], false);
        const path = await inside(base, join(base, rel));
        await mkdir(dirname(path), { recursive: true });
        await inside(base, path);
        await writeFile(path, content, 'utf8');
        return JSON.stringify({
          path: rel.split(sep).join('/'),
          bytes: Buffer.byteLength(content),
        });
      },
    },
  ];
}
