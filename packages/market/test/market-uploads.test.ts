import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  MAX_BOTS_PER_ACCOUNT,
  MAX_REPLACEMENTS_PER_HOUR,
  MAX_UPLOAD_FILE_BYTES,
} from '../src/upload-files.js';
import { createMarket, fakeRepository, submit } from './market-harness.js';

type Market = ReturnType<typeof createMarket>;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function bytesOf(content: string | Uint8Array): Uint8Array<ArrayBuffer> {
  return typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
}

function call(market: Market, method: string, path: string, token?: string, body?: unknown) {
  return market.request(path, {
    method,
    headers: {
      ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

function manifest(files: Record<string, string | Uint8Array>) {
  return Object.entries(files).map(([path, content]) => {
    const bytes = bytesOf(content);
    return {
      path,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
}

async function becomeAuthor(market: Market, token = 'token-alice', displayName = 'Alice') {
  return call(market, 'PUT', '/v1/me', token, { displayName, acceptTerms: true });
}

function filePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function upload(
  market: Market,
  files: Record<string, string | Uint8Array>,
  options: {
    token?: string;
    displayName?: string;
    bio?: string;
    tags?: string[];
    replaces?: string;
  } = {},
) {
  const token = options.token ?? 'token-alice';
  const begun = await call(market, 'POST', '/v1/uploads', token, {
    ...(options.replaces === undefined ? {} : { replaces: options.replaces }),
    displayName: options.displayName ?? 'Helper',
    bio: options.bio ?? 'Writes things down',
    tags: options.tags ?? ['writing'],
    files: manifest(files),
  });
  if (begun.status !== 201) return begun;
  const { upload: started } = (await begun.json()) as { upload: { id: string; botId: string } };
  for (const [path, content] of Object.entries(files)) {
    const put = await market.request(`/v1/uploads/${started.id}/files/${filePath(path)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}` },
      body: bytesOf(content),
    });
    expect(put.status).toBe(204);
  }
  return call(market, 'POST', `/v1/uploads/${started.id}/publish`, token);
}

const BOT_FILES = {
  'SOUL.md': '# Helper\nI help.',
  'README.md': '# Helper\n![avatar](.botharness/avatar.png) [notes](notes/today.md)',
  'notes/today.md': 'Today I wrote.',
  'tools/run.sh': 'echo hi',
  '.botharness/bot.json': JSON.stringify({
    name: 'Helper',
    avatar: { image: '.botharness/avatar.png' },
    banner: { recipe: { scene: 'meadow', seed: 7 } },
  }),
  '.botharness/avatar.png': PNG,
};

describe('Uploaded Bot authors', () => {
  it('requires a Connect token', async () => {
    const market = createMarket();
    expect((await call(market, 'GET', '/v1/me')).status).toBe(401);
    expect((await call(market, 'GET', '/v1/me', 'not-a-token')).status).toBe(401);
  });

  it('answers uploads-unavailable without storage', async () => {
    const market = createMarket({ env: { MARKET_FILES: undefined } });
    const response = await call(market, 'GET', '/v1/me', 'token-alice');
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: 'uploads-unavailable' } });
  });

  it('creates an author once terms are accepted and keeps the Author ID on rename', async () => {
    const market = createMarket();
    expect(await (await call(market, 'GET', '/v1/me', 'token-alice')).json()).toEqual({
      author: null,
    });
    const refused = await call(market, 'PUT', '/v1/me', 'token-alice', { displayName: 'Alice' });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toEqual({ error: { code: 'terms-required' } });

    const created = (await (await becomeAuthor(market, 'token-alice', '爱丽丝')).json()) as {
      author: { id: string; name: string; termsAcceptedAt: string };
    };
    expect(created.author).toEqual({
      id: expect.stringMatching(/^[2-9a-z]{6}$/u),
      name: '爱丽丝',
      termsAcceptedAt: '2026-10-05T12:00:00.000Z',
    });
    const renamed = (await (
      await call(market, 'PUT', '/v1/me', 'token-alice', { displayName: 'Alice' })
    ).json()) as { author: { id: string; name: string } };
    expect(renamed.author).toMatchObject({ id: created.author.id, name: 'Alice' });

    const twin = (await (await becomeAuthor(market, 'token-bob', 'Alice')).json()) as {
      author: { id: string };
    };
    expect(twin.author.id).not.toBe(created.author.id);
  });

  it('refuses an empty or overlong display name', async () => {
    const market = createMarket();
    for (const displayName of ['', '   ', 'x'.repeat(41)]) {
      const response = await call(market, 'PUT', '/v1/me', 'token-alice', {
        displayName,
        acceptTerms: true,
      });
      expect(await response.json()).toEqual({ error: { code: 'invalid-author-name' } });
    }
  });
});

describe('Uploading a Bot', () => {
  it('needs an author first', async () => {
    const market = createMarket();
    const response = await upload(market, { 'SOUL.md': 'hi' });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: 'author-required' } });
  });

  it('lists the Bot with its author, keeps it out of default listings and shows its file tree', async () => {
    const market = createMarket();
    market.publish(fakeRepository());
    expect((await submit(market, 'https://github.com/alice/helper-bot')).status).toBe(201);
    const author = (await (await becomeAuthor(market)).json()) as { author: { id: string } };
    const published = await upload(market, BOT_FILES);
    expect(published.status).toBe(201);
    const { bot } = (await published.json()) as { bot: Record<string, unknown> };
    expect(bot).toMatchObject({
      id: expect.stringMatching(/^U_/u),
      owner: 'Alice',
      name: 'Helper',
      displayName: 'Helper',
      bio: 'Writes things down',
      tags: ['writing'],
      source: 'upload',
      author: { name: 'Alice', id: author.author.id },
      banner: { recipe: { scene: 'meadow', seed: 7 } },
      cloneUrl: '',
      stars: 0,
      headCommit: null,
    });
    expect(bot['avatar']).toEqual({
      image: `${bot['htmlUrl'] as string}/files/.botharness/avatar.png`,
    });

    const defaults = (await (await market.request('/v1/bots')).json()) as {
      bots: Array<{ id: string; source: string; author: unknown }>;
    };
    expect(defaults.bots.map((entry) => [entry.source, entry.author])).toEqual([['github', null]]);
    const all = (await (await market.request('/v1/bots?include=uploads')).json()) as {
      bots: Array<{ id: string }>;
    };
    expect(all.bots.map((entry) => entry.id)).toEqual([bot['id'], 'R_alice_helper-bot']);
    const searched = (await (await market.request('/v1/bots?include=uploads&q=Helper')).json()) as {
      bots: Array<{ id: string }>;
    };
    expect(searched.bots.map((entry) => entry.id)).toContain(bot['id']);

    const detail = (await (await market.request(`/v1/bots/${String(bot['id'])}`)).json()) as Record<
      string,
      unknown
    >;
    expect(detail['files']).toEqual([
      { path: '.botharness/avatar.png', size: PNG.byteLength, kind: 'image' },
      { path: '.botharness/bot.json', size: expect.any(Number), kind: 'text' },
      { path: 'README.md', size: expect.any(Number), kind: 'text' },
      { path: 'SOUL.md', size: expect.any(Number), kind: 'text' },
      { path: 'notes/today.md', size: expect.any(Number), kind: 'text' },
      { path: 'tools/run.sh', size: expect.any(Number), kind: 'script' },
    ]);
    const base = `https://market.test/v1/bots/${String(bot['id'])}/files`;
    expect(detail['readme']).toBe(
      `# Helper\n![avatar](<${base}/.botharness/avatar.png>) [notes](<${base}/notes/today.md>)`,
    );
  });

  it('serves listed files, text always as plain text', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const { bot } = (await (await upload(market, BOT_FILES)).json()) as { bot: { id: string } };
    const text = await market.request(`/v1/bots/${bot.id}/files/notes/today.md`);
    expect(text.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(text.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await text.text()).toBe('Today I wrote.');
    const image = await market.request(`/v1/bots/${bot.id}/files/.botharness/avatar.png`);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
    expect((await market.request(`/v1/bots/${bot.id}/files/missing.md`)).status).toBe(404);
  });

  it('enforces the allowlist and size limits with coded refusals', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const begin = async (files: unknown[]) =>
      (await (
        await call(market, 'POST', '/v1/uploads', 'token-alice', {
          displayName: 'Helper',
          files,
        })
      ).json()) as { error?: { code: string; path?: string }; upload?: unknown };
    const file = (path: string, size = 1) => ({ path, size, sha256: 'a'.repeat(64) });

    expect((await begin([file('tool.exe')])).error).toEqual({
      code: 'file-type-refused',
      path: 'tool.exe',
    });
    expect((await begin([file('backup.zip')])).error?.code).toBe('file-type-refused');
    expect((await begin([file('../escape.md')])).error?.code).toBe('invalid-path');
    expect((await begin([file('.git/config.md')])).error?.code).toBe('invalid-path');
    expect((await begin([file('a.md'), file('a.md')])).error?.code).toBe('duplicate-path');
    expect((await begin([file('big.md', MAX_UPLOAD_FILE_BYTES + 1)])).error?.code).toBe(
      'file-too-large',
    );
    expect(
      (await begin(Array.from({ length: 2001 }, (_, index) => file(`n${index}.md`)))).error?.code,
    ).toBe('too-many-files');
    expect(
      (await begin(Array.from({ length: 11 }, (_, index) => file(`n${index}.md`, 5 * 1024 * 1024))))
        .error?.code,
    ).toBe('too-large');
    expect((await begin([file('LICENSE'), file('Makefile'), file('a.py')])).upload).toBeDefined();
  });

  it('refuses a file whose bytes do not match its manifest or type', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const begun = (await (
      await call(market, 'POST', '/v1/uploads', 'token-alice', {
        displayName: 'Helper',
        files: manifest({ 'a.md': 'hello', 'b.png': 'not a png' }),
      })
    ).json()) as { upload: { id: string } };
    const put = (path: string, body: string) =>
      market.request(`/v1/uploads/${begun.upload.id}/files/${path}`, {
        method: 'PUT',
        headers: { authorization: 'Bearer token-alice' },
        body,
      });
    expect(await (await put('a.md', 'HELLO')).json()).toEqual({
      error: { code: 'file-mismatch', path: 'a.md' },
    });
    expect((await put('b.png', 'not a png')).status).toBe(422);
    expect((await put('c.md', 'x')).status).toBe(404);
    expect((await put('a.md', 'hello')).status).toBe(204);
    const publish = await call(
      market,
      'POST',
      `/v1/uploads/${begun.upload.id}/publish`,
      'token-alice',
    );
    expect(await publish.json()).toEqual({ error: { code: 'files-missing', path: 'b.png' } });
    expect(
      (await call(market, 'POST', `/v1/uploads/${begun.upload.id}/publish`, 'token-bob')).status,
    ).toBe(404);
  });

  it('caps Bots per account', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    for (let index = 0; index < MAX_BOTS_PER_ACCOUNT; index += 1) {
      expect((await upload(market, { 'SOUL.md': `bot ${index}` })).status).toBe(201);
    }
    const refused = await upload(market, { 'SOUL.md': 'one more' });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: { code: 'bot-limit' } });
  });

  it('can be blocked and restored like an indexed repository', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const { bot } = (await (await upload(market, BOT_FILES)).json()) as { bot: { id: string } };
    const admin = (action: string) =>
      market.request('/v1/admin/blocklist', {
        method: 'POST',
        headers: { authorization: 'Bearer test-admin-token' },
        body: JSON.stringify({ id: bot.id, action }),
      });
    expect((await admin('block')).status).toBe(200);
    expect((await market.request(`/v1/bots/${bot.id}`)).status).toBe(404);
    expect((await market.request(`/v1/bots/${bot.id}/files/SOUL.md`)).status).toBe(404);
    const restored = (await (await admin('restore')).json()) as { bot: { visibility: string } };
    expect(restored.bot.visibility).toBe('listed');
  });

  it('keeps uploads out of the GitHub refresh', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const { bot } = (await (await upload(market, BOT_FILES)).json()) as { bot: { id: string } };
    await market.scheduled('17 * * * *');
    expect((await market.request(`/v1/bots/${bot.id}`)).status).toBe(200);
    expect(market.github.nodeBatches).toEqual([]);
  });

  it('follows the author display name', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const { bot } = (await (await upload(market, BOT_FILES)).json()) as { bot: { id: string } };
    await call(market, 'PUT', '/v1/me', 'token-alice', { displayName: 'Alicia' });
    const detail = (await (await market.request(`/v1/bots/${bot.id}`)).json()) as {
      bot: { owner: string; author: { name: string } };
    };
    expect(detail.bot.owner).toBe('Alicia');
    expect(detail.bot.author.name).toBe('Alicia');
  });
});

