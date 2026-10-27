import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createMarketplaceClient, type MarketplaceClient } from '../src/marketplace/client.js';
import { createMarketplaceUploads, planUpload } from '../src/marketplace/uploaded-bots.js';
import { createCore } from '../src/plugin.js';
import { createMarket } from '../../market/test/market-harness.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function marketClient(market: ReturnType<typeof createMarket>): MarketplaceClient {
  return createMarketplaceClient({
    baseUrl: 'https://market.test',
    fetchImpl: (input, init) =>
      market.request(
        new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
        ).href.replace('https://market.test', ''),
        init,
      ),
  });
}

function fixture() {
  const core = createCore({
    dshHome: createTempRoot('marketplace-uploads-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const market = createMarket();
  const client = marketClient(market);
  const session = {
    state: 'signed-out',
    tokens: ['token-alice'] as string[],
    fresh: 0,
  };
  const account = {
    status: () => ({ state: session.state, email: 'alice@example.com' }),
    accessToken: (options?: { fresh?: boolean }) => {
      if (options?.fresh === true) session.fresh += 1;
      return Promise.resolve(
        options?.fresh === true ? 'token-alice' : (session.tokens.shift() ?? 'token-alice'),
      );
    },
  };
  const receipts: string[] = [];
  const bridge = createBridgeMethods({
    ...core,
    marketplace: client,
    marketplaceReceipts: {
      send: (listingId) => {
        receipts.push(listingId);
        return Promise.resolve();
      },
    },
    marketplaceUploads: createMarketplaceUploads({
      client,
      account: () => account,
      memoryDir: (slug) =>
        core.registry.get(slug) === undefined ? undefined : core.registry.memoryDirFor(slug),
    }),
  });
  return { core, bridge, market, session, receipts };
}

function write(root: string, path: string, data: string | Buffer) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), data);
}

function sourceBot(f: ReturnType<typeof fixture>) {
  const created = f.bridge.create({ displayName: 'Helper', operationKey: 'create-helper-01' });
  if (!created.ok) throw new Error(created.error.code);
  const slug = created.value.bot.slug;
  const memory = f.core.registry.memoryDirFor(slug)!;
  write(memory, 'notes/today.md', 'Today I wrote.');
  write(memory, 'tools/run.sh', 'echo hi');
  write(memory, 'tools/helper.exe', Buffer.from([0x4d, 0x5a, 0, 0]));
  write(memory, '.botharness/avatar.png', PNG);
  write(
    memory,
    '.botharness/bot.json',
    JSON.stringify({ name: 'Helper', avatar: { image: '.botharness/avatar.png' } }),
  );
  return { slug, memory };
}

it('plans an upload from the Bot files, skipping types the Marketplace refuses', () => {
  const f = fixture();
  const { memory } = sourceBot(f);
  const plan = planUpload(memory);
  expect(plan.skipped).toEqual([{ path: 'tools/helper.exe', reason: 'file-type-refused' }]);
  expect(plan.files.map((file) => [file.path, file.kind])).toEqual(
    expect.arrayContaining([
      ['notes/today.md', 'text'],
      ['tools/run.sh', 'script'],
      ['.botharness/avatar.png', 'image'],
    ]),
  );
});

it('needs a Connect sign-in and an author before uploading', async () => {
  const f = fixture();
  const { slug } = sourceBot(f);
  expect(await f.bridge.marketplaceAccount()).toEqual({
    ok: true,
    value: { signedIn: false, author: null },
  });
  expect(await f.bridge.marketplaceUpload({ slug, displayName: 'Helper' })).toMatchObject({
    ok: false,
    error: { code: 'sign-in-required' },
  });
  f.session.state = 'signed-in';
  expect(await f.bridge.marketplaceAccount()).toEqual({
    ok: true,
    value: { signedIn: true, email: 'alice@example.com', author: null },
  });
  expect(await f.bridge.marketplaceUpload({ slug, displayName: 'Helper' })).toMatchObject({
    ok: false,
    error: { code: 'author-required' },
  });
  expect(
    await f.bridge.marketplaceAuthorSave({ displayName: 'Alice', acceptTerms: false }),
  ).toMatchObject({ ok: false, error: { code: 'terms-required' } });
  expect(
    await f.bridge.marketplaceAuthorSave({ displayName: 'Alice', acceptTerms: true }),
  ).toMatchObject({ ok: true, value: { name: 'Alice', id: expect.any(String) } });
});

