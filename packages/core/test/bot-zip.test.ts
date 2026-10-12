import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { seededAvatarFor } from '../src/bots/avatar-appearance.js';
import { syncBotDescriptor } from '../src/bots/bot-descriptor-sync.js';
import { fallbackPrimaryColor, resolveBotPrimaryColor } from '../src/bots/primary-color.js';
import {
  BOT_ZIP_HISTORY_PATH,
  BOT_ZIP_MAX_BYTES,
  exportBotZip,
  readBotZip,
} from '../src/bots/bot-zip.js';
import { createBotZipHttp } from '../src/bots/bot-zip-http.js';
import { readZip, writeZip, ZipArchiveError } from '../src/bots/zip-archive.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_URL = `data:image/png;base64,${PNG.toString('base64')}`;
const LIMITS = { maxEntries: 100, maxTotalBytes: 1024 * 1024 };

function tempRoot(): string {
  return createTempRoot('botharness-bot-zip-');
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
}

function zipCodeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof ZipArchiveError) return error.code;
    throw error;
  }
  return undefined;
}

function registryAt(root: string) {
  return createTestRegistry({
    rootDir: join(root, 'bots'),
    database: trackTestOwner(registryDatabase(join(root, 'bots'))),
    initializeMemory: (memoryDir) => ({ ok: ensureMemoryRepository({ memoryDir }).ok }),
    syncDescriptor: (memoryDir, record, options) => syncBotDescriptor(memoryDir, record, options),
  });
}

function httpFor(registry: ReturnType<typeof registryAt>) {
  let next = 0;
  return createBotZipHttp({
    registry,
    createBotId: () => `zip-bot-${++next}`,
    detail: (slug) => {
      const record = registry.get(slug);
      return record === undefined
        ? { ok: false, error: { code: 'unknown-bot', message: slug } }
        : { ok: true, value: { bot: record } };
    },
  });
}

function importRequest(body: Uint8Array, name = 'Shared.zip', type = 'application/zip'): Request {
  return new Request(`http://host/api/botharness/bot-zip/import?${new URLSearchParams({ name })}`, {
    method: 'POST',
    headers: { 'content-type': type },
    body: new Uint8Array(body),
  });
}

describe('zip archive', () => {
  it('round-trips UTF-8 paths and binary content', () => {
    const archive = writeZip([
      { path: '笔记/会议.md', data: Buffer.from('# 会议\n'.repeat(200)) },
      { path: 'avatar.png', data: PNG },
    ]);
    expect(readZip(archive, LIMITS)).toEqual([
      { path: '笔记/会议.md', data: Buffer.from('# 会议\n'.repeat(200)) },
      { path: 'avatar.png', data: PNG },
    ]);
  });

  it('refuses traversal, absolute paths, symlinks, corrupt data and oversize archives', () => {
    for (const path of ['../evil.md', 'notes/../../evil.md', '/etc/passwd', 'C:/evil.md']) {
      const archive = writeZip([{ path, data: Buffer.from('x') }]);
      expect(zipCodeOf(() => readZip(archive, LIMITS))).toBe('unsafe-path');
    }

    const link = writeZip([{ path: 'link', data: Buffer.from('/etc/passwd') }]);
    const central = link.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    link.writeUInt32LE((0o120777 << 16) >>> 0, central + 38);
    expect(zipCodeOf(() => readZip(link, LIMITS))).toBe('unsafe-path');

    expect(zipCodeOf(() => readZip(Buffer.from('not a zip at all, sorry'), LIMITS))).toBe(
      'invalid-zip',
    );

    const corrupt = writeZip([{ path: 'a.txt', data: Buffer.from('stored text') }]);
    corrupt.writeUInt8(corrupt.readUInt8(30 + 'a.txt'.length) ^ 0xff, 30 + 'a.txt'.length);
    expect(zipCodeOf(() => readZip(corrupt, LIMITS))).toBe('invalid-zip');

    const bomb = writeZip([{ path: 'big.txt', data: Buffer.alloc(2 * 1024 * 1024) }]);
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(zipCodeOf(() => readZip(bomb, LIMITS))).toBe('too-large');
  });
});

