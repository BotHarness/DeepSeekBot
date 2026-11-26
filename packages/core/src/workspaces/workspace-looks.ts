import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import { HOST_COLOR_IDS, HOST_SYMBOL_IDS } from '@botharness/host-client/ui/design/host-look';
import type {
  HostSessionFolderLook,
  WorkspaceLook,
  WorkspaceLookIcon,
} from '@botharness/host-protocol/host-sessions';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const WORKSPACE_FAVICON_PATH = '/api/botharness/workspace-favicon';

export const FAVICON_CANDIDATES = [
  'favicon.svg',
  'favicon.ico',
  'favicon.png',
  'public/favicon.svg',
  'public/favicon.ico',
  'public/favicon.png',
  'app/favicon.ico',
  'app/favicon.png',
  'app/icon.svg',
  'app/icon.png',
  'app/icon.ico',
  'src/favicon.ico',
  'src/favicon.svg',
  'src/app/favicon.ico',
  'src/app/icon.svg',
  'src/app/icon.png',
  'assets/icon.svg',
  'assets/icon.png',
  'assets/logo.svg',
  'assets/logo.png',
  '.idea/icon.svg',
] as const;

export const ICON_SOURCE_FILES = [
  'index.html',
  'public/index.html',
  'app/routes/__root.tsx',
  'src/routes/__root.tsx',
  'app/root.tsx',
  'src/root.tsx',
  'src/index.html',
] as const;

export const FAVICON_MAX_BYTES = 1024 * 1024;
const SOURCE_MAX_BYTES = 512 * 1024;
const POSITIVE_TTL = 10 * 60_000;
const NEGATIVE_TTL = 60_000;
const CACHE_CAPACITY = 512;
const EMOJI_MAX = 16;

