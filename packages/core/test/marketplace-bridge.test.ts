import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAttachmentStore } from '../src/attachments/store.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { solveChallenge } from '../src/marketplace/altcha.js';
import {
  createMarketplaceClient,
  parseMarketplacePage,
  type MarketplaceClient,
} from '../src/marketplace/client.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createMarket, fakeRepository, submit } from '../../market/test/market-harness.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function methodsWith(marketplace?: MarketplaceClient, warn?: (message: string) => void) {
  const root = mkdtempSync(join(tmpdir(), 'botharness-marketplace-'));
  roots.push(root);
  const registry = createTestRegistry({ rootDir: root });
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  return createBridgeMethods({
    registry,
    states: createBotStateTracker(),
    channels: createChannelStore({ rootDir: join(root, 'channels'), attachments }),
    ownership: createTestOwnership(),
    roster: createTestRosterStore(),
    ...(warn === undefined ? {} : { warn }),
    ...(marketplace === undefined ? {} : { marketplace }),
  });
}

function marketClient(market: ReturnType<typeof createMarket>): MarketplaceClient {
  return createMarketplaceClient({
    baseUrl: 'https://market.test/',
    fetchImpl: (input, init) =>
      market.request(
        new URL(
          typeof input === 'string' ? input : input instanceof URL ? input : input.url,
        ).href.replace('https://market.test', ''),
        init,
      ),
  });
}

type Methods = ReturnType<typeof methodsWith>;

async function solved(methods: Methods): Promise<string> {
  const challenge = await methods.marketplaceChallenge();
  if (!challenge.ok) throw new Error(challenge.error.code);
  const payload = await solveChallenge(challenge.value);
  if (payload === undefined) throw new Error('unsolved challenge');
  return payload;
}

async function submitThrough(methods: Methods, url: string) {
  return methods.marketplaceSubmit({ url, altcha: await solved(methods) });
}

