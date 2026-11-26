import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import {
  FAVICON_MAX_BYTES,
  WORKSPACE_FAVICON_PATH,
  createWorkspaceFaviconHttp,
  createWorkspaceLooks,
  extractIconHref,
  findWorkspaceFavicon,
  normalizeWorkspaceLook,
  workspaceKey,
  type WorkspaceFavicon,
} from '../src/workspaces/workspace-looks.js';
import { deferred } from './deferred.js';
import { createTempRoot } from './helpers.js';
import { registryDatabase } from './registry-fixture.js';
import { alice, fixture } from './team-bot-visibility-fixtures.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function folder(files: Record<string, string | Buffer>): string {
  const root = createTempRoot('workspace-look-');
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
}

function store(find?: (cwd: string) => ReturnType<typeof findWorkspaceFavicon>) {
  const root = createTempRoot('workspace-look-db-');
  let now = 1_000;
  const looks = createWorkspaceLooks({
    database: attachOperationalModule(registryDatabase(root), 'workspace-looks'),
    now: () => now,
    ...(find === undefined ? {} : { find }),
  });
  return { looks, advance: (ms: number) => (now += ms) };
}

it('finds the first favicon candidate in t3code order', async () => {
  const root = folder({ 'public/favicon.png': PNG, 'assets/logo.svg': '<svg/>' });
  expect(await findWorkspaceFavicon(root)).toEqual({
    path: join(root, 'public/favicon.png'),
    mediaType: 'image/png',
    version: expect.stringMatching(/^[\da-f]{16}$/u),
  });
  expect(await findWorkspaceFavicon(folder({ 'favicon.ico': PNG })).then((f) => f?.mediaType)).toBe(
    'image/x-icon',
  );
});

it('follows a link rel=icon in index.html or a root route, inside the folder only', async () => {
  expect(extractIconHref('<link rel="icon" href="/brand/mark.svg?v=2">')).toBe('/brand/mark.svg');
  expect(extractIconHref("links: () => [{ rel: 'icon', href: '/icon.png' }]")).toBe('/icon.png');
  const html = folder({
    'index.html': '<head><link href="/brand/mark.svg" rel="shortcut icon"></head>',
    'public/brand/mark.svg': '<svg/>',
  });
  expect((await findWorkspaceFavicon(html))?.path).toBe(join(html, 'public/brand/mark.svg'));
  const escape = folder({ 'index.html': '<link rel="icon" href="../outside.png">' });
  writeFileSync(join(escape, '..', 'outside.png'), PNG);
  expect(await findWorkspaceFavicon(escape)).toBeUndefined();
  const remote = folder({ 'index.html': '<link rel="icon" href="https://cdn.example/icon.png">' });
  expect(await findWorkspaceFavicon(remote)).toBeUndefined();
});

it('accepts a multi-size favicon.ico of a few hundred KB, like t3code ships', async () => {
  const root = folder({ 'public/favicon.ico': Buffer.alloc(290 * 1024, 1) });
  expect((await findWorkspaceFavicon(root))?.mediaType).toBe('image/x-icon');
});

it('skips symlinks out of the folder, empty or oversized files and unknown types', async () => {
  const outside = folder({ 'secret.png': PNG });
  const linked = folder({});
  symlinkSync(join(outside, 'secret.png'), join(linked, 'favicon.png'));
  expect(await findWorkspaceFavicon(linked)).toBeUndefined();
  expect(
    await findWorkspaceFavicon(folder({ 'favicon.png': Buffer.alloc(FAVICON_MAX_BYTES + 1) })),
  ).toBeUndefined();
  expect(await findWorkspaceFavicon(folder({ 'favicon.png': '' }))).toBeUndefined();
  expect(await findWorkspaceFavicon(folder({ 'AppIcon.icns': PNG }))).toBeUndefined();
  expect(await findWorkspaceFavicon('/no/such/folder')).toBeUndefined();
});

it('accepts only known colours, Host symbols, one emoji or the monogram', () => {
  expect(normalizeWorkspaceLook({ color: 'green', icon: { kind: 'symbol', id: 'globe' } })).toEqual(
    { color: 'green', icon: { kind: 'symbol', id: 'globe' } },
  );
  expect(normalizeWorkspaceLook({ icon: { kind: 'emoji', emoji: ' 🚀 ' } })).toEqual({
    icon: { kind: 'emoji', emoji: '🚀' },
  });
  expect(normalizeWorkspaceLook({ icon: { kind: 'monogram' } })).toEqual({
    icon: { kind: 'monogram' },
  });
  for (const bad of [
    { color: 'chartreuse' },
    { icon: { kind: 'symbol', id: 'rocket' } },
    { icon: { kind: 'emoji', emoji: 'AB' } },
    { icon: { kind: 'emoji', emoji: '' } },
    { icon: { kind: 'lucide', name: 'folder' } },
    'green',
    null,
  ])
    expect(normalizeWorkspaceLook(bad)).toBeUndefined();
});

