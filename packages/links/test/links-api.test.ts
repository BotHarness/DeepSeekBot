import { describe, expect, it } from 'vitest';
import { createHarness } from './links-harness.js';

async function writer() {
  const harness = createHarness();
  const { token } = await harness.createToken('write');
  return { ...harness, token };
}

describe('campaign and link API', () => {
  it('creates, updates, lists and archives campaigns', async () => {
    const { request, token } = await writer();
    const created = await request('/v1/campaigns', {
      method: 'POST',
      token,
      body: { slug: 'ph-launch', name: 'Product Hunt launch', description: 'October' },
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      slug: 'ph-launch',
      name: 'Product Hunt launch',
      description: 'October',
      archivedAt: null,
    });

    const duplicate = await request('/v1/campaigns', {
      method: 'POST',
      token,
      body: { slug: 'ph-launch', name: 'again' },
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toEqual({ error: { code: 'campaign-slug-taken' } });

    const updated = await request('/v1/campaigns/ph-launch', {
      method: 'PATCH',
      token,
      body: { name: 'PH launch', description: null },
    });
    expect(await updated.json()).toMatchObject({ name: 'PH launch', description: null });

    await request('/v1/campaigns/ph-launch/archive', { method: 'POST', token });
    const active = (await (await request('/v1/campaigns', { token })).json()) as {
      campaigns: unknown[];
    };
    expect(active.campaigns).toHaveLength(0);
    const all = (await (await request('/v1/campaigns?includeArchived=true', { token })).json()) as {
      campaigns: { archivedAt: string | null }[];
    };
    expect(all.campaigns[0]?.archivedAt).toEqual(expect.any(String));

    expect(
      (
        await request('/v1/links', {
          method: 'POST',
          token,
          body: { slug: 'late', campaign: 'ph-launch', platform: 'x', media: 'post' },
        })
      ).status,
    ).toBe(409);
    expect((await request('/v1/campaigns/missing', { token })).status).toBe(404);
  });

  it('validates slugs, labels and target paths', async () => {
    const { request, token } = await writer();
    await request('/v1/campaigns', { method: 'POST', token, body: { slug: 'c1', name: 'C' } });
    const refused = async (body: Record<string, unknown>) => {
      const response = await request('/v1/links', {
        method: 'POST',
        token,
        body: { slug: 'ok', campaign: 'c1', platform: 'x', media: 'post', ...body },
      });
      expect(response.status, JSON.stringify(body)).toBe(400);
      return (await response.json()) as { error: { code: string } };
    };
    expect((await refused({ slug: 'Upper' })).error.code).toBe('invalid-request');
    await refused({ slug: '-lead' });
    await refused({ slug: 'v1' });
    await refused({ slug: 'a_b' });
    await refused({ platform: 'X Twitter' });
    await refused({ path: 'https://evil.example/' });
    await refused({ path: '//evil.example/' });
    await refused({ path: '/en/docs/' });
    await refused({ path: '/a/../b' });
    await refused({ path: '/a?b=c' });
    await refused({ language: 'fr' });
    expect(
      (
        await request('/v1/links', {
          method: 'POST',
          token,
          body: { slug: 'ok', campaign: 'missing', platform: 'x', media: 'post' },
        })
      ).status,
    ).toBe(404);
  });

  it('creates, updates, lists and archives links', async () => {
    const { request, token } = await writer();
    await request('/v1/campaigns', { method: 'POST', token, body: { slug: 'c1', name: 'C' } });
    await request('/v1/campaigns', { method: 'POST', token, body: { slug: 'c2', name: 'D' } });
    const created = await request('/v1/links', {
      method: 'POST',
      token,
      body: { slug: 'yt-demo', campaign: 'c1', platform: 'youtube', media: 'video', note: 'demo' },
    });
    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({
      slug: 'yt-demo',
      campaign: 'c1',
      path: '/',
      language: 'zh',
      note: 'demo',
      clicks: 0,
      shortUrl: 'https://go.tobs.app/yt-demo',
      target:
        'https://tobs.app/?utm_campaign=c1&utm_source=youtube&utm_medium=video&utm_content=yt-demo',
    });
    expect(
      (
        await request('/v1/links', {
          method: 'POST',
          token,
          body: { slug: 'yt-demo', campaign: 'c2', platform: 'x', media: 'post' },
        })
      ).status,
    ).toBe(409);
    await request('/v1/links', {
      method: 'POST',
      token,
      body: { slug: 'x-thread', campaign: 'c2', platform: 'x', media: 'post' },
    });

    const patched = await request('/v1/links/yt-demo', {
      method: 'PATCH',
      token,
      body: { path: '/market', language: 'en', note: null },
    });
    expect(await patched.json()).toMatchObject({
      path: '/market',
      language: 'en',
      note: null,
      platform: 'youtube',
      target:
        'https://tobs.app/en/market?utm_campaign=c1&utm_source=youtube&utm_medium=video&utm_content=yt-demo',
    });

    const byCampaign = (await (await request('/v1/links?campaign=c1', { token })).json()) as {
      links: { slug: string }[];
    };
    expect(byCampaign.links.map((link) => link.slug)).toEqual(['yt-demo']);

    const archived = await request('/v1/links/yt-demo/archive', { method: 'POST', token });
    expect(await archived.json()).toMatchObject({ archivedAt: expect.any(String) });
    const listed = (await (await request('/v1/links', { token })).json()) as {
      links: { slug: string }[];
    };
    expect(listed.links.map((link) => link.slug)).toEqual(['x-thread']);

    const totals = await request('/v1/campaigns/c1/clicks', { token });
    expect(await totals.json()).toMatchObject({
      campaign: 'c1',
      total: 0,
      links: [{ slug: 'yt-demo', clicks: 0, archivedAt: expect.any(String) }],
    });
    expect((await request('/v1/links/missing', { method: 'PATCH', token, body: {} })).status).toBe(
      404,
    );
  });

  it('generates <platform>-<media> slugs, numbered when taken', async () => {
    const { request, token } = await writer();
    await request('/v1/campaigns', { method: 'POST', token, body: { slug: 'c1', name: 'C' } });
    const slugs: string[] = [];
    for (const body of [
      { campaign: 'c1', platform: 'x', media: 'post' },
      { campaign: 'c1', platform: 'x', media: 'post' },
      { campaign: 'c1', platform: 'product_hunt', media: 'launch' },
    ]) {
      const response = await request('/v1/links', { method: 'POST', token, body });
      expect(response.status).toBe(201);
      slugs.push(((await response.json()) as { slug: string }).slug);
    }
    expect(slugs).toEqual(['x-post', 'x-post-2', 'product-hunt-launch']);
  });

  it('serves the OpenAPI document', async () => {
    const { request } = createHarness();
    const response = await request('/openapi.json');
    expect(response.status).toBe(200);
    const document = (await response.json()) as {
      paths: Record<string, unknown>;
      components: { securitySchemes: Record<string, unknown> };
    };
    expect(Object.keys(document.paths)).toEqual(
      expect.arrayContaining([
        '/v1/campaigns',
        '/v1/campaigns/{slug}',
        '/v1/campaigns/{slug}/archive',
        '/v1/campaigns/{slug}/clicks',
        '/v1/links',
        '/v1/links/{slug}',
        '/v1/links/{slug}/archive',
        '/v1/links/{slug}/clicks',
        '/v1/tokens',
        '/v1/tokens/{id}/revoke',
        '/{slug}',
      ]),
    );
    expect(document.components.securitySchemes.bearerAuth).toMatchObject({ scheme: 'bearer' });
  });
});