describe('My uploads', () => {
  const mine = async (market: Market, token = 'token-alice') =>
    (
      (await (await call(market, 'GET', '/v1/me/bots', token)).json()) as {
        bots: Array<{
          bot: { id: string; displayName: string; pushedAt: string };
          files: number;
          bytes: number;
          blocked: boolean;
        }>;
      }
    ).bots;

  it("lists only the author's own Uploaded Bots, newest first", async () => {
    const market = createMarket();
    await becomeAuthor(market);
    await becomeAuthor(market, 'token-bob', 'Bob');
    const first = (await (await upload(market, { 'SOUL.md': 'one' })).json()) as {
      bot: { id: string };
    };
    market.clock.value = new Date('2026-10-05T13:00:00Z');
    const second = (await (await upload(market, BOT_FILES, { displayName: 'Second' })).json()) as {
      bot: { id: string };
    };
    await upload(market, { 'SOUL.md': 'bob' }, { token: 'token-bob' });
    const listed = await mine(market);
    expect(listed.map((entry) => entry.bot.id)).toEqual([second.bot.id, first.bot.id]);
    expect(listed[1]).toMatchObject({ files: 1, bytes: 3, blocked: false });
    expect((await call(market, 'GET', '/v1/me/bots')).status).toBe(401);
  });

  it('replaces all files at once, keeping the listing id and dropping the old set', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const { bot } = (await (await upload(market, BOT_FILES)).json()) as {
      bot: { id: string; pushedAt: string };
    };
    market.clock.value = new Date('2026-10-06T08:00:00Z');
    const begun = (await (
      await call(market, 'POST', '/v1/uploads', 'token-alice', {
        replaces: bot.id,
        displayName: 'Helper 2',
        files: manifest({ 'SOUL.md': 'new soul', 'notes/new.md': 'fresh' }),
      })
    ).json()) as { upload: { id: string; botId: string } };
    expect(begun.upload.botId).toBe(bot.id);
    await market.request(`/v1/uploads/${begun.upload.id}/files/SOUL.md`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-alice' },
      body: 'new soul',
    });
    expect(await (await market.request(`/v1/bots/${bot.id}/files/notes/today.md`)).text()).toBe(
      'Today I wrote.',
    );
    await market.request(`/v1/uploads/${begun.upload.id}/files/notes/new.md`, {
      method: 'PUT',
      headers: { authorization: 'Bearer token-alice' },
      body: 'fresh',
    });
    const published = await call(
      market,
      'POST',
      `/v1/uploads/${begun.upload.id}/publish`,
      'token-alice',
    );
    expect(published.status).toBe(201);
    const detail = (await (await market.request(`/v1/bots/${bot.id}`)).json()) as {
      bot: { id: string; displayName: string; pushedAt: string; avatar: unknown };
      files: Array<{ path: string }>;
    };
    expect(detail.bot).toMatchObject({
      id: bot.id,
      displayName: 'Helper 2',
      pushedAt: '2026-10-06T08:00:00.000Z',
      avatar: null,
    });
    expect(detail.files.map((file) => file.path)).toEqual(['SOUL.md', 'notes/new.md']);
    expect(await (await market.request(`/v1/bots/${bot.id}/files/SOUL.md`)).text()).toBe(
      'new soul',
    );
    expect((await market.request(`/v1/bots/${bot.id}/files/notes/today.md`)).status).toBe(404);
    expect([...market.bucket.objects.keys()].some((key) => key.startsWith(`bots/${bot.id}/`))).toBe(
      false,
    );
    expect(await mine(market)).toHaveLength(1);
  });

  it("refuses to replace someone else's Bot and caps replacements per hour", async () => {
    const market = createMarket();
    await becomeAuthor(market);
    await becomeAuthor(market, 'token-bob', 'Bob');
    const { bot } = (await (await upload(market, { 'SOUL.md': 'v0' })).json()) as {
      bot: { id: string };
    };
    const stolen = await upload(
      market,
      { 'SOUL.md': 'mine now' },
      {
        token: 'token-bob',
        replaces: bot.id,
      },
    );
    expect(await stolen.json()).toEqual({ error: { code: 'bot-not-found' } });
    for (let index = 1; index <= MAX_REPLACEMENTS_PER_HOUR; index += 1)
      expect((await upload(market, { 'SOUL.md': `v${index}` }, { replaces: bot.id })).status).toBe(
        201,
      );
    const limited = await upload(market, { 'SOUL.md': 'too soon' }, { replaces: bot.id });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: { code: 'replace-limit' } });
    market.clock.value = new Date(market.clock.value.getTime() + 61 * 60 * 1000);
    expect((await upload(market, { 'SOUL.md': 'later' }, { replaces: bot.id })).status).toBe(201);
  });

  it('does not count a replacement against the Bot limit', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    let last = '';
    for (let index = 0; index < MAX_BOTS_PER_ACCOUNT; index += 1) {
      const published = (await (await upload(market, { 'SOUL.md': `bot ${index}` })).json()) as {
        bot: { id: string };
      };
      last = published.bot.id;
    }
    expect((await upload(market, { 'SOUL.md': 'again' }, { replaces: last })).status).toBe(201);
  });

  it('deletes a Bot with its files, row and reports', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    const { bot } = (await (await upload(market, BOT_FILES)).json()) as { bot: { id: string } };
    expect((await call(market, 'DELETE', `/v1/me/bots/${bot.id}`, 'token-bob')).status).toBe(404);
    const deleted = await call(market, 'DELETE', `/v1/me/bots/${bot.id}`, 'token-alice');
    expect(await deleted.json()).toEqual({ deleted: true });
    expect((await market.request(`/v1/bots/${bot.id}`)).status).toBe(404);
    expect(market.bucket.objects.size).toBe(0);
    expect(market.sqlite.prepare('SELECT count(*) AS n FROM uploaded_files').get()).toEqual({
      n: 0,
    });
    expect(await mine(market)).toEqual([]);
    expect((await call(market, 'DELETE', `/v1/me/bots/${bot.id}`, 'token-alice')).status).toBe(404);
  });

  it('erases everything of an account on DELETE /v1/me', async () => {
    const market = createMarket();
    await becomeAuthor(market);
    await becomeAuthor(market, 'token-bob', 'Bob');
    await upload(market, BOT_FILES);
    await upload(market, { 'SOUL.md': 'two' });
    await call(market, 'POST', '/v1/uploads', 'token-alice', {
      displayName: 'Pending',
      files: manifest({ 'SOUL.md': 'pending' }),
    });
    const bob = (await (
      await upload(market, { 'SOUL.md': 'bob' }, { token: 'token-bob' })
    ).json()) as {
      bot: { id: string };
    };
    expect(await (await call(market, 'DELETE', '/v1/me', 'token-alice')).json()).toEqual({
      deleted: true,
    });
    expect(await (await call(market, 'GET', '/v1/me', 'token-alice')).json()).toEqual({
      author: null,
    });
    expect(await mine(market)).toEqual([]);
    expect(market.sqlite.prepare('SELECT count(*) AS n FROM uploads').get()).toEqual({ n: 0 });
    expect(
      [...market.bucket.objects.keys()].every((key) => key.startsWith(`bots/${bob.bot.id}/`)),
    ).toBe(true);
    expect((await market.request(`/v1/bots/${bob.bot.id}`)).status).toBe(200);
  });
});