describe('Bot Zip export', () => {
  it('holds the working tree with uncommitted changes and never Git internals or ignored files', () => {
    const memoryDir = tempRoot();
    expect(ensureMemoryRepository({ memoryDir }).ok).toBe(true);
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Soul\n');
    writeFileSync(join(memoryDir, '.gitignore'), 'secret.env\n');
    git(memoryDir, 'add', '-A');
    git(memoryDir, 'commit', '-qm', 'seed');
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Soul, edited\n');
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex\n');
    writeFileSync(join(memoryDir, 'secret.env'), 'TOKEN=1\n');
    symlinkSync('/etc/hosts', join(memoryDir, 'hosts-link'));
    git(memoryDir, 'update-ref', 'refs/botharness/recovery/x', 'HEAD');

    const files = new Map(
      readZip(exportBotZip(memoryDir), LIMITS).map((entry) => [entry.path, entry.data.toString()]),
    );
    expect([...files.keys()].sort()).toEqual([
      '.gitattributes',
      '.gitignore',
      'SOUL.md',
      'people/alex.md',
    ]);
    expect(files.get('SOUL.md')).toBe('# Soul, edited\n');
    expect([...files.keys()].some((path) => path.startsWith('.git/'))).toBe(false);
  });
});

describe('Bot Zip file selection', () => {
  it('lists the files with sizes and marks bot.json and the avatar as always included', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada', persona: '# Ada\n', avatar: PNG_URL });
    const memoryDir = registry.memoryDirFor('ada')!;
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex\n');

    const response = await httpFor(registry)(
      new Request('http://host/api/botharness/bot-zip/files?slug=ada'),
    );
    expect(response.status).toBe(200);
    const listing = (await response.json()) as {
      files: Array<{ path: string; size: number }>;
      always: string[];
    };
    expect(listing.always).toEqual([
      '.botharness/bot.json',
      '.botharness/avatar.png',
      '.botharness/banner.png',
    ]);
    expect(listing.files).toContainEqual({ path: 'people/alex.md', size: 5 });
    expect(listing.files.some((file) => file.path.startsWith('.git/'))).toBe(false);
  });

  it('exports exactly the selected files plus bot.json and the avatar', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada', persona: '# Ada\n', avatar: PNG_URL });
    const memoryDir = registry.memoryDirFor('ada')!;
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex\n');
    writeFileSync(join(memoryDir, 'people', 'sam.md'), 'Sam\n');
    writeFileSync(join(memoryDir, 'diary.md'), 'private\n');
    writeFileSync(join(root, 'outside.md'), 'outside\n');

    const response = await httpFor(registry)(
      new Request('http://host/api/botharness/bot-zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: 'ada',
          include: ['SOUL.md', 'people/alex.md', '.git/config', '../../outside.md', 'missing.md'],
        }),
      }),
    );
    expect(response.status).toBe(200);
    const entries = readZip(Buffer.from(await response.arrayBuffer()), LIMITS);
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      '.botharness/avatar.png',
      '.botharness/banner.png',
      '.botharness/bot.json',
      'SOUL.md',
      'people/alex.md',
    ]);
    expect(entries.find((entry) => entry.path === 'people/alex.md')?.data.toString()).toBe(
      'Alex\n',
    );
  });

  it('refuses a malformed selection', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const http = httpFor(registry);
    const post = (body: string, type = 'application/json') =>
      http(
        new Request('http://host/api/botharness/bot-zip', {
          method: 'POST',
          headers: { 'content-type': type },
          body,
        }),
      );
    expect((await post('{not json')).status).toBe(400);
    expect((await post(JSON.stringify({ slug: 'ada', include: [1] }))).status).toBe(400);
    expect((await post(JSON.stringify({ slug: 'ada', include: [] }), 'text/plain')).status).toBe(
      415,
    );
    expect((await post(JSON.stringify({ slug: 'nobody', include: [] }))).status).toBe(404);
  });
});