it('stores a look per folder and merges it with a cached favicon URL', async () => {
  const find = vi.fn(async (cwd: string) =>
    cwd === '/web'
      ? { path: '/web/favicon.png', mediaType: 'image/png', version: 'abc' }
      : undefined,
  );
  const { looks, advance } = store(find);
  expect(looks.set('/web', { color: 'teal' })).toEqual({ color: 'teal' });
  expect(looks.get('/web')).toEqual({ color: 'teal' });
  const first = await looks.folderLooks(['/web', '/web', '/plain']);
  expect([...first]).toEqual([
    [
      '/web',
      { color: 'teal', favicon: `${WORKSPACE_FAVICON_PATH}?w=${workspaceKey('/web')}&v=abc` },
    ],
  ]);
  expect(looks.favicon(workspaceKey('/web'))?.path).toBe('/web/favicon.png');
  await looks.folderLooks(['/web', '/plain']);
  expect(find).toHaveBeenCalledTimes(2);
  advance(61_000);
  await looks.folderLooks(['/web', '/plain']);
  expect(find).toHaveBeenCalledTimes(3);
  advance(10 * 60_000);
  await looks.folderLooks(['/web']);
  expect(find).toHaveBeenCalledTimes(4);
  expect(looks.clear('/web')).toBe(true);
  expect(looks.get('/web')).toBeUndefined();
  expect(looks.clear('/web')).toBe(false);
});

