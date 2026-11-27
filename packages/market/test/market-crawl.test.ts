import { describe, expect, it } from 'vitest';
import { limitD1Requests } from '../src/d1.js';
import { continueDiscovery } from '../src/discovery.js';
import { DISCOVERY_CRON, REFRESH_CRON } from '../src/worker.js';
import {
  createLocalD1,
  createMarket,
  fakeRepository,
  submit,
  type FakeRepository,
} from './market-harness.js';

interface Listed {
  bots: {
    id: string;
    fullName: string;
    stars: number;
    description: string | null;
    headCommit: { sha: string } | null;
  }[];
}

async function listed(market: ReturnType<typeof createMarket>): Promise<Listed['bots']> {
  const all: Listed['bots'] = [];
  let cursor: string | undefined;
  do {
    const query = cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`;
    const page = (await (await market.request(`/v1/bots?limit=50${query}`)).json()) as Listed & {
      nextCursor?: string;
    };
    all.push(...page.bots);
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  return all;
}

function row(market: ReturnType<typeof createMarket>, id: string) {
  return market.sqlite
    .prepare(
      'SELECT visibility, owner, name, html_url, stars, readme FROM indexed_repositories WHERE node_id = ?',
    )
    .get(id) as {
    visibility: string;
    owner: string;
    name: string;
    html_url: string;
    stars: number;
    readme: string | null;
  };
}

function many(count: number, created: (index: number) => string): FakeRepository[] {
  return Array.from({ length: count }, (_, index) =>
    fakeRepository({ name: `bot-${String(index).padStart(4, '0')}`, createdAt: created(index) }),
  );
}

async function finishDiscovery(
  market: ReturnType<typeof createMarket>,
  maxRuns: number,
): Promise<Record<string, unknown>> {
  let added = 0;
  for (let run = 0; run < maxRuns; run += 1) {
    const requests = market.queries.requests;
    const report = await market.scheduled(DISCOVERY_CRON);
    expect(market.queries.requests - requests).toBeLessThanOrEqual(800);
    added += Number(report['added']);
    if (report['complete'] === true) return { ...report, added };
  }
  throw new Error(`Discovery did not complete after ${maxRuns} runs`);
}

describe('Marketplace scheduled discovery', () => {
  it('stops at the exhausted request and resumes with the same repository', async () => {
    const { db } = createLocalD1();
    const work = limitD1Requests(db, 1).db;
    const ids = ['1', '2', '3'];
    const visited: string[] = [];
    const first = await continueDiscovery({
      db,
      phase: 'skills',
      ids,
      async visit(id) {
        await work.prepare('SELECT 1').first();
        visited.push(id);
        return true;
      },
    });
    expect(first).toEqual({ complete: false, skipped: 0 });
    expect(visited).toEqual(['1']);

    const second = await continueDiscovery({
      db,
      phase: 'skills',
      ids,
      visit(id) {
        visited.push(id);
        return Promise.resolve(true);
      },
    });
    expect(second).toEqual({ complete: true, skipped: 0 });
    expect(visited).toEqual(ids);
  });

  it('skips a Bot repository that throws and continues to later repositories and Skills', async () => {
    const market = createMarket();
    for (const index of [1, 2, 3, 4, 5]) market.publish(fakeRepository({ name: `bot-${index}` }));
    market.publish(fakeRepository({ name: 'skill', topics: ['tobs-skill'] }));
    market.sqlite.exec(`CREATE TRIGGER fail_bot BEFORE INSERT ON indexed_repositories
      WHEN NEW.name = 'bot-2' OR (NEW.name = 'bot-4' AND NEW.head_sha IS NOT NULL)
      BEGIN SELECT RAISE(FAIL, 'test repository error'); END`);

    expect(await market.scheduled(DISCOVERY_CRON)).toMatchObject({
      phase: 'discovery',
      complete: true,
      found: 5,
      added: 4,
      skipped: 2,
    });
    const bots = await listed(market);
    expect(bots.map((bot) => bot.fullName).sort()).toEqual([
      'alice/bot-1',
      'alice/bot-3',
      'alice/bot-4',
      'alice/bot-5',
    ]);
    expect(bots.find((bot) => bot.fullName === 'alice/bot-5')).toMatchObject({
      headCommit: { sha: 'abcdef1234567890abcdef1234567890abcdef12' },
    });
    expect(market.logs.at(-1)).toMatchObject({ phase: 'skills', repositories: 1 });
  });

  it('lists topic repositories without a paste and fills head commit and README', async () => {
    const market = createMarket();
    market.publish(fakeRepository({ name: 'tagged' }));
    market.publish(fakeRepository({ name: 'untagged', topics: ['writing'] }));

    const report = await market.scheduled(DISCOVERY_CRON);

    expect(report).toMatchObject({ phase: 'discovery', complete: true, found: 1, added: 1 });
    expect(await listed(market)).toEqual([
      expect.objectContaining({
        fullName: 'alice/tagged',
        headCommit: expect.objectContaining({ sha: 'abcdef1234567890abcdef1234567890abcdef12' }),
      }),
    ]);
    expect(row(market, 'R_alice_tagged').readme).toBe('# tagged');
  });

  it('slices by creation date so every consumed search stays under the 1,000 cap', async () => {
    const market = createMarket();
    const start = Date.parse('2020-01-01T00:00:00Z');
    for (const repository of many(1500, (index) =>
      new Date(start + index * 86_400_000).toISOString(),
    )) {
      market.publish(repository);
    }

    const report = await finishDiscovery(market, 65);

    expect(report).toMatchObject({ complete: true, found: 1500, added: 1500 });
    expect(Number(report['slices'])).toBeGreaterThan(2);
    expect(await listed(market)).toHaveLength(1500);
  }, 45_000);

  it('reports an incomplete scan and hides nothing when one second holds 1,000 repositories', async () => {
    const market = createMarket();
    const existing = fakeRepository({ name: 'existing', createdAt: '2019-01-01T00:00:00Z' });
    market.publish(existing);
    await submit(market, existing.htmlUrl);
    for (const repository of many(1000, () => '2025-05-05T05:05:05Z')) market.publish(repository);
    market.github.repositories.delete('alice/existing');
    market.publish({ ...existing, topics: ['botharness-bot'], createdAt: '2025-05-05T05:05:05Z' });

    const report = await market.scheduled(DISCOVERY_CRON);

    expect(report).toMatchObject({ complete: false, hidden: 0 });
    expect(row(market, existing.nodeId).visibility).toBe('listed');
  });

  it('hides listed entries that no longer carry the topic after a complete scan', async () => {
    const market = createMarket();
    const kept = fakeRepository({ name: 'kept' });
    const dropped = fakeRepository({ name: 'dropped' });
    market.publish(kept);
    market.publish(dropped);
    await market.scheduled(DISCOVERY_CRON);

    market.publish({ ...dropped, topics: ['writing'] });
    const report = await market.scheduled(DISCOVERY_CRON);

    expect(report).toMatchObject({ complete: true, hidden: 1 });
    expect((await listed(market)).map((bot) => bot.fullName)).toEqual(['alice/kept']);
    expect(row(market, dropped.nodeId).visibility).toBe('hidden_missing');
  });

  it('keeps rows untouched when search fails', async () => {
    const market = createMarket();
    market.publish(fakeRepository());
    await market.scheduled(DISCOVERY_CRON);

    market.github.down.value = true;
    const report = await market.scheduled(DISCOVERY_CRON);

    expect(report).toMatchObject({ complete: false, hidden: 0 });
    expect(await listed(market)).toHaveLength(1);
  });
});

describe('Marketplace hourly refresh', () => {
  it('refreshes metadata in GraphQL batches of 100', async () => {
    const market = createMarket();
    for (const repository of many(250, () => '2024-01-01T00:00:00Z')) market.publish(repository);
    await finishDiscovery(market, 12);
    market.github.nodeBatches.length = 0;
    const target = market.github.repositories.get('alice/bot-0007')!;
    market.publish({
      ...target,
      stars: 99,
      description: 'Updated',
      pushedAt: '2026-10-05T00:00:00Z',
      head: {
        sha: 'feedfacefeedfacefeedfacefeedfacefeedface',
        committedAt: '2026-10-05T00:00:00Z',
      },
    });

    const report = await market.scheduled(REFRESH_CRON);

    expect(report).toMatchObject({
      phase: 'refresh',
      batches: 3,
      failedBatches: 0,
      refreshed: 250,
    });
    expect(market.github.nodeBatches).toEqual([100, 100, 50]);
    expect((await listed(market)).find((bot) => bot.fullName === 'alice/bot-0007')).toMatchObject({
      stars: 99,
      description: 'Updated',
      headCommit: { sha: 'feedfacefeedfacefeedfacefeedfacefeedface' },
    });
  });

  it('refetches the README only after a push', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await market.scheduled(DISCOVERY_CRON);
    const readmeRequests = () =>
      market.github.requests.filter((path) => path.endsWith('/readme')).length;
    const before = readmeRequests();

    market.publish({ ...repository, stars: 5, readme: '# changed without push' });
    await market.scheduled(REFRESH_CRON);
    expect(readmeRequests()).toBe(before);
    expect(row(market, repository.nodeId).readme).toBe('# helper-bot');

    market.publish({ ...repository, pushedAt: '2026-10-05T00:00:00Z', readme: '# pushed' });
    await market.scheduled(REFRESH_CRON);
    expect(readmeRequests()).toBe(before + 1);
    expect(row(market, repository.nodeId).readme).toBe('# pushed');
  });

  it.each([
    ['topic removed', (repository: FakeRepository) => ({ ...repository, topics: ['writing'] })],
    ['made private', (repository: FakeRepository) => ({ ...repository, private: true })],
    ['archived', (repository: FakeRepository) => ({ ...repository, archived: true })],
  ])(
    'hides an entry whose repository was %s and lists it again once restored',
    async (_, change) => {
      const market = createMarket();
      const repository = fakeRepository();
      market.publish(repository);
      await market.scheduled(DISCOVERY_CRON);

      market.publish(change(repository));
      const hidden = await market.scheduled(REFRESH_CRON);
      expect(hidden).toMatchObject({ hidden: 1 });
      expect(await listed(market)).toEqual([]);
      expect(row(market, repository.nodeId).visibility).toBe('hidden_missing');

      market.publish(repository);
      await market.scheduled(REFRESH_CRON);
      expect(await listed(market)).toHaveLength(1);
    },
  );

  it('hides a deleted repository but keeps its row', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await market.scheduled(DISCOVERY_CRON);

    market.github.repositories.clear();
    const report = await market.scheduled(REFRESH_CRON);

    expect(report).toMatchObject({ hidden: 1 });
    expect(row(market, repository.nodeId).visibility).toBe('hidden_missing');
  });

  it('keeps the entry through a rename or transfer', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await market.scheduled(DISCOVERY_CRON);

    market.github.repositories.clear();
    market.publish({
      ...repository,
      owner: 'bob',
      name: 'moved-bot',
      htmlUrl: 'https://github.com/bob/moved-bot',
    });
    await market.scheduled(REFRESH_CRON);

    expect(await listed(market)).toEqual([
      expect.objectContaining({ id: repository.nodeId, fullName: 'bob/moved-bot' }),
    ]);
    expect(row(market, repository.nodeId)).toMatchObject({
      owner: 'bob',
      name: 'moved-bot',
      html_url: 'https://github.com/bob/moved-bot',
    });
  });

  it('keeps the last good data when a GraphQL batch fails', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await market.scheduled(DISCOVERY_CRON);

    market.publish({ ...repository, stars: 42, topics: ['writing'] });
    market.github.nodesDown.value = true;
    const report = await market.scheduled(REFRESH_CRON);

    expect(report).toMatchObject({ batches: 1, failedBatches: 1, refreshed: 0, hidden: 0 });
    expect(row(market, repository.nodeId)).toMatchObject({ visibility: 'listed', stars: 3 });
  });

  it('never refreshes a blocked repository back into the list', async () => {
    const market = createMarket();
    const repository = fakeRepository();
    market.publish(repository);
    await market.scheduled(DISCOVERY_CRON);
    market.sqlite.exec("UPDATE indexed_repositories SET visibility = 'blocked'");

    await market.scheduled(REFRESH_CRON);
    await market.scheduled(DISCOVERY_CRON);

    expect(row(market, repository.nodeId).visibility).toBe('blocked');
  });
});
