import { describe, expect, it } from 'vitest';

import { admin, createMarket, fakeRepository, submit } from './market-harness.js';

type Market = ReturnType<typeof createMarket>;

const DAY = 86_400_000;

async function list(market: Market, name: string): Promise<string> {
  const repository = fakeRepository({ name });
  market.publish(repository);
  const response = await submit(market, repository.htmlUrl);
  return ((await response.json()) as { bot: { id: string } }).bot.id;
}

function seed(market: Market, id: string, count: number, daysAgo: number) {
  const at = market.clock.value.getTime() - daysAgo * DAY;
  for (let index = 0; index < count; index += 1) {
    market.sqlite
      .prepare('INSERT INTO install_receipts (bot_id, host_hash, created_at) VALUES (?, ?, ?)')
      .run(id, `${id}-${String(daysAgo)}-${String(index)}`, at);
  }
  market.sqlite
    .prepare('UPDATE indexed_repositories SET installs = installs + ? WHERE node_id = ?')
    .run(count, id);
}

function seen(market: Market, id: string, daysAgo: number) {
  market.sqlite
    .prepare('UPDATE indexed_repositories SET first_seen_at = ? WHERE node_id = ?')
    .run(new Date(market.clock.value.getTime() - daysAgo * DAY).toISOString(), id);
}

async function section(market: Market, name: string) {
  const response = await market.request(`/v1/sections/${name}`);
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    section: string;
    day: string | null;
    entries: { bot: { id: string }; score: number }[];
  };
  return { day: body.day, ranked: body.entries.map((entry) => [entry.bot.id, entry.score]) };
}

describe('Hot, New and Rising', () => {
  it('shows empty sections before the first snapshot', async () => {
    const market = createMarket();
    await list(market, 'one');
    expect(await section(market, 'hot')).toEqual({ day: null, ranked: [] });
    expect((await market.request('/v1/sections/popular')).status).toBe(404);
  });

  it('ranks Hot by installs in the last 7 days', async () => {
    const market = createMarket();
    const steady = await list(market, 'steady');
    const fresh = await list(market, 'fresh');
    const old = await list(market, 'old');
    seed(market, steady, 2, 1);
    seed(market, fresh, 4, 3);
    seed(market, old, 9, 10);

    const [log] = await market.daily();
    expect(log).toMatchObject({ phase: 'rankings', day: '2026-10-05', hot: 2 });
    expect(await section(market, 'hot')).toEqual({
      day: '2026-10-05',
      ranked: [
        [fresh, 4],
        [steady, 2],
      ],
    });
  });

  it('ranks New by when an entry was first listed, newest first', async () => {
    const market = createMarket();
    const recent = await list(market, 'recent');
    const older = await list(market, 'older');
    const stale = await list(market, 'stale');
    seen(market, recent, 1);
    seen(market, older, 5);
    seen(market, stale, 8);

    await market.daily();
    expect((await section(market, 'new')).ranked).toEqual([
      [recent, 0],
      [older, 0],
    ]);
  });

  it('ranks Rising by growth over the previous 7 days and ignores entries below the floor', async () => {
    const market = createMarket();
    const climbing = await list(market, 'climbing');
    const flat = await list(market, 'flat');
    const small = await list(market, 'small');
    const doubled = await list(market, 'doubled');
    seed(market, climbing, 6, 2);
    seed(market, climbing, 1, 9);
    seed(market, flat, 5, 2);
    seed(market, flat, 5, 9);
    seed(market, small, 2, 2);
    seed(market, doubled, 4, 2);
    seed(market, doubled, 2, 9);

    await market.daily();
    expect((await section(market, 'rising')).ranked).toEqual([
      [climbing, 5],
      [doubled, 2],
    ]);
  });

  it('drops hidden entries from a snapshot and replaces the day when it runs again', async () => {
    const market = createMarket();
    const kept = await list(market, 'kept');
    const blocked = await list(market, 'blocked');
    seed(market, kept, 1, 1);
    seed(market, blocked, 3, 1);
    await market.daily();
    expect((await section(market, 'hot')).ranked).toHaveLength(2);

    await admin(market, { id: blocked, action: 'block' });
    expect((await section(market, 'hot')).ranked).toEqual([[kept, 1]]);

    seed(market, kept, 1, 0);
    await market.daily();
    expect((await section(market, 'hot')).ranked).toEqual([[kept, 2]]);
    expect(
      market.sqlite
        .prepare("SELECT count(*) AS total FROM ranking_snapshots WHERE section = 'hot'")
        .get(),
    ).toEqual({ total: 1 });
  });

  it('keeps an empty latest run empty instead of showing an older list', async () => {
    const market = createMarket();
    const id = await list(market, 'once');
    seed(market, id, 2, 1);
    await market.daily();
    market.clock.value = new Date(market.clock.value.getTime() + 10 * DAY);
    await market.daily();
    expect(await section(market, 'hot')).toEqual({ day: '2026-10-15', ranked: [] });
  });

  it('serves sections as public reads with the localized entry', async () => {
    const market = createMarket();
    const id = await list(market, 'shared');
    seed(market, id, 1, 1);
    await market.daily();
    const response = await market.request('/v1/sections/hot?lang=zh', {
      headers: { origin: 'https://tobs.app' },
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('https://tobs.app');
    expect(response.headers.get('cache-control')).toBe('public, max-age=60');
  });
});