const LINK_ICON_HTML =
  /<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["']([^"'?#]+))[^>]*>/iu;
const ICON_REL = /\brel\s*:\s*["'](?:icon|shortcut icon)["']/iu;
const ICON_HREF = /\bhref\s*:\s*["']([^"'?#]+)/iu;

const MEDIA_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon',
};

export function extractIconHref(source: string): string | undefined {
  const html = LINK_ICON_HTML.exec(source)?.[1];
  if (html !== undefined) return html;
  for (const run of source.split('}')) {
    if (!ICON_REL.test(run)) continue;
    const href = ICON_HREF.exec(run)?.[1];
    if (href !== undefined) return href;
  }
  return undefined;
}

function mediaType(path: string): string | undefined {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return MEDIA_TYPES[extension];
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
}

export interface WorkspaceFavicon {
  path: string;
  mediaType: string;
  version: string;
}

export async function findWorkspaceFavicon(cwd: string): Promise<WorkspaceFavicon | undefined> {
  const root = await realpath(cwd).catch(() => undefined);
  if (root === undefined) return undefined;
  const accept = async (relativePath: string): Promise<WorkspaceFavicon | undefined> => {
    const type = mediaType(relativePath);
    if (type === undefined) return undefined;
    const real = await realpath(resolve(root, relativePath)).catch(() => undefined);
    if (real === undefined || !inside(root, real)) return undefined;
    const info = await stat(real).catch(() => undefined);
    if (info === undefined || !info.isFile() || info.size === 0 || info.size > FAVICON_MAX_BYTES)
      return undefined;
    const bytes = await readFile(real).catch(() => undefined);
    if (bytes === undefined) return undefined;
    return {
      path: real,
      mediaType: type,
      version: createHash('sha256').update(bytes).digest('hex').slice(0, 16),
    };
  };
  for (const candidate of FAVICON_CANDIDATES) {
    const found = await accept(candidate);
    if (found !== undefined) return found;
  }
  for (const sourceFile of ICON_SOURCE_FILES) {
    const real = await realpath(join(root, sourceFile)).catch(() => undefined);
    if (real === undefined || !inside(root, real)) continue;
    const info = await stat(real).catch(() => undefined);
    if (info === undefined || !info.isFile() || info.size > SOURCE_MAX_BYTES) continue;
    const href = extractIconHref(await readFile(real, 'utf8').catch(() => ''));
    if (href === undefined || /^[a-z][a-z\d+.-]*:/iu.test(href.trim())) continue;
    const clean = href.trim().replace(/^\/+/u, '');
    for (const candidate of [join('public', clean), clean]) {
      const found = await accept(candidate);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function workspaceKey(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 24);
}

export function normalizeWorkspaceLook(value: unknown): WorkspaceLook | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const look: WorkspaceLook = {};
  if (record['color'] !== undefined) {
    if (!(HOST_COLOR_IDS as readonly unknown[]).includes(record['color'])) return undefined;
    look.color = record['color'] as string;
  }
  if (record['icon'] !== undefined) {
    const icon = normalizeIcon(record['icon']);
    if (icon === undefined) return undefined;
    look.icon = icon;
  }
  return look;
}

function normalizeIcon(value: unknown): WorkspaceLookIcon | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (record['kind'] === 'monogram') return { kind: 'monogram' };
  if (record['kind'] === 'symbol')
    return (HOST_SYMBOL_IDS as readonly unknown[]).includes(record['id'])
      ? { kind: 'symbol', id: record['id'] as string }
      : undefined;
  if (record['kind'] === 'emoji' && typeof record['emoji'] === 'string') {
    const emoji = record['emoji'].trim();
    if (emoji === '' || [...emoji].length > EMOJI_MAX || /[\p{L}\p{N}]/u.test(emoji))
      return undefined;
    return { kind: 'emoji', emoji };
  }
  return undefined;
}

export interface WorkspaceLooks {
  get(path: string): WorkspaceLook | undefined;
  set(path: string, look: WorkspaceLook): WorkspaceLook;
  clear(path: string): boolean;
  folderLooks(paths: readonly string[]): Promise<Map<string, HostSessionFolderLook>>;
  favicon(key: string): WorkspaceFavicon | undefined;
  cached(path: string): HostSessionFolderLook | undefined;
  subscribe(changed: () => void): () => void;
}

function faviconUrl(path: string, favicon: WorkspaceFavicon): string {
  return `${WORKSPACE_FAVICON_PATH}?w=${workspaceKey(path)}&v=${favicon.version}`;
}

export function createWorkspaceLooks(options: {
  database: OperationalDatabaseModulePort;
  now?: () => number;
  find?: (cwd: string) => Promise<WorkspaceFavicon | undefined>;
}): WorkspaceLooks {
  const { database } = options;
  const now = options.now ?? Date.now;
  const find = options.find ?? findWorkspaceFavicon;
  const cache = new Map<string, { at: number; favicon: WorkspaceFavicon | undefined }>();
  const issued = new Map<string, WorkspaceFavicon>();
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const stored = (path: string): WorkspaceLook | undefined =>
    database.read((db) => {
      const row = db.prepare('SELECT body FROM workspace_looks WHERE path = ?').get(path);
      return row === undefined
        ? undefined
        : normalizeWorkspaceLook(JSON.parse(String(row['body'])));
    });
  const faviconFor = async (path: string): Promise<WorkspaceFavicon | undefined> => {
    const hit = cache.get(path);
    const time = now();
    if (
      hit !== undefined &&
      time - hit.at < (hit.favicon === undefined ? NEGATIVE_TTL : POSITIVE_TTL)
    )
      return hit.favicon;
    const favicon = await find(path).catch(() => undefined);
    if (!cache.has(path) && cache.size >= CACHE_CAPACITY)
      cache.delete(cache.keys().next().value as string);
    cache.set(path, { at: time, favicon });
    const key = workspaceKey(path);
    const previous = issued.get(key);
    if (favicon === undefined) issued.delete(key);
    else issued.set(key, favicon);
    if (previous?.version !== favicon?.version) notify();
    return favicon;
  };
  return {
    get: stored,
    set(path, look) {
      const normalized = normalizeWorkspaceLook(look);
      if (normalized === undefined) throw new TypeError('Invalid workspace look');
      database.transaction((db) => {
        db.prepare(
          `INSERT INTO workspace_looks (path, body, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(path) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
        ).run(path, JSON.stringify(normalized), new Date(now()).toISOString());
      });
      notify();
      return normalized;
    },
    clear(path) {
      const cleared = database.transaction(
        (db) => db.prepare('DELETE FROM workspace_looks WHERE path = ?').run(path).changes > 0,
      );
      if (cleared) notify();
      return cleared;
    },
    async folderLooks(paths) {
      const looks = new Map<string, HostSessionFolderLook>();
      const unique = [...new Set(paths)];
      const stored = database.read((db) => {
        const statement = db.prepare('SELECT path, body FROM workspace_looks WHERE path = ?');
        return new Map(
          unique.flatMap((path) => {
            const row = statement.get(path);
            const look =
              row === undefined
                ? undefined
                : normalizeWorkspaceLook(JSON.parse(String(row['body'])));
            return look === undefined ? [] : [[path, look] as const];
          }),
        );
      });
      await Promise.all(
        unique.map(async (path) => {
          const favicon = await faviconFor(path);
          const look: HostSessionFolderLook = {
            ...stored.get(path),
            ...(favicon === undefined ? {} : { favicon: faviconUrl(path, favicon) }),
          };
          if (Object.keys(look).length > 0) looks.set(path, look);
        }),
      );
      return looks;
    },
    favicon: (key) => issued.get(key),
    cached(path) {
      const favicon = issued.get(workspaceKey(path));
      const look: HostSessionFolderLook = {
        ...stored(path),
        ...(favicon === undefined ? {} : { favicon: faviconUrl(path, favicon) }),
      };
      return Object.keys(look).length === 0 ? undefined : look;
    },
    subscribe(changed) {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
  };
}

export function createWorkspaceFaviconHttp(
  looks: Pick<WorkspaceLooks, 'favicon'>,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405, headers: { allow: 'GET' } });
    const key = new URL(request.url).searchParams.get('w');
    const favicon = key === null ? undefined : looks.favicon(key);
    if (favicon === undefined)
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    const bytes = await readFile(favicon.path).catch(() => undefined);
    if (bytes === undefined || bytes.byteLength > FAVICON_MAX_BYTES)
      return new Response('not found', { status: 404, headers: { 'cache-control': 'no-store' } });
    return new Response(new Uint8Array(bytes), {
      headers: {
        'content-type': favicon.mediaType,
        'cache-control': 'private, max-age=300',
        'x-content-type-options': 'nosniff',
        ...(favicon.mediaType === 'image/svg+xml'
          ? { 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'" }
          : {}),
      },
    });
  };
}
