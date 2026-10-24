import { describe, expect, it } from 'vitest';
import { app } from '../src/worker.js';
import { BOOTSTRAP, createHarness, ORIGIN } from './links-harness.js';

const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} };

function mcpClient(env: ReturnType<typeof createHarness>['env'], token?: string) {
  let id = 0;
  const post = async (method: string, params?: unknown) => {
    id += 1;
    const headers: Record<string, string> = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
      'mcp-protocol-version': '2025-06-18',
    };
    if (token !== undefined) headers.authorization = `Bearer ${token}`;
    return app.request(
      `${ORIGIN}/mcp`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) }),
      },
      env,
      executionCtx,
    );
  };
  const rpc = async (method: string, params?: unknown) => {
    const response = await post(method, params);
    expect(response.status).toBe(200);
    return (await response.json()) as { result?: Record<string, unknown>; error?: unknown };
  };
  const tool = async (name: string, args: Record<string, unknown> = {}) => {
    const { result } = await rpc('tools/call', { name, arguments: args });
    const content = (result?.content ?? []) as { type: string; text: string }[];
    const text = content[0]?.text ?? '';
    const isError = result?.isError === true;
    if (!text.startsWith('{')) return { isError, data: {}, text };
    return { isError, data: JSON.parse(text) as Record<string, unknown> };
  };
  return { post, rpc, tool };
}

describe('MCP at /mcp', () => {
  it('initializes, lists the tools and creates a link with a write PAT', async () => {
    const harness = createHarness();
    const { token } = await harness.createToken('write');
    const { rpc, tool } = mcpClient(harness.env, token);

    const initialized = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0.0' },
    });
    expect(initialized.result).toMatchObject({
      serverInfo: { name: 'botharness-links' },
      capabilities: { tools: {} },
    });

    const listed = await rpc('tools/list');
    const tools = listed.result?.tools as { name: string; inputSchema: { properties: object } }[];
    expect(tools.map((item) => item.name).sort()).toEqual([
      'campaign_archive',
      'campaign_clicks',
      'campaign_create',
      'campaign_update',
      'campaigns_list',
      'link_archive',
      'link_clicks',
      'link_create',
      'link_update',
      'links_list',
    ]);
    expect(
      Object.keys(tools.find((item) => item.name === 'link_create')!.inputSchema.properties),
    ).toEqual(expect.arrayContaining(['slug', 'campaign', 'platform', 'media', 'path']));

    expect(
      await tool('campaign_create', { slug: 'ph-launch', name: 'Product Hunt launch' }),
    ).toMatchObject({ isError: false, data: { slug: 'ph-launch' } });
    const link = await tool('link_create', {
      slug: 'ph-x-post',
      campaign: 'ph-launch',
      platform: 'x',
      media: 'post',
      path: '/docs/overview/',
      language: 'en',
    });
    expect(link).toEqual({
      isError: false,
      data: expect.objectContaining({
        shortUrl: 'https://go.tobs.app/ph-x-post',
        target:
          'https://tobs.app/en/docs/overview/?utm_campaign=ph-launch&utm_source=x&utm_medium=post&utm_content=ph-x-post',
        clicks: 0,
      }),
    });

    await harness.request('/ph-x-post');
    const listedLinks = await tool('links_list', { campaign: 'ph-launch' });
    expect(listedLinks.data).toMatchObject({ links: [{ slug: 'ph-x-post', clicks: 1 }] });
    expect(await tool('link_clicks', { slug: 'ph-x-post', days: 7 })).toMatchObject({
      data: { link: 'ph-x-post', total: 1, daily: [{ clicks: 1 }] },
    });
    expect(await tool('campaign_clicks', { slug: 'ph-launch' })).toMatchObject({
      data: { campaign: 'ph-launch', total: 1 },
    });
    expect(await tool('link_update', { slug: 'ph-x-post', note: 'launch tweet' })).toMatchObject({
      data: { note: 'launch tweet', platform: 'x' },
    });
    expect(await tool('campaign_update', { slug: 'ph-launch', name: 'PH' })).toMatchObject({
      data: { name: 'PH' },
    });
    expect(await tool('link_archive', { slug: 'ph-x-post' })).toMatchObject({
      data: { archivedAt: expect.any(String) },
    });
    expect(await tool('campaign_archive', { slug: 'ph-launch' })).toMatchObject({
      data: { archivedAt: expect.any(String) },
    });
    expect(await tool('campaigns_list', { includeArchived: true })).toMatchObject({
      data: { campaigns: [{ slug: 'ph-launch' }] },
    });
  });

  it('returns API errors as tool errors', async () => {
    const harness = createHarness();
    const { token } = await harness.createToken('write');
    const { tool } = mcpClient(harness.env, token);
    expect(
      await tool('link_create', { slug: 'x1', campaign: 'missing', platform: 'x', media: 'post' }),
    ).toEqual({ isError: true, data: { status: 404, error: { code: 'campaign-not-found' } } });
    const invalid = await tool('link_create', {
      slug: 'x1',
      campaign: 'c1',
      platform: 'x',
      media: 'post',
      path: 'https://evil.example/',
    });
    expect(invalid).toMatchObject({ isError: true, text: expect.stringMatching(/path/) });
  });

  it('lets a read PAT read but not change anything', async () => {
    const harness = createHarness();
    const writer = await harness.createToken('write');
    await mcpClient(harness.env, writer.token).tool('campaign_create', { slug: 'c1', name: 'C' });
    const { token } = await harness.createToken('read');
    const { tool } = mcpClient(harness.env, token);
    expect(await tool('campaigns_list')).toMatchObject({
      isError: false,
      data: { campaigns: [{ slug: 'c1' }] },
    });
    expect(await tool('campaign_create', { slug: 'c2', name: 'D' })).toEqual({
      isError: true,
      data: { status: 403, error: { code: 'insufficient-scope' } },
    });
    expect(
      await tool('link_create', { slug: 'l1', campaign: 'c1', platform: 'x', media: 'post' }),
    ).toMatchObject({ isError: true, data: { status: 403 } });
    expect(await tool('campaign_archive', { slug: 'c1' })).toMatchObject({ isError: true });
  });

  it('refuses requests without a PAT, with the bootstrap secret and for GET', async () => {
    const harness = createHarness();
    const missing = await mcpClient(harness.env).post('tools/list');
    expect(missing.status).toBe(401);
    expect(missing.headers.get('www-authenticate')).toMatch(/^Bearer/);
    expect(await missing.json()).toEqual({ error: { code: 'unauthorized' } });
    expect((await mcpClient(harness.env, BOOTSTRAP).post('tools/list')).status).toBe(401);
    expect((await mcpClient(harness.env, `bhl_${'a'.repeat(43)}`).post('tools/list')).status).toBe(
      401,
    );

    const { token } = await harness.createToken('read');
    const get = await harness.request('/mcp', { token });
    expect(get.status).toBe(405);
  });
});