it('uploads a Bot, retries an expired token once, and installs it as a fresh Bot with one commit', async () => {
  const f = fixture();
  const { slug, memory } = sourceBot(f);
  f.session.state = 'signed-in';
  await f.bridge.marketplaceAuthorSave({ displayName: 'Alice', acceptTerms: true });
  f.session.tokens = ['token-expired!'];
  const uploaded = await f.bridge.marketplaceUpload({
    slug,
    displayName: 'Helper',
    bio: 'Writes things down',
    tags: ['writing'],
  });
  if (!uploaded.ok) throw new Error(uploaded.error.message);
  expect(f.session.fresh).toBe(1);
  expect(uploaded.value.skipped).toEqual([
    { path: 'tools/helper.exe', reason: 'file-type-refused' },
  ]);
  expect(uploaded.value.bot).toMatchObject({
    source: 'upload',
    author: { name: 'Alice' },
    displayName: 'Helper',
  });
  expect(uploaded.value.bot.avatar).toEqual({
    image: `https://market.test/v1/bots/${uploaded.value.bot.id}/files/.botharness/avatar.png`,
  });

  const listed = await f.bridge.marketplaceList({ includeUploads: true });
  expect(listed.ok && listed.value.bots.map((bot) => bot.id)).toEqual([uploaded.value.bot.id]);
  const plain = await f.bridge.marketplaceList({});
  expect(plain.ok && plain.value.bots).toEqual([]);

  const installed = await f.bridge.marketplaceInstall({
    id: uploaded.value.bot.id,
    operationKey: 'install-helper-01',
  });
  if (!installed.ok) throw new Error(installed.error.message);
  expect(f.receipts).toEqual([uploaded.value.bot.id]);
  expect(installed.value.bot).toMatchObject({
    displayName: 'Helper',
    description: 'Writes things down',
    roles: ['writing'],
  });
  expect(installed.value.bot.slug).not.toBe(slug);
  expect(f.core.registry.get(installed.value.bot.slug)?.avatar).toBe(
    `data:image/png;base64,${PNG.toString('base64')}`,
  );
  const copy = f.core.registry.memoryDirFor(installed.value.bot.slug)!;
  expect(copy).not.toBe(memory);
  expect(readFileSync(join(copy, 'notes/today.md'), 'utf8')).toBe('Today I wrote.');
  expect(readFileSync(join(copy, 'tools/run.sh'), 'utf8')).toBe('echo hi');
  const commits = execFileSync('git', ['rev-list', '--count', 'HEAD'], {
    cwd: copy,
    encoding: 'utf8',
  });
  expect(commits.trim()).toBe('1');

  const again = await f.bridge.marketplaceInstall({
    id: uploaded.value.bot.id,
    operationKey: 'install-helper-01',
  });
  expect(again.ok && again.value.bot.slug).toBe(installed.value.bot.slug);
});

it('refuses a listing that is gone and sends no Install Receipt', async () => {
  const f = fixture();
  expect(await f.bridge.marketplaceInstall({ id: 'R_missing' })).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
  expect(f.receipts).toEqual([]);
});

it('reads an Uploaded Bot file summary and its text files through the Host', async () => {
  const f = fixture();
  const { slug } = sourceBot(f);
  f.session.state = 'signed-in';
  await f.bridge.marketplaceAuthorSave({ displayName: 'Alice', acceptTerms: true });
  const uploaded = await f.bridge.marketplaceUpload({ slug, displayName: 'Helper' });
  if (!uploaded.ok) throw new Error(uploaded.error.message);
  const id = uploaded.value.bot.id;

  const detail = await f.bridge.marketplaceDetail({ id });
  if (!detail.ok) throw new Error(detail.error.message);
  expect(detail.value.fileSummary).toMatchObject({
    count: detail.value.files?.length,
    types: expect.arrayContaining([
      { type: 'script', count: 1, size: 'echo hi'.length },
      { type: 'image', count: expect.any(Number), size: expect.any(Number) },
    ]),
  });

  expect(await f.bridge.marketplaceFileView({ id, path: 'tools/run.sh' })).toEqual({
    ok: true,
    value: { path: 'tools/run.sh', size: 7, type: 'script', text: 'echo hi' },
  });
  expect(await f.bridge.marketplaceFileView({ id, path: 'notes/today.md' })).toMatchObject({
    ok: true,
    value: { type: 'markdown', text: 'Today I wrote.' },
  });
  expect(await f.bridge.marketplaceFileView({ id, path: '.botharness/avatar.png' })).toMatchObject({
    ok: false,
    error: { code: 'file-not-text' },
  });
  expect(await f.bridge.marketplaceFileView({ id, path: '' })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
});
