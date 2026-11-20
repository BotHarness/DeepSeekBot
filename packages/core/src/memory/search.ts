import { execFile, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface MemorySearchHit {
  path: string;
  line: number;
  excerpt: string;
}

export interface MemorySearchFile {
  path: string;
  skipLines: number;
}

export const MEMORY_SEARCH_EXCERPT_LIMIT = 240;

let ripgrepDetected: boolean | undefined;

export function hasRipgrep(): boolean {
  if (ripgrepDetected === undefined) {
    try {
      ripgrepDetected =
        spawnSync('rg', ['--version'], { windowsHide: true, stdio: 'ignore', shell: false })
          .status === 0;
    } catch {
      ripgrepDetected = false;
    }
  }
  return ripgrepDetected;
}

function excerptOf(line: string): string {
  const trimmed = line.trim();
  return trimmed.length > MEMORY_SEARCH_EXCERPT_LIMIT
    ? `${trimmed.slice(0, MEMORY_SEARCH_EXCERPT_LIMIT)}...`
    : trimmed;
}

function run(
  file: string,
  args: string[],
  cwd: string,
): Promise<{ stdout: string; code: number | null }> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, shell: false },
      (error, stdout) => {
        const rawCode = error === null ? 0 : (error.code as unknown);
        resolve({ stdout, code: typeof rawCode === 'number' ? rawCode : null });
      },
    );
  });
}

export function parseRipgrepOutput(output: string): MemorySearchHit[] {
  const hits: MemorySearchHit[] = [];
  for (const rawLine of output.split('\n')) {
    if (rawLine.length === 0) continue;
    const match = /^(.*?):(\d+):(.*)$/.exec(rawLine);
    if (match === null) continue;
    hits.push({
      path: match[1] ?? '',
      line: Number.parseInt(match[2] ?? '0', 10),
      excerpt: excerptOf(match[3] ?? ''),
    });
  }
  return hits;
}

async function searchWithNode(
  root: string,
  files: readonly MemorySearchFile[],
  query: string,
): Promise<MemorySearchHit[]> {
  const needle = query.toLowerCase();
  const hits: MemorySearchHit[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(join(root, file.path), 'utf8');
    } catch {
      continue;
    }
    const lines = text.split('\n');
    for (let index = file.skipLines; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (line.toLowerCase().includes(needle)) {
        hits.push({ path: file.path, line: index + 1, excerpt: excerptOf(line) });
      }
    }
  }
  return hits;
}

export async function searchMemoryFiles(
  root: string,
  files: readonly MemorySearchFile[],
  query: string,
): Promise<MemorySearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length === 0 || files.length === 0) return [];
  const skipByPath = new Map(files.map((file) => [file.path, file.skipLines]));
  let hits: MemorySearchHit[];
  if (hasRipgrep()) {
    const result = await run(
      'rg',
      [
        '--no-heading',
        '--line-number',
        '--with-filename',
        '--fixed-strings',
        '--ignore-case',
        '--no-messages',
        '--',
        trimmed,
        ...files.map((file) => file.path),
      ],
      root,
    );
    hits =
      result.code === 0
        ? parseRipgrepOutput(result.stdout)
        : result.code === 1
          ? []
          : await searchWithNode(root, files, trimmed);
  } else {
    hits = await searchWithNode(root, files, trimmed);
  }
  hits = hits.filter((hit) => hit.line > (skipByPath.get(hit.path) ?? 0));
  hits.sort((left, right) => {
    if (left.path === right.path) return left.line - right.line;
    return left.path < right.path ? -1 : 1;
  });
  return hits;
}