describe('Bot Zip import', () => {
  it('applies explicit import metadata over the descriptor and refuses invalid overrides before creation', async () => {
    const registry = registryAt(tempRoot());
    const http = httpFor(registry);
    const archive = writeZip([
      { path: 'SOUL.md', data: Buffer.from('# Persona') },
      {
        path: '.botharness/bot.json',
        data: Buffer.from('{"name":"Original","tags":["original"],"bio":"Old"}'),
      },
    ]);
    const request = new Request(
      `http://host/api/botharness/bot-zip/import?${new URLSearchParams({ displayName: 'Override', roles: '["QA"]', description: 'New' })}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/zip' },
        body: new Uint8Array(archive),
      },
    );
    expect((await http(request)).status).toBe(200);
    expect(registry.list()[0]).toMatchObject({
      displayName: 'Override',
      roles: ['QA'],
      description: 'New',
    });
    const invalid = new Request('http://host/api/botharness/bot-zip/import?roles=42', {
      method: 'POST',
      headers: { 'content-type': 'application/zip' },
      body: new Uint8Array(archive),
    });
    expect((await http(invalid)).status).toBe(400);
    expect(registry.list()).toHaveLength(1);
  });

  it('returns the created identity when post-import detail readback fails', async () => {
    const registry = registryAt(tempRoot());
    const http = createBotZipHttp({
      registry,
      createBotId: () => 'minted',
      detail: () => ({ ok: false, error: { code: 'unavailable', message: 'Cannot read detail' } }),
    });
    const response = await http(
      importRequest(writeZip([{ path: 'SOUL.md', data: Buffer.from('# Persona') }])),
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      bot: { id: 'minted', name: 'Shared' },
      outcome: 'created',
    });
    expect(registry.get('minted')).toBeDefined();
  });
  it('strips the supplied archive suffix only once for the fallback name', async () => {
    const registry = registryAt(tempRoot());
    const response = await httpFor(registry)(
      importRequest(
        writeZip([{ path: 'SOUL.md', data: Buffer.from('# Persona') }]),
        'project.zip.zip',
      ),
    );
    expect(response.status).toBe(200);
    expect(registry.list()[0]?.displayName).toBe('project.zip');
  });

  it('reads a re-zipped folder, skipping macOS metadata and Git internals', () => {
    const contents = readBotZip(
      writeZip([
        { path: 'Ada/SOUL.md', data: Buffer.from('# Ada\n') },
        { path: 'Ada/.git/config', data: Buffer.from('[core]\n') },
        { path: 'Ada/.DS_Store', data: Buffer.from('x') },
        { path: '__MACOSX/Ada/._SOUL.md', data: Buffer.from('x') },
        { path: 'Ada/.botharness/bot.json', data: Buffer.from('{"name":"Ada","roles":["QA"]}') },
      ]),
    );
    expect(contents.files.map((file) => file.path)).toEqual(['SOUL.md', '.botharness/bot.json']);
    expect(contents.descriptor).toEqual({ name: 'Ada', tags: ['QA'] });
    expect(zipCodeOf(() => readBotZip(writeZip([])))).toBe('empty');
  });

  it('imports the legacy roles of an older zip as Tags', async () => {
    const registry = registryAt(tempRoot());
    const archive = writeZip([
      { path: 'Old/SOUL.md', data: Buffer.from('# Old\n') },
      {
        path: 'Old/.botharness/bot.json',
        data: Buffer.from('{"name":"Old","roles":["Legacy"]}'),
      },
    ]);
    const imported = await httpFor(registry)(importRequest(new Uint8Array(archive)));
    expect(imported.status).toBe(200);
    const body = (await imported.json()) as { bot: { slug: string } };
    expect(registry.get(body.bot.slug)).toMatchObject({ displayName: 'Old', roles: ['Legacy'] });
  });

  it('leaves no half-created Bot when the files cannot be unpacked', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const result = await registry.createFromFiles({
      slug: 'broken',
      displayName: 'Broken',
      files: [
        { path: 'notes', data: Buffer.from('file') },
        { path: 'notes/inner.md', data: Buffer.from('conflict') },
      ],
    });
    expect(result).toEqual({ ok: false, reason: 'invalid-zip' });
    expect(registry.get('broken')).toBeUndefined();
    expect(
      readdirSync(join(root, 'bots')).filter((name) => !name.startsWith('botharness')),
    ).toEqual([]);
  });

  it('exports a Bot and imports it as a fresh Bot with the same files, profile and one commit', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const created = registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['Researcher'],
      persona: '# Ada\n',
      avatar: PNG_URL,
    });
    expect(created.ok).toBe(true);
    expect(
      registry.update('ada', { roles: ['Researcher', 'Writer'], description: 'Finds sources' }).ok,
    ).toBe(true);
    const memoryDir = registry.memoryDirFor('ada')!;
    writeFileSync(join(memoryDir, 'MEMORY.md'), '- people/alex.md\n');
    mkdirSync(join(memoryDir, 'people'));
    writeFileSync(join(memoryDir, 'people', 'alex.md'), 'Alex likes tea\n');
    const http = httpFor(registry);

    const exported = await http(new Request('http://host/api/botharness/bot-zip?slug=ada'));
    expect(exported.status).toBe(200);
    expect(exported.headers.get('content-type')).toBe('application/zip');
    expect(exported.headers.get('content-disposition')).toContain('Ada.zip');
    const archive = new Uint8Array(await exported.arrayBuffer());
    const paths = readZip(Buffer.from(archive), LIMITS).map((entry) => entry.path);
    expect(paths).toContain('.botharness/bot.json');
    expect(paths).toContain('.botharness/avatar.png');
    expect(paths.some((path) => path === '.git' || path.startsWith('.git/'))).toBe(false);
    expect(paths.some((path) => /session|binding|credential/iu.test(path))).toBe(false);

    const imported = await http(importRequest(archive));
    expect(imported.status).toBe(200);
    const body = (await imported.json()) as { bot: { slug: string } };
    expect(body.bot.slug).toBe('zip-bot-1');
    const copy = registry.get('zip-bot-1')!;
    expect(copy).toMatchObject({
      displayName: 'Ada',
      roles: ['Researcher', 'Writer'],
      description: 'Finds sources',
      avatar: PNG_URL,
    });
    const copyDir = registry.memoryDirFor('zip-bot-1')!;
    for (const path of ['SOUL.md', 'MEMORY.md', 'people/alex.md', '.botharness/bot.json']) {
      expect(readFileSync(join(copyDir, path), 'utf8')).toBe(
        readFileSync(join(memoryDir, path), 'utf8'),
      );
    }
    expect(git(copyDir, 'rev-list', '--count', 'HEAD').trim()).toBe('1');
    expect(git(copyDir, 'status', '--porcelain').trim()).toBe('');
    expect(registry.get('ada')).toBeDefined();
  });

  it('carries the Bot Primary Color policy to a fresh identity for Custom, hair and fallback', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const http = httpFor(registry);
    const roundTrip = async (slug: string): Promise<string> => {
      const exported = await http(new Request(`http://host/api/botharness/bot-zip?slug=${slug}`));
      expect(exported.status).toBe(200);
      const archive = new Uint8Array(await exported.arrayBuffer());
      const descriptor = JSON.parse(
        readZip(Buffer.from(archive), LIMITS)
          .find((entry) => entry.path === '.botharness/bot.json')!
          .data.toString('utf8'),
      ) as { primaryColor: Record<string, unknown> };
      expect(
        Object.keys(descriptor.primaryColor).every((key) =>
          ['mode', 'color', 'fallback'].includes(key),
        ),
      ).toBe(true);
      const imported = await http(importRequest(archive));
      expect(imported.status).toBe(200);
      return ((await imported.json()) as { bot: { slug: string } }).bot.slug;
    };
    const resolved = (slug: string) => resolveBotPrimaryColor(registry.get(slug)!);
    const recipe = { ...seededAvatarFor('Hair', undefined), hairColor: '#3fc1b8' };
    const source = ['img', 'pic', 'photo', 'image'].find(
      (slug) =>
        fallbackPrimaryColor(slug) !== fallbackPrimaryColor('zip-bot-3') &&
        fallbackPrimaryColor(slug) !== fallbackPrimaryColor('zip-bot-2'),
    )!;
    expect(source).toBeDefined();

    expect(registry.create({ slug: 'cus', displayName: 'Custom' }).ok).toBe(true);
    expect(registry.setPrimaryColor('cus', { mode: 'custom', color: '#1d1b22' }).ok).toBe(true);
    const custom = await roundTrip('cus');
    expect(custom).toBe('zip-bot-1');
    expect(registry.get(custom)?.primaryColor).toEqual({
      mode: 'custom',
      color: '#1d1b22',
      fallback: fallbackPrimaryColor('cus'),
    });
    expect(registry.setAppearance(custom, recipe).ok).toBe(true);
    expect(registry.update(custom, { avatar: PNG_URL }).ok).toBe(true);
    expect(resolved(custom)).toEqual({ mode: 'custom', source: 'custom', color: '#1d1b22' });

    expect(registry.create({ slug: 'hair', displayName: 'Hair' }).ok).toBe(true);
    expect(registry.setAppearance('hair', recipe).ok).toBe(true);
    const haired = await roundTrip('hair');
    expect(registry.get(haired)?.primaryColor).toEqual({
      mode: 'automatic',
      fallback: fallbackPrimaryColor('hair'),
    });
    expect(resolved(haired)).toEqual({ mode: 'automatic', source: 'hair', color: '#3fc1b8' });

    expect(registry.create({ slug: source, displayName: 'Image', avatar: PNG_URL }).ok).toBe(true);
    const before = resolved(source);
    expect(before).toEqual({
      mode: 'automatic',
      source: 'fallback',
      color: fallbackPrimaryColor(source),
    });
    const pictured = await roundTrip(source);
    expect(pictured).toBe('zip-bot-3');
    expect(registry.get(pictured)?.primaryColor).toEqual({
      mode: 'automatic',
      fallback: before.color,
    });
    expect(resolved(pictured)).toEqual(before);
    expect(registryAt(root).get(pictured)?.primaryColor).toEqual({
      mode: 'automatic',
      fallback: before.color,
    });

    expect(registry.setAppearance(pictured, recipe).ok).toBe(true);
    expect(resolved(pictured)).toMatchObject({ source: 'hair', color: '#3fc1b8' });
    expect(registry.setPrimaryColor(pictured, { mode: 'custom', color: '#abcdef' }).ok).toBe(true);
    expect(registry.setPrimaryColor(pictured, { mode: 'automatic' }).ok).toBe(true);
    expect(registry.update(pictured, { avatar: PNG_URL }).ok).toBe(true);
    expect(resolved(pictured)).toEqual(before);
    const again = await roundTrip(pictured);
    expect(resolved(again)).toEqual(before);
  });

  it('imports archives without a color policy as Automatic and drops a malformed one', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const http = httpFor(registry);
    const archive = (descriptor: Record<string, unknown>) =>
      writeZip([
        { path: 'SOUL.md', data: Buffer.from('# Hi\n') },
        { path: '.botharness/bot.json', data: Buffer.from(JSON.stringify(descriptor)) },
        { path: '.botharness/avatar.png', data: PNG },
      ]);
    const legacy = { name: 'Legacy', avatar: { image: '.botharness/avatar.png' } };

    expect((await http(importRequest(archive(legacy)))).status).toBe(200);
    const old = registry.get('zip-bot-1')!;
    expect(old.displayName).toBe('Legacy');
    expect(old.primaryColor).toBeUndefined();
    expect(resolveBotPrimaryColor(old)).toEqual({
      mode: 'automatic',
      source: 'fallback',
      color: fallbackPrimaryColor('zip-bot-1'),
    });

    for (const primaryColor of [
      { mode: 'custom', color: 'red' },
      { mode: 'custom', color: '#1d1b22', light: '#000000', dark: '#ffffff' },
      { mode: 'automatic', color: '#1d1b22' },
      { mode: 'theme' },
      '#1d1b22',
    ]) {
      const response = await http(importRequest(archive({ ...legacy, primaryColor })));
      expect(response.status).toBe(200);
      const slug = ((await response.json()) as { bot: { slug: string } }).bot.slug;
      const record = registry.get(slug)!;
      expect(record.primaryColor, JSON.stringify(primaryColor)).toBeUndefined();
      expect(resolveBotPrimaryColor(record).mode).toBe('automatic');
      expect(registryAt(root).get(slug)).toEqual(record);
    }

    const upper = await http(
      importRequest(
        archive({
          ...legacy,
          primaryColor: { mode: 'custom', color: '#ABCDEF', fallback: '#123ABC' },
        }),
      ),
    );
    const slug = ((await upper.json()) as { bot: { slug: string } }).bot.slug;
    expect(registry.get(slug)?.primaryColor).toEqual({
      mode: 'custom',
      color: '#abcdef',
      fallback: '#123abc',
    });
  });

  it('answers bad uploads with clear errors and creates nothing', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const http = httpFor(registry);

    const wrongType = await http(importRequest(new Uint8Array([1]), 'x.zip', 'text/plain'));
    expect(wrongType.status).toBe(415);

    const notZip = await http(importRequest(Buffer.from('hello world, definitely not a zip')));
    expect(notZip.status).toBe(400);
    expect(((await notZip.json()) as { error: { code: string } }).error.code).toBe('invalid-zip');

    const traversal = await http(
      importRequest(writeZip([{ path: '../../outside.md', data: Buffer.from('x') }])),
    );
    expect(traversal.status).toBe(400);
    expect(((await traversal.json()) as { error: { code: string } }).error.code).toBe(
      'unsafe-path',
    );
    expect(existsSync(join(root, 'outside.md'))).toBe(false);

    const oversize = await http(
      new Request('http://host/api/botharness/bot-zip/import', {
        method: 'POST',
        headers: {
          'content-type': 'application/zip',
          'content-length': String(BOT_ZIP_MAX_BYTES + 1),
        },
        body: new Uint8Array([1]),
      }),
    );
    expect(oversize.status).toBe(413);
    expect(registry.list()).toEqual([]);
  });

  it('names the Bot after the zip file when it has no bot.json', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const response = await httpFor(registry)(
      importRequest(writeZip([{ path: 'SOUL.md', data: Buffer.from('# Hi\n') }]), '小研.zip'),
    );
    expect(response.status).toBe(200);
    expect(registry.get('zip-bot-1')?.displayName).toBe('小研');
  });
});