it('serves only favicons it issued, with the file type and no script', async () => {
  const root = folder({ 'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>' });
  const { looks } = store();
  await looks.folderLooks([root]);
  const http = createWorkspaceFaviconHttp(looks);
  const response = await http(
    new Request(`http://host${WORKSPACE_FAVICON_PATH}?w=${workspaceKey(root)}`),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/svg+xml');
  expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect(await response.text()).toContain('<svg');
  expect((await http(new Request(`http://host${WORKSPACE_FAVICON_PATH}?w=unknown`))).status).toBe(
    404,
  );
  expect(
    (await http(new Request(`http://host${WORKSPACE_FAVICON_PATH}`, { method: 'POST' }))).status,
  ).toBe(405);
});

it('puts each folder look on Session rows for everyone and lets only the Owner change it', async () => {
  const web = folder({ 'favicon.png': PNG });
  const { looks } = store();
  looks.set('/work/alpha', { color: 'purple', icon: { kind: 'emoji', emoji: '🧪' } });
  const f = fixture({
    nativeSessions: {
      list: async () => [
        { sessionId: 'native', cwd: web, running: false, lastPromptAt: 30, updatedAt: 31 },
        { sessionId: 'alice', cwd: '/work/alpha', running: false, lastPromptAt: 20, updatedAt: 50 },
      ],
      read: async () => ({ events: [], seq: 0, running: false }),
      isRoot: async () => true,
      send: async () => ({ requestId: 'r' }),
    },
    workspaceLooks: looks,
  });
  f.ownership.claim({
    sessionId: 'alice',
    botSlug: 'alice-bot',
    rootRole: 'orchestrator',
    at: '2026-11-26',
  });
  const owner = f.bridge(OWNER_HUMAN_CONTEXT);
  const member = f.bridge(alice);
  const ownerRows = await owner.sessionList({});
  expect(ownerRows).toMatchObject({
    ok: true,
    value: {
      sessions: [
        {
          sessionId: 'native',
          folderLook: { favicon: expect.stringContaining(`w=${workspaceKey(web)}`) },
        },
        {
          sessionId: 'alice',
          folderLook: { color: 'purple', icon: { kind: 'emoji', emoji: '🧪' } },
        },
      ],
    },
  });
  expect(await member.sessionList({})).toMatchObject({
    ok: true,
    value: { sessions: [{ sessionId: 'alice', folderLook: { color: 'purple' } }] },
  });
  expect(await member.workspaceLookSet({ path: '/work/alpha', look: null })).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  expect(await member.workspaceLook({ path: '/work/alpha' })).toMatchObject({ ok: false });
  expect(await owner.workspaceLookSet({ path: 'relative', look: { color: 'red' } })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(
    await owner.workspaceLookSet({ path: '/work/alpha', look: { color: 'chartreuse' } }),
  ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  expect(
    await owner.workspaceLookSet({ path: '/work/alpha', look: { icon: { kind: 'monogram' } } }),
  ).toEqual({ ok: true, value: { path: '/work/alpha', look: { icon: { kind: 'monogram' } } } });
  expect(await owner.workspaceLookSet({ path: '/work/alpha', look: null })).toEqual({
    ok: true,
    value: { path: '/work/alpha', look: null },
  });
  expect(await owner.workspaceLook({ path: '/work/alpha' })).toEqual({
    ok: true,
    value: { path: '/work/alpha', look: null },
  });
});

it('reads a cached look without disk I/O and announces look and favicon changes', async () => {
  let version: string | undefined = 'one';
  const find = vi.fn(async (cwd: string) =>
    cwd === '/web' && version !== undefined
      ? { path: '/web/favicon.png', mediaType: 'image/png', version }
      : undefined,
  );
  const { looks, advance } = store(find);
  const changed = vi.fn();
  const stop = looks.subscribe(changed);
  expect(looks.cached('/web')).toBeUndefined();
  await looks.folderLooks(['/plain']);
  expect(changed).not.toHaveBeenCalled();
  find.mockClear();
  await looks.folderLooks(['/web']);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(looks.cached('/web')).toEqual({
    favicon: `${WORKSPACE_FAVICON_PATH}?w=${workspaceKey('/web')}&v=one`,
  });
  expect(find).toHaveBeenCalledTimes(1);
  looks.set('/web', { color: 'teal' });
  expect(changed).toHaveBeenCalledTimes(2);
  expect(looks.cached('/web')).toMatchObject({ color: 'teal' });
  advance(11 * 60_000);
  await looks.folderLooks(['/web']);
  expect(changed).toHaveBeenCalledTimes(2);

  await looks.folderLooks(Array.from({ length: 512 }, (_, index) => `/other-${index}`));
  expect(looks.cached('/web')).toMatchObject({ favicon: expect.stringContaining('&v=one') });
  await looks.folderLooks(['/web']);
  expect(changed).toHaveBeenCalledTimes(2);

  version = 'two';
  advance(11 * 60_000);
  await looks.folderLooks(['/web']);
  expect(changed).toHaveBeenCalledTimes(3);
  version = undefined;
  advance(11 * 60_000);
  await looks.folderLooks(['/web']);
  expect(changed).toHaveBeenCalledTimes(4);
  expect(looks.cached('/web')).toEqual({ color: 'teal' });
  expect(looks.clear('/web')).toBe(true);
  expect(changed).toHaveBeenCalledTimes(5);
  looks.clear('/web');
  expect(changed).toHaveBeenCalledTimes(5);
  stop();
  looks.set('/web', { color: 'red' });
  expect(changed).toHaveBeenCalledTimes(5);
});

const concurrentFavicon: WorkspaceFavicon = {
  path: '/web/favicon.png',
  mediaType: 'image/png',
  version: 'current',
};

it.each([
  { outcome: 'discovery', olderFavicon: undefined, latestFavicon: concurrentFavicon },
  { outcome: 'removal', olderFavicon: concurrentFavicon, latestFavicon: undefined },
])('keeps the later-started favicon $outcome when an older lookup finishes last', async (entry) => {
  const stale = deferred<WorkspaceFavicon | undefined>();
  const current = deferred<WorkspaceFavicon | undefined>();
  const find = vi
    .fn<typeof findWorkspaceFavicon>()
    .mockResolvedValue(undefined)
    .mockReturnValueOnce(stale.promise)
    .mockReturnValueOnce(current.promise);
  const { looks } = store(find);
  const changed = vi.fn();
  const stop = looks.subscribe(changed);
  const path = '/web';
  const key = workspaceKey(path);
  const expected =
    entry.latestFavicon === undefined
      ? undefined
      : { favicon: `${WORKSPACE_FAVICON_PATH}?w=${key}&v=${entry.latestFavicon.version}` };

  const olderRead = looks.folderLooks([path]);
  const newerRead = looks.folderLooks([path]);
  current.resolve(entry.latestFavicon);
  expect((await newerRead).get(path)).toEqual(expected);
  stale.resolve(entry.olderFavicon);
  expect((await olderRead).get(path)).toEqual(expected);
  expect(looks.cached(path)).toEqual(expected);
  expect(looks.favicon(key)).toEqual(entry.latestFavicon);
  expect((await looks.folderLooks([path])).get(path)).toEqual(expected);
  expect(find).toHaveBeenCalledTimes(2);
  expect(changed).toHaveBeenCalledTimes(entry.latestFavicon === undefined ? 0 : 1);
  stop();
});