describe('Bot Marketplace bridge', () => {
  it('submits a pasted repository and lists it through the Marketplace Worker', async () => {
    const market = createMarket();
    market.publish(fakeRepository());
    const methods = methodsWith(marketClient(market));

    const submitted = await submitThrough(methods, ' https://github.com/alice/helper-bot ');
    const listed = await methods.marketplaceList({});

    expect(submitted).toMatchObject({ ok: true, value: { bot: { fullName: 'alice/helper-bot' } } });
    expect(listed).toMatchObject({
      ok: true,
      value: {
        bots: [
          {
            fullName: 'alice/helper-bot',
            cloneUrl: 'https://github.com/alice/helper-bot.git',
            headCommit: { sha: 'abcdef1234567890abcdef1234567890abcdef12' },
          },
        ],
      },
    });
  });

  it('forwards the Worker cursor for the next page', async () => {
    const market = createMarket();
    for (const name of ['one', 'two']) {
      const repository = fakeRepository({ name });
      market.publish(repository);
      await submit(market, repository.htmlUrl);
    }
    const first = (await (await market.request('/v1/bots?limit=1')).json()) as {
      nextCursor: string;
    };

    const page = await methodsWith(marketClient(market)).marketplaceList({
      cursor: first.nextCursor,
    });

    expect(page).toMatchObject({ ok: true, value: { bots: [{ fullName: 'alice/one' }] } });
  });

  it('passes sort, search and topic through and lists topic counts', async () => {
    const market = createMarket();
    const methods = methodsWith(marketClient(market));
    for (const repository of [
      fakeRepository({
        name: 'reader',
        stars: 40,
        topics: ['botharness-bot', 'research'],
        createdAt: '2025-01-01T00:00:00Z',
      }),
      fakeRepository({
        name: 'writer',
        stars: 5,
        description: 'Drafts essays',
        createdAt: '2026-06-01T00:00:00Z',
      }),
    ]) {
      market.publish(repository);
      await submitThrough(methods, repository.htmlUrl);
    }

    expect(await methods.marketplaceList({ sort: 'stars' })).toMatchObject({
      ok: true,
      value: { bots: [{ fullName: 'alice/reader' }, { fullName: 'alice/writer' }] },
    });
    expect(await methods.marketplaceList({ sort: 'created' })).toMatchObject({
      ok: true,
      value: {
        bots: [
          { fullName: 'alice/writer', createdAt: '2026-06-01T00:00:00Z' },
          { fullName: 'alice/reader', createdAt: '2025-01-01T00:00:00Z' },
        ],
      },
    });
    expect(await methods.marketplaceList({ sort: 'newest' })).toMatchObject({ ok: false });
    expect(await methods.marketplaceList({ q: ' essays ' })).toMatchObject({
      ok: true,
      value: { bots: [{ fullName: 'alice/writer' }] },
    });
    expect(await methods.marketplaceList({ topic: 'research' })).toMatchObject({
      ok: true,
      value: { bots: [{ fullName: 'alice/reader' }] },
    });
    expect(await methods.marketplaceTopics()).toEqual({
      ok: true,
      value: [
        { topic: 'research', count: 1 },
        { topic: 'writing', count: 1 },
      ],
    });
  });

  it('loads a listed entry detail with its prepared README', async () => {
    const market = createMarket();
    const repository = fakeRepository({ readme: '![shot](shot.png)' });
    market.publish(repository);
    const methods = methodsWith(marketClient(market));
    await submitThrough(methods, repository.htmlUrl);

    expect(await methods.marketplaceDetail({ id: repository.nodeId })).toEqual({
      ok: true,
      value: {
        bot: expect.objectContaining({ fullName: 'alice/helper-bot' }),
        readme: `![shot](<https://raw.githubusercontent.com/alice/helper-bot/${repository.head?.sha}/shot.png>)`,
        readmeLanguage: null,
        commitSha: repository.head?.sha,
      },
    });
    expect(await methods.marketplaceDetail({ id: 'R_missing' })).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(await methods.marketplaceDetail({ id: ' ' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('asks the Worker for listings and READMEs in the reader’s language', async () => {
    const market = createMarket();
    const repository = fakeRepository({
      readme: '# Orion',
      files: { 'README.zh-CN.md': '# 猎户' },
      descriptor: JSON.stringify({
        name: 'Orion',
        bio: 'Tells you what is in tonight’s sky.',
        i18n: { zh: { name: '猎户', bio: '告诉你今晚能看到什么。' } },
      }),
    });
    market.publish(repository);
    const methods = methodsWith(marketClient(market));
    await submitThrough(methods, repository.htmlUrl);

    expect(await methods.marketplaceList({ lang: 'zh' })).toMatchObject({
      ok: true,
      value: {
        bots: [
          {
            displayName: '猎户',
            description: '告诉你今晚能看到什么。',
            descriptionGenerated: false,
          },
        ],
      },
    });
    expect(await methods.marketplaceList({})).toMatchObject({
      value: {
        bots: [{ displayName: 'Orion', description: 'Tells you what is in tonight’s sky.' }],
      },
    });
    expect(await methods.marketplaceDetail({ id: repository.nodeId, lang: 'zh' })).toMatchObject({
      ok: true,
      value: { readme: '# 猎户', readmeLanguage: 'zh' },
    });
    expect(await methods.marketplaceDetail({ id: repository.nodeId, lang: 'en' })).toMatchObject({
      value: { readme: '# Orion', readmeLanguage: null },
    });
    for (const call of [
      methods.marketplaceList({ lang: 'fr' }),
      methods.marketplaceDetail({ id: repository.nodeId, lang: 'zh-CN' }),
    ]) {
      expect(await call).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    }
  });

  it('forwards a solved challenge with a report and the Worker challenge refusals', async () => {
    const market = createMarket({ env: { REPORT_THRESHOLD: '1' } });
    const repository = fakeRepository();
    market.publish(repository);
    const methods = methodsWith(marketClient(market));
    await submitThrough(methods, repository.htmlUrl);

    const altcha = await solved(methods);
    expect(
      await methods.marketplaceReport({ id: repository.nodeId, altcha, reason: ' Spam ' }),
    ).toEqual({ ok: true, value: { received: true } });
    expect(market.sqlite.prepare('SELECT reason FROM reports').all()).toEqual([{ reason: 'Spam' }]);
    expect(await methods.marketplaceReport({ id: repository.nodeId, altcha })).toMatchObject({
      ok: false,
      error: { code: 'challenge-replayed' },
    });
    expect(
      await methods.marketplaceSubmit({ url: repository.htmlUrl, altcha: 'forged' }),
    ).toMatchObject({ ok: false, error: { code: 'challenge-invalid' } });
  });

  it('returns the Worker refusal code and logs a structured line', async () => {
    const market = createMarket();
    market.publish(fakeRepository({ topics: [] }));
    const warn = vi.fn();
    const methods = methodsWith(marketClient(market), warn);

    const result = await submitThrough(methods, 'https://github.com/alice/helper-bot');

    expect(result).toMatchObject({ ok: false, error: { code: 'repository-missing-topic' } });
    expect(JSON.parse(warn.mock.calls[0]?.[0] as string)).toEqual({
      module: 'marketplace',
      initiator: 'client',
      phase: 'request-refused',
      reason: 'repository-missing-topic',
    });
  });

  it('maps an unreachable Worker to marketplace-unavailable', async () => {
    const methods = methodsWith(
      createMarketplaceClient({
        baseUrl: 'https://market.test',
        fetchImpl: () => Promise.reject(new TypeError('fetch failed')),
      }),
    );

    expect(await methods.marketplaceList({})).toMatchObject({
      ok: false,
      error: { code: 'marketplace-unavailable' },
    });
  });

  it('refuses invalid input and a Host without a Marketplace client', async () => {
    expect(await methodsWith(undefined).marketplaceList({})).toMatchObject({
      ok: false,
      error: { code: 'marketplace-unavailable' },
    });
    const methods = methodsWith(marketClient(createMarket()));
    for (const payload of [
      { url: ' ', altcha: 'x' },
      { url: 'https://github.com/alice/helper-bot' },
    ]) {
      expect(await methods.marketplaceSubmit(payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    for (const payload of [{ altcha: 'x' }, { id: 'R_x' }, { id: 'R_x', altcha: 'x', reason: 1 }]) {
      expect(await methods.marketplaceReport(payload)).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
    }
    expect(await methods.marketplaceList({ cursor: 3 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await methods.marketplaceList({ sort: 'random' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});

describe('Marketplace banner', () => {
  it('reads a known scene or a raw GitHub image and drops anything else', () => {
    const base = {
      id: 'R_1',
      owner: 'alice',
      name: 'bot',
      fullName: 'alice/bot',
      pushedAt: '2026-10-01T00:00:00Z',
      htmlUrl: 'https://github.com/alice/bot',
      cloneUrl: 'https://github.com/alice/bot.git',
      defaultBranch: 'main',
      description: null,
      stars: 0,
      topics: [],
    };
    const banners = [
      { recipe: { scene: 'sea', seed: 3 } },
      { image: 'https://raw.githubusercontent.com/alice/bot/abc/.botharness/banner.png' },
      { recipe: { scene: 'mars', seed: 3 } },
      { image: 'https://tracker.example/pixel.png' },
      undefined,
    ].map((banner) => parseMarketplacePage({ bots: [{ ...base, banner }] })?.bots[0]?.banner);
    expect(banners).toEqual([
      { recipe: { scene: 'sea', seed: 3 } },
      { image: 'https://raw.githubusercontent.com/alice/bot/abc/.botharness/banner.png' },
      null,
      null,
      null,
    ]);
  });
});