describe('Bot Zip with Git history', () => {
  function botWithHistory(root: string) {
    const registry = registryAt(root);
    registry.create({ slug: 'ada', displayName: 'Ada', persona: '# Ada\n' });
    const memoryDir = registry.memoryDirFor('ada')!;
    writeFileSync(join(memoryDir, 'MEMORY.md'), '- first\n');
    git(memoryDir, 'commit', '-qam', 'Remember the first thing');
    git(memoryDir, 'tag', 'v1');
    git(memoryDir, 'switch', '-qc', 'draft');
    writeFileSync(join(memoryDir, 'draft.md'), 'draft\n');
    git(memoryDir, 'add', 'draft.md');
    git(memoryDir, 'commit', '-qm', 'Draft an idea');
    git(memoryDir, 'switch', '-q', 'main');
    git(memoryDir, 'update-ref', 'refs/botharness/recovery/1', 'HEAD');
    git(memoryDir, 'remote', 'add', 'origin', 'https://example.com/secret-token@ada.git');
    git(memoryDir, 'config', 'credential.helper', 'store');
    writeFileSync(join(memoryDir, 'SOUL.md'), '# Ada, uncommitted\n');
    return { registry, memoryDir };
  }

  it('carries branches, tags and commits, and the import has no remote or source config', async () => {
    const root = tempRoot();
    const { registry, memoryDir } = botWithHistory(root);
    const http = httpFor(registry);

    const exported = await http(
      new Request('http://host/api/botharness/bot-zip?slug=ada&history=1'),
    );
    expect(exported.status).toBe(200);
    const archive = new Uint8Array(await exported.arrayBuffer());
    const paths = readZip(Buffer.from(archive), LIMITS).map((entry) => entry.path);
    expect(paths).toContain(BOT_ZIP_HISTORY_PATH);
    expect(paths.some((path) => path === '.git' || path.startsWith('.git/'))).toBe(false);

    const imported = await http(importRequest(archive));
    expect(imported.status).toBe(200);
    const copyDir = registry.memoryDirFor('zip-bot-1')!;
    expect(git(copyDir, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('main');
    expect(git(copyDir, 'for-each-ref', '--format=%(refname)').trim().split('\n').sort()).toEqual([
      'refs/heads/draft',
      'refs/heads/main',
      'refs/tags/v1',
    ]);
    for (const ref of ['main', 'draft', 'v1']) {
      expect(git(copyDir, 'rev-parse', ref)).toBe(git(memoryDir, 'rev-parse', ref));
    }
    expect(git(copyDir, 'log', '--format=%s', 'main')).toBe(
      git(memoryDir, 'log', '--format=%s', 'main'),
    );
    expect(git(copyDir, 'remote').trim()).toBe('');
    expect(readFileSync(join(copyDir, '.git', 'config'), 'utf8')).not.toMatch(
      /credential|example\.com/u,
    );
    expect(existsSync(join(copyDir, BOT_ZIP_HISTORY_PATH))).toBe(false);
    expect(existsSync(join(copyDir, 'draft.md'))).toBe(false);
    expect(readFileSync(join(copyDir, 'SOUL.md'), 'utf8')).toBe('# Ada, uncommitted\n');
    expect(git(copyDir, 'status', '--porcelain').trim()).toBe('M SOUL.md');
  });

  it('never adds history to a partial export', async () => {
    const root = tempRoot();
    const { registry, memoryDir } = botWithHistory(root);
    const partial = readZip(
      exportBotZip(memoryDir, { include: new Set(['SOUL.md']), history: true }),
      LIMITS,
    ).map((entry) => entry.path);
    expect(partial).not.toContain(BOT_ZIP_HISTORY_PATH);

    const response = await httpFor(registry)(
      new Request('http://host/api/botharness/bot-zip', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: 'ada', include: ['SOUL.md'], history: true }),
      }),
    );
    expect(response.status).toBe(400);

    writeFileSync(join(memoryDir, BOT_ZIP_HISTORY_PATH), 'stray\n');
    const plain = readZip(exportBotZip(memoryDir), LIMITS).map((entry) => entry.path);
    expect(plain).not.toContain(BOT_ZIP_HISTORY_PATH);
  });

  it('refuses a zip whose history is damaged and creates nothing', async () => {
    const root = tempRoot();
    const registry = registryAt(root);
    const archive = writeZip([
      { path: 'SOUL.md', data: Buffer.from('# Soul\n') },
      { path: BOT_ZIP_HISTORY_PATH, data: Buffer.from('# v2 git bundle\nnot really\n') },
    ]);
    const response = await httpFor(registry)(importRequest(archive));
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe('invalid-zip');
    expect(registry.list()).toEqual([]);
    expect(
      readdirSync(join(root, 'bots')).filter((name) => !name.startsWith('botharness')),
    ).toEqual([]);
  });
});
