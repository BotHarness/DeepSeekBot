import { describe, expect, it } from 'vitest';
import { SEARCH_RESULT_LIMIT } from '../src/catalog.js';
import {
  admin,
  createMarket,
  fakeRepository,
  report,
  submit,
  type FakeRepository,
} from './market-harness.js';

interface PageBody {
  bots: { fullName: string }[];
  nextCursor?: string;
}

async function seed(
  market: ReturnType<typeof createMarket>,
  repositories: Partial<FakeRepository>[],
): Promise<void> {
  for (const overrides of repositories) {
    const repository = fakeRepository(overrides);
    market.publish(repository);
    expect((await submit(market, repository.htmlUrl)).status).toBe(201);
  }
}

async function page(market: ReturnType<typeof createMarket>, path: string): Promise<PageBody> {
  const response = await market.request(path);
  expect(response.status).toBe(200);
  return (await response.json()) as PageBody;
}

async function walk(market: ReturnType<typeof createMarket>, path: string): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | undefined;
  do {
    const suffix = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const current = await page(market, `${path}${suffix}`);
    seen.push(...current.bots.map((bot) => bot.fullName));
    cursor = current.nextCursor;
  } while (cursor !== undefined);
  return seen;
}

describe('Marketplace Worker sort, search and topics', () => {
  it('sorts by stars with node ID tie-breaks across pages', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'few', stars: 2 },
      { name: 'many', stars: 90 },
      { name: 'tie-a', stars: 10 },
      { name: 'tie-b', stars: 10 },
    ]);

    expect(await walk(market, '/v1/bots?sort=stars&limit=1')).toEqual([
      'alice/many',
      'alice/tie-b',
      'alice/tie-a',
      'alice/few',
    ]);
  });

  it('sorts by GitHub creation time with node ID tie-breaks across pages', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'oldest', createdAt: '2025-03-01T00:00:00Z', pushedAt: '2026-10-09T00:00:00Z' },
      { name: 'newest', createdAt: '2026-09-01T00:00:00Z', pushedAt: '2026-10-01T00:00:00Z' },
      { name: 'tie-a', createdAt: '2026-05-01T00:00:00Z' },
      { name: 'tie-b', createdAt: '2026-05-01T00:00:00Z' },
    ]);

    expect(await walk(market, '/v1/bots?sort=created&limit=1')).toEqual([
      'alice/newest',
      'alice/tie-b',
      'alice/tie-a',
      'alice/oldest',
    ]);
    const first = (await (await market.request('/v1/bots?sort=created&limit=1')).json()) as {
      bots: { createdAt: string }[];
    };
    expect(first.bots[0]?.createdAt).toBe('2026-09-01T00:00:00Z');
  });

  it('refuses a cursor from another sort or mode', async () => {
    const market = createMarket();
    await seed(market, [{ name: 'one' }, { name: 'two' }]);
    const updated = await page(market, '/v1/bots?limit=1');

    const cursor = encodeURIComponent(updated.nextCursor ?? '');
    expect((await market.request(`/v1/bots?sort=stars&cursor=${cursor}`)).status).toBe(400);
    expect((await market.request(`/v1/bots?sort=created&cursor=${cursor}`)).status).toBe(400);
    expect((await market.request(`/v1/bots?q=helpful&cursor=${cursor}`)).status).toBe(400);
  });

  it('ranks a name match above a README-only match', async () => {
    const market = createMarket();
    await seed(market, [
      {
        name: 'notes-keeper',
        description: 'Keeps notes',
        readme: '# Notes\nWorks with a translator',
        stars: 50,
      },
      { name: 'translator', description: 'Translates chat', readme: '# Translator', stars: 1 },
    ]);

    const result = await page(market, '/v1/bots?q=translator');

    expect(result.bots.map((bot) => bot.fullName)).toEqual([
      'alice/translator',
      'alice/notes-keeper',
    ]);
  });

  it('matches Chinese and short terms', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'zh-bot', description: '帮你整理会议纪要', readme: '# 会议助手' },
      { name: 'ai-bot', description: 'An AI pair programmer' },
      { name: 'other', description: 'Unrelated' },
    ]);

    expect((await page(market, '/v1/bots?q=会议纪要')).bots.map((bot) => bot.fullName)).toEqual([
      'alice/zh-bot',
    ]);
    expect((await page(market, '/v1/bots?q=会议')).bots.map((bot) => bot.fullName)).toEqual([
      'alice/zh-bot',
    ]);
    expect((await page(market, '/v1/bots?q=AI')).bots.map((bot) => bot.fullName)).toContain(
      'alice/ai-bot',
    );
  });

  it('keeps search results to the first 200 matches', async () => {
    const market = createMarket();
    for (let index = 0; index < SEARCH_RESULT_LIMIT + 5; index += 1) {
      market.sqlite
        .prepare(
          `INSERT INTO indexed_repositories (node_id, owner, name, html_url, clone_url, description, topics, stars, pushed_at, default_branch, visibility, first_seen_at, last_refreshed_at)
           VALUES (?, 'bulk', ?, 'https://github.com/bulk/x', 'https://github.com/bulk/x.git', 'calendar helper', '["botharness-bot"]', ?, '2026-10-01T00:00:00Z', 'main', 'listed', '2026-10-01T00:00:00Z', '2026-10-01T00:00:00Z')`,
        )
        .run(`R_bulk_${index}`, `bot-${index}`, index);
    }

    const seen = await walk(market, '/v1/bots?q=calendar&limit=50');

    expect(seen).toHaveLength(SEARCH_RESULT_LIMIT);
    expect(new Set(seen).size).toBe(SEARCH_RESULT_LIMIT);
  });

  it('filters by topic in browse and search', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'reader', topics: ['botharness-bot', 'research'] },
      { name: 'writer', topics: ['botharness-bot', 'writing'] },
    ]);

    expect((await page(market, '/v1/bots?topic=research')).bots.map((bot) => bot.fullName)).toEqual(
      ['alice/reader'],
    );
    expect(
      (await page(market, '/v1/bots?topic=writing&q=helpful')).bots.map((bot) => bot.fullName),
    ).toEqual(['alice/writer']);
  });

  it('counts listed topics without the marketplace topic', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'a', topics: ['botharness-bot', 'research', 'writing'] },
      { name: 'b', topics: ['botharness-bot', 'writing'] },
    ]);

    const response = await market.request('/v1/topics');

    expect(await response.json()).toEqual({
      topics: [
        { topic: 'writing', count: 2 },
        { topic: 'research', count: 1 },
      ],
    });
  });

  it.each(['translator', '像素画', '画', 'AI'])(
    'searches descriptor-only tags: %s',
    async (tag) => {
      const market = createMarket();
      await seed(market, [
        { name: 'tagged', descriptor: JSON.stringify({ tags: [tag] }) },
        { name: 'other' },
      ]);

      expect((await page(market, `/v1/bots?q=${encodeURIComponent(tag)}`)).bots).toEqual([
        expect.objectContaining({ fullName: 'alice/tagged' }),
      ]);
    },
  );

  it.each([
    ['translator', 'anslat'],
    ['像素画助手', '素画助'],
  ])('matches a substring of the descriptor tag %s', async (tag, query) => {
    const market = createMarket();
    await seed(market, [
      { name: 'tagged', descriptor: JSON.stringify({ tags: [tag] }) },
      { name: 'other' },
    ]);

    expect(await walk(market, `/v1/bots?q=${encodeURIComponent(query)}&limit=1`)).toEqual([
      'alice/tagged',
    ]);
  });

  it('ranks a descriptor-tag match above a README-only match', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'tagged', descriptor: '{"tags":["translator"]}', stars: 1 },
      { name: 'notes', readme: '# Notes\nWorks with a translator', stars: 99 },
    ]);

    expect(await walk(market, '/v1/bots?q=translator&limit=1')).toEqual([
      'alice/tagged',
      'alice/notes',
    ]);
  });

  it('filters descriptor tags in browse, ranked search and short-term search', async () => {
    const market = createMarket();
    await seed(market, [
      { name: 'tagged', descriptor: '{"tags":["画"]}', description: 'An AI helper' },
      { name: 'other', description: 'An AI helper' },
    ]);

    for (const suffix of ['', '&q=helper', '&q=AI']) {
      expect(
        await walk(market, `/v1/bots?topic=${encodeURIComponent('画')}${suffix}&limit=1`),
      ).toEqual(['alice/tagged']);
    }
  });

  it('counts the union of topics and descriptor tags once per listed bot, including legacy roles', async () => {
    const market = createMarket({ env: { REPORT_THRESHOLD: '1' } });
    await seed(market, [
      {
        name: 'a',
        topics: ['botharness-bot', 'writing'],
        descriptor: '{"tags":["writing","画","botharness-bot"]}',
      },
      { name: 'b', topics: ['botharness-bot'], descriptor: '{"roles":["画"]}' },
      { name: 'hidden', descriptor: '{"tags":["hidden-tag","画"]}' },
      { name: 'blocked', descriptor: '{"tags":["blocked-tag","画"]}' },
    ]);
    expect((await report(market, 'R_alice_hidden')).status).toBe(202);
    expect((await admin(market, { id: 'R_alice_blocked', action: 'block' })).status).toBe(200);

    expect(await (await market.request('/v1/topics')).json()).toEqual({
      topics: [
        { topic: '画', count: 2 },
        { topic: 'writing', count: 1 },
      ],
    });
    expect(await walk(market, `/v1/bots?topic=${encodeURIComponent('画')}&limit=1`)).toEqual([
      'alice/b',
      'alice/a',
    ]);
    for (const tag of ['hidden-tag', 'blocked-tag']) {
      expect(await walk(market, `/v1/bots?topic=${tag}`)).toEqual([]);
      expect(await walk(market, `/v1/bots?q=${tag}`)).toEqual([]);
    }
  });

  it('retains searchable tags after a content-fetch failure and replaces them when a retry succeeds', async () => {
    const market = createMarket();
    const repository = fakeRepository({ descriptor: '{"tags":["old-tag"]}' });
    await seed(market, [repository]);
    market.publish({
      ...repository,
      pushedAt: '2026-10-06T00:00:00Z',
      descriptor: '{"tags":["new-tag"]}',
    });
    market.github.contentsDown.value = true;
    await market.scheduled('17 * * * *');
    expect(await walk(market, '/v1/bots?topic=old-tag&q=old-tag')).toEqual(['alice/helper-bot']);
    expect(await walk(market, '/v1/bots?q=new-tag')).toEqual([]);

    market.github.contentsDown.value = false;
    await market.scheduled('17 * * * *');
    expect(await walk(market, '/v1/bots?topic=new-tag&q=new-tag')).toEqual(['alice/helper-bot']);
    expect(await walk(market, '/v1/bots?q=old-tag')).toEqual([]);
  });

  it('refreshes GitHub topics without a push and replaces descriptor tags after a push', async () => {
    const market = createMarket();
    const repository = fakeRepository({ descriptor: '{"tags":["old-tag"]}' });
    await seed(market, [repository]);
    market.publish({ ...repository, topics: ['botharness-bot', 'new-topic'] });
    await market.scheduled('17 * * * *');
    expect(await walk(market, '/v1/bots?topic=new-topic')).toEqual(['alice/helper-bot']);
    expect(await walk(market, '/v1/bots?topic=writing')).toEqual([]);

    market.publish({
      ...repository,
      topics: ['botharness-bot', 'new-topic'],
      pushedAt: '2026-10-06T00:00:00Z',
      descriptor: '{"tags":["new-tag"]}',
    });
    await market.scheduled('17 * * * *');
    expect(await walk(market, '/v1/bots?topic=old-tag')).toEqual([]);
    expect(await walk(market, '/v1/bots?q=old-tag')).toEqual([]);
    expect(await walk(market, '/v1/bots?topic=new-tag&q=new-tag')).toEqual(['alice/helper-bot']);
    expect(await (await market.request('/v1/topics')).json()).toEqual({
      topics: [
        { topic: 'new-tag', count: 1 },
        { topic: 'new-topic', count: 1 },
      ],
    });
  });

  it('drops hidden repositories from search', async () => {
    const market = createMarket();
    const repository = fakeRepository({ name: 'vanishing', description: 'Vanishing act' });
    market.publish(repository);
    await submit(market, repository.htmlUrl);
    market.publish({ ...repository, topics: ['other'] });
    await submit(market, repository.htmlUrl);

    expect((await page(market, '/v1/bots?q=vanishing')).bots).toEqual([]);
  });

  it('rejects an unknown sort or an over-long query', async () => {
    const market = createMarket();

    expect((await market.request('/v1/bots?sort=random')).status).toBe(400);
    expect((await market.request(`/v1/bots?q=${'a'.repeat(101)}`)).status).toBe(400);
  });
});
