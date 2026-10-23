import { describe, expect, it } from 'vitest';
import { createMarketplaceClient } from '../../../packages/core/src/marketplace/client';
import { createMobileMarketplace } from '../src/marketplace/catalogue';

const bot = (id: string) => ({
  id,
  owner: 'examples',
  name: id,
  fullName: `examples/${id}`,
  displayName: id,
  roles: [],
  description: 'A helpful Bot',
  descriptionGenerated: false,
  banner: null,
  topics: ['writing'],
  stars: 3,
  pushedAt: '2026-10-23',
  htmlUrl: `https://github.com/examples/${id}`,
  cloneUrl: `https://github.com/examples/${id}.git`,
  defaultBranch: 'main',
  headCommit: { sha: 'a'.repeat(40), committedAt: '2026-10-23' },
});

describe('mobile Marketplace catalogue', () => {
  it('keeps searches and languages separate when an older response arrives late', async () => {
    let finishOld!: (response: Response) => void;
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async (url) =>
        String(url).includes('q=old')
          ? new Promise<Response>((resolve) => {
              finishOld = resolve;
            })
          : Response.json({ bots: [bot('new')] }),
    });
    const catalogue = createMobileMarketplace(client);
    const old = catalogue.list({ q: 'old', lang: 'en' });
    const current = catalogue.list({ q: 'new', lang: 'zh' });
    const pending = old.refresh();
    await current.refresh();
    finishOld(Response.json({ bots: [bot('old')] }));
    await pending;
    expect(current.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['new']);
    expect(old.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['old']);
    expect(catalogue.list({ q: 'new', lang: 'en' }).getSnapshot().status).toBe('idle');
  });

  it('distinguishes failed, loading and confirmed empty catalogues and retries a failure', async () => {
    const responses = [Response.json({}, { status: 503 }), Response.json({ bots: [] })];
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async () => responses.shift()!,
    });
    const list = createMobileMarketplace(client).list({});
    const pending = list.refresh();
    expect(list.getSnapshot()).toMatchObject({ status: 'loading', busy: true });
    await pending;
    expect(list.getSnapshot()).toMatchObject({
      status: 'failed',
      busy: false,
      error: 'marketplace-unavailable',
    });
    await list.refresh();
    expect(list.getSnapshot()).toEqual({ status: 'ready', busy: false, value: { bots: [] } });
  });

  it('coalesces repeated page requests and retries the same cursor after an offline failure', async () => {
    const requests: string[] = [];
    const responses = [
      Response.json({ bots: [bot('one')], nextCursor: 'page-two' }),
      Response.json({}, { status: 503 }),
      Response.json({ bots: [bot('two')] }),
    ];
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async (url) => {
        requests.push(String(url));
        return responses.shift()!;
      },
    });
    const list = createMobileMarketplace(client).list({});
    await list.refresh();
    await Promise.all([list.more(), list.more()]);
    expect(list.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['one']);
    await list.more();
    expect(list.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['one', 'two']);
    expect(requests.slice(1)).toHaveLength(2);
    expect(requests[1]).toBe(requests[2]);
  });

  it('retains the readme and revision with a visible failure when a listing disappears', async () => {
    const responses = [
      Response.json({
        bot: bot('writer'),
        readme: '# Writer',
        readmeLanguage: 'en',
        commitSha: 'a'.repeat(40),
      }),
      Response.json({ error: { code: 'bot-not-found' } }, { status: 404 }),
    ];
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async () => responses.shift()!,
    });
    const catalogue = createMobileMarketplace(client);
    const detail = catalogue.detail('writer', 'en');
    await detail.refresh();
    await detail.refresh();
    expect(detail.getSnapshot()).toMatchObject({
      status: 'ready',
      error: 'bot-not-found',
      value: { readme: '# Writer', commitSha: 'a'.repeat(40) },
    });
    expect(catalogue.detail('writer', 'zh').getSnapshot().status).toBe('idle');
  });

  it('loads topics through the public service without credentials', async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async (url, init) => {
        requests.push({ url: String(url), headers: new Headers(init?.headers) });
        return Response.json({ topics: [{ topic: 'writing', count: 12 }] });
      },
    });
    const topics = createMobileMarketplace(client).topics;
    await topics.refresh();
    expect(topics.getSnapshot().value).toEqual([{ topic: 'writing', count: 12 }]);
    expect(requests[0]?.url).toBe('https://market.botharness.ai/v1/topics');
    expect(requests[0]?.headers.has('authorization')).toBe(false);
    expect(requests[0]?.headers.has('cookie')).toBe(false);
  });
  it('refuses a nonadvancing page cursor while keeping the last good page retryable', async () => {
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async () => Response.json({ bots: [bot('writer')], nextCursor: 'stuck' }),
    });
    const list = createMobileMarketplace(client).list({});
    await list.refresh();
    await list.more();
    expect(list.getSnapshot()).toMatchObject({
      status: 'ready',
      busy: false,
      error: 'marketplace-unavailable',
      value: { nextCursor: 'stuck' },
    });
    expect(list.getSnapshot().value?.bots).toHaveLength(1);
  });
  it('browses and pages without a Host and retains results when refresh fails', async () => {
    const responses = [
      Response.json({ bots: [bot('writer')], nextCursor: 'next' }),
      Response.json({ bots: [bot('writer'), bot('editor')] }),
      Response.json({ error: { code: 'marketplace-unavailable' } }, { status: 503 }),
    ];
    const requests: string[] = [];
    const client = createMarketplaceClient({
      baseUrl: 'https://market.botharness.ai',
      fetchImpl: async (url) => {
        requests.push(String(url));
        return responses.shift()!;
      },
    });
    const catalogue = createMobileMarketplace(client);
    const list = catalogue.list({ q: 'write', topic: 'writing', sort: 'stars', lang: 'en' });
    expect(list.getSnapshot().status).toBe('idle');
    await list.refresh();
    expect(list.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['writer']);
    await list.more();
    expect(list.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['writer', 'editor']);
    expect(requests[1]).toContain('cursor=next');
    expect(requests[0]).toContain('q=write');
    await list.refresh();
    expect(list.getSnapshot()).toMatchObject({ status: 'ready', error: 'marketplace-unavailable' });
    expect(list.getSnapshot().value?.bots.map((item) => item.id)).toEqual(['writer', 'editor']);
    expect(catalogue.list({ q: 'write', topic: 'writing', sort: 'stars', lang: 'en' })).toBe(list);
  });
});
