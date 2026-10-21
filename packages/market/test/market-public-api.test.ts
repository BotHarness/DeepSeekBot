import { describe, expect, it } from 'vitest';
import { PUBLIC_ORIGINS } from '../src/public-api.js';
import { admin, createMarket, fakeRepository, report, submit } from './market-harness.js';

const SITE = 'https://deepseekbot.botharness.ai';

const ENTRY_SHAPE = {
  id: expect.any(String),
  owner: expect.any(String),
  name: expect.any(String),
  fullName: expect.any(String),
  displayName: null,
  tags: expect.any(Array),
  roles: expect.any(Array),
  bio: expect.any(String),
  bioGenerated: false,
  banner: null,
  description: expect.any(String),
  topics: expect.any(Array),
  stars: expect.any(Number),
  pushedAt: expect.any(String),
  createdAt: expect.any(String),
  htmlUrl: expect.any(String),
  cloneUrl: expect.any(String),
  defaultBranch: expect.any(String),
  headCommit: { sha: expect.any(String), committedAt: expect.any(String) },
};

async function listedMarket() {
  const market = createMarket();
  for (const repository of [
    fakeRepository({ name: 'reader', topics: ['botharness-bot', 'research'], stars: 9 }),
    fakeRepository({ name: 'writer', pushedAt: '2026-10-03T00:00:00Z' }),
  ]) {
    market.publish(repository);
    await submit(market, repository.htmlUrl);
  }
  return market;
}

function get(market: ReturnType<typeof createMarket>, path: string, origin?: string) {
  return market.request(path, { headers: origin === undefined ? {} : { origin } });
}

describe('public read API contract', () => {
  it('serves list, search, topics and detail with stable shapes', async () => {
    const market = await listedMarket();

    const list = (await (await get(market, '/v1/bots?limit=1')).json()) as Record<string, unknown>;
    expect(Object.keys(list).sort()).toEqual(['bots', 'nextCursor']);
    expect(list['bots']).toEqual([ENTRY_SHAPE]);
    expect(Object.keys((list['bots'] as object[])[0]!).sort()).toEqual(
      Object.keys(ENTRY_SHAPE).sort(),
    );

    const search = (await (await get(market, '/v1/bots?q=reader&sort=stars')).json()) as {
      bots: { name: string }[];
    };
    expect(search.bots.map((bot) => bot.name)).toEqual(['reader']);

    expect(await (await get(market, '/v1/topics')).json()).toEqual({
      topics: [
        { topic: 'research', count: 1 },
        { topic: 'writing', count: 1 },
      ],
    });

    const detail = (await (await get(market, '/v1/bots/R_alice_reader')).json()) as Record<
      string,
      unknown
    >;
    expect(Object.keys(detail).sort()).toEqual([
      'bot',
      'commitSha',
      'readme',
      'readmeLanguage',
      'readmeLanguages',
    ]);
    expect(detail).toEqual({
      bot: { ...ENTRY_SHAPE, name: 'reader' },
      readme: '# reader',
      readmeLanguage: null,
      readmeLanguages: [],
      commitSha: expect.stringMatching(/^[0-9a-f]{40}$/u),
    });
  });

  it.each(PUBLIC_ORIGINS)('grants CORS to %s on every read route', async (origin) => {
    const market = await listedMarket();
    for (const path of ['/v1/bots', '/v1/bots?q=reader', '/v1/topics', '/v1/bots/R_alice_reader']) {
      const response = await get(market, path, origin);
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('vary')).toContain('Origin');
    }
  });

  it('gives other origins and origin-less callers no CORS grant', async () => {
    const market = await listedMarket();
    for (const origin of [
      'https://evil.example',
      'https://deepseekbot.botharness.ai.evil.example',
      'https://deepseekbot.app.evil.example',
      'http://deepseekbot.app',
      'null',
    ]) {
      const response = await get(market, '/v1/bots', origin);
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
    expect((await get(market, '/v1/bots')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers preflight for allowed origins only', async () => {
    const market = await listedMarket();
    const allowed = await market.request('/v1/bots', {
      method: 'OPTIONS',
      headers: { origin: SITE, 'access-control-request-method': 'GET' },
    });
    expect(allowed.status).toBe(204);
    expect(Object.fromEntries(allowed.headers)).toMatchObject({
      'access-control-allow-origin': SITE,
      'access-control-allow-methods': 'GET',
      'access-control-allow-headers': 'accept',
      'access-control-max-age': '86400',
    });

    const refused = await market.request('/v1/bots/R_alice_reader', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
    });
    expect(refused.status).toBe(204);
    expect(refused.headers.get('access-control-allow-origin')).toBeNull();
    expect(refused.headers.get('access-control-allow-methods')).toBeNull();
  });

  it('caches successful reads briefly and never caches errors', async () => {
    const market = await listedMarket();
    for (const path of ['/v1/bots', '/v1/topics', '/v1/bots/R_alice_reader']) {
      expect((await get(market, path, SITE)).headers.get('cache-control')).toBe(
        'public, max-age=60',
      );
    }
    for (const path of ['/v1/bots/R_missing', '/v1/bots?sort=random', '/v1/bots?cursor=bad']) {
      const response = await get(market, path, SITE);
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('access-control-allow-origin')).toBe(SITE);
    }
  });

  it('never serves hidden or blocked entries', async () => {
    const market = createMarket({ env: { REPORT_THRESHOLD: '1' } });
    for (const name of ['kept', 'reported', 'blocked']) {
      const repository = fakeRepository({ name });
      market.publish(repository);
      await submit(market, repository.htmlUrl);
    }
    await report(market, 'R_alice_reported');
    await admin(market, { id: 'R_alice_blocked', action: 'block' });

    const list = (await (await get(market, '/v1/bots', SITE)).json()) as {
      bots: { name: string }[];
    };
    expect(list.bots.map((bot) => bot.name)).toEqual(['kept']);
    for (const id of ['R_alice_reported', 'R_alice_blocked']) {
      expect((await get(market, `/v1/bots/${id}`, SITE)).status).toBe(404);
    }
    for (const query of ['reported', 'blocked']) {
      const search = (await (await get(market, `/v1/bots?q=${query}`, SITE)).json()) as {
        bots: unknown[];
      };
      expect(search.bots).toHaveLength(0);
    }
  });

  it('keeps paste, report, challenge and admin out of the public contract', async () => {
    const market = await listedMarket();
    const writes = [
      market.request('/v1/challenge', { headers: { origin: SITE } }),
      market.request('/v1/submissions', { method: 'POST', headers: { origin: SITE }, body: '{}' }),
      market.request('/v1/bots/R_alice_reader/reports', {
        method: 'POST',
        headers: { origin: SITE },
        body: '{}',
      }),
      market.request('/v1/admin/blocklist', { method: 'POST', headers: { origin: SITE } }),
      market.request('/v1/submissions', { method: 'OPTIONS', headers: { origin: SITE } }),
    ];
    for (const response of await Promise.all(writes)) {
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }
  });
});
