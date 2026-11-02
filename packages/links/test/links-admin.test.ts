import { Jwt } from 'hono/utils/jwt';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ORIGIN, createHarness } from './links-harness.js';

const AUD = 'test-access-aud';
let team = 0;
let privateJwk: JsonWebKey & { kid: string };
let publicJwk: JsonWebKey & { kid: string };
let otherPrivateJwk: JsonWebKey & { kid: string };
const certRequests: string[] = [];

beforeAll(async () => {
  const pair = async (kid: string) => {
    const keys = (await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair;
    return {
      privateKey: { ...(await crypto.subtle.exportKey('jwk', keys.privateKey)), kid },
      publicKey: { ...(await crypto.subtle.exportKey('jwk', keys.publicKey)), kid },
    };
  };
  const signing = await pair('access-key-1');
  privateJwk = signing.privateKey;
  publicJwk = signing.publicKey;
  otherPrivateJwk = (await pair('access-key-1')).privateKey;
});

afterEach(() => {
  certRequests.length = 0;
  vi.unstubAllGlobals();
});

function accessHarness() {
  team += 1;
  const domain = `team${team}.cloudflareaccess.com`;
  vi.stubGlobal('fetch', async (input: URL | string) => {
    const url = String(input);
    certRequests.push(url);
    if (url === `https://${domain}/cdn-cgi/access/certs`) {
      return Response.json({ keys: [publicJwk], public_cert: { kid: publicJwk.kid } });
    }
    return new Response('{}');
  });
  const harness = createHarness({ ACCESS_TEAM_DOMAIN: domain, ACCESS_AUD: AUD });
  const now = Math.floor(Date.now() / 1000);
  const jwt = (overrides: Record<string, unknown> = {}, key = privateJwk) =>
    Jwt.sign(
      {
        iss: `https://${domain}`,
        aud: [AUD],
        email: 'owner@botharness.ai',
        sub: 'user-1',
        iat: now - 10,
        nbf: now - 10,
        exp: now + 600,
        ...overrides,
      },
      key,
      'RS256',
    );
  return { ...harness, domain, jwt };
}

async function signedIn() {
  const harness = accessHarness();
  const assertion = await harness.jwt();
  const page = (path: string) =>
    harness.request(path, { headers: { 'cf-access-jwt-assertion': assertion } });
  const post = (path: string, fields: Record<string, string>, origin = ORIGIN) =>
    harness.request(path, {
      method: 'POST',
      headers: {
        'cf-access-jwt-assertion': assertion,
        'content-type': 'application/x-www-form-urlencoded',
        origin,
      },
      body: new URLSearchParams(fields).toString(),
    });
  return { ...harness, page, post };
}

describe('admin access', () => {
  it('keeps administration on its existing Access origin while public hosts migrate', async () => {
    const origin = 'https://go.deepseekbot.app';
    const { request } = createHarness({ ADMIN_ORIGIN: origin });
    for (const host of ['https://go.tobs.app', 'https://go.botharness.ai']) {
      for (const method of ['GET', 'HEAD']) {
        const response = await request('/admin/links?campaign=launch', { origin: host, method });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe(`${origin}/admin/links?campaign=launch`);
        expect(response.headers.get('cache-control')).toBe('no-store');
      }
      expect((await request('/admin/links', { origin: host, method: 'POST' })).status).toBe(403);
      expect((await request('/v1/links', { origin: host })).status).toBe(401);
    }
    const destination = await request('/admin', { origin });
    expect(destination.status).not.toBe(200);
    expect(destination.headers.get('location')).toBeNull();
  });

  it('needs a Cloudflare Access JWT and refuses a missing one', async () => {
    const { request } = accessHarness();
    const response = await request('/admin');
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('Campaign');
  });

  it('accepts a valid Access JWT and shows the signed-in e-mail, caching the certs', async () => {
    const { request, jwt, domain } = accessHarness();
    const headers = { 'cf-access-jwt-assertion': await jwt() };
    const response = await request('/admin', { headers });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(await response.text()).toContain('Signed in as owner@botharness.ai');
    await request('/admin', { headers });
    expect(certRequests).toEqual([`https://${domain}/cdn-cgi/access/certs`]);
  });

  it('refuses a wrong audience, wrong issuer, expired token, bad signature or missing e-mail', async () => {
    const { request, jwt } = accessHarness();
    const now = Math.floor(Date.now() / 1000);
    const refused = [
      await jwt({ aud: ['another-app'] }),
      await jwt({ iss: 'https://evil.cloudflareaccess.com' }),
      await jwt({ exp: now - 60, iat: now - 600, nbf: now - 600 }),
      await jwt({}, otherPrivateJwk),
      await jwt({ email: undefined }),
      'not-a-jwt',
    ];
    for (const assertion of refused) {
      const response = await request('/admin', {
        headers: { 'cf-access-jwt-assertion': assertion },
      });
      expect(response.status).toBe(403);
    }
  });

  it('is unavailable when Access is not configured and no dev e-mail is set', async () => {
    const { request } = createHarness();
    expect((await request('/admin')).status).toBe(503);
  });

  it('uses the dev e-mail only when Access is not configured', async () => {
    const dev = createHarness({ ADMIN_DEV_EMAIL: 'dev@localhost' });
    const page = await dev.request('/admin');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('Signed in as dev@localhost');

    const { request } = accessHarness();
    const configured = createHarness({
      ADMIN_DEV_EMAIL: 'dev@localhost',
      ACCESS_TEAM_DOMAIN: 'x.cloudflareaccess.com',
      ACCESS_AUD: AUD,
    });
    expect((await configured.request('/admin')).status).toBe(401);
    expect((await request('/admin')).status).toBe(401);
  });

  it('does not accept a PAT or the bootstrap secret for the admin page', async () => {
    const { request, createToken } = accessHarness();
    const { token } = await createToken('write');
    expect((await request('/admin', { token })).status).toBe(401);
  });
});

describe('admin pages', () => {
  it('refuses cross-site form posts', async () => {
    const { post, sqlite } = await signedIn();
    const response = await post(
      '/admin/campaigns',
      { slug: 'evil', name: 'Evil' },
      'https://evil.example',
    );
    expect(response.status).toBe(403);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM campaigns').get()).toEqual({ n: 0 });
  });

  it('derives a campaign slug from its name and a link slug from platform and media', async () => {
    const { post, page } = await signedIn();
    const created = await post('/admin/campaigns', { slug: '', name: 'PH Launch 2026' });
    expect(created.headers.get('location')).toBe(
      '/admin/campaigns/ph-launch-2026?ok=Campaign+created.',
    );
    const link = await post('/admin/links', {
      campaign: 'ph-launch-2026',
      slug: '',
      platform: 'x',
      media: 'post',
      path: '/',
      language: 'zh',
    });
    expect(link.headers.get('location')).toContain('Created+https%3A%2F%2Fgo.tobs.app%2Fx-post');
    const detail = await (await page('/admin/campaigns/ph-launch-2026')).text();
    expect(detail.indexOf('New link')).toBeLessThan(detail.indexOf('<h2>Links</h2>'));
  });

  it('creates a campaign with two links, shows short URLs and click counts', async () => {
    const { post, page, request } = await signedIn();
    const created = await post('/admin/campaigns', { slug: 'ph-launch', name: 'PH launch' });
    expect(created.status).toBe(303);
    expect(created.headers.get('location')).toBe('/admin/campaigns/ph-launch?ok=Campaign+created.');

    await post('/admin/links', {
      campaign: 'ph-launch',
      slug: 'ph-x-post',
      platform: 'x',
      media: 'post',
      path: '/docs/overview/',
      language: 'en',
      note: '',
    });
    await post('/admin/links', {
      campaign: 'ph-launch',
      slug: 'ph-bili',
      platform: 'bilibili',
      media: 'video',
      path: '/',
      language: 'zh',
    });
    vi.stubGlobal('fetch', async () => new Response('{}'));
    await request('/ph-x-post');
    await request('/ph-x-post');
    await request('/ph-bili');

    const detail = await (await page('/admin/campaigns/ph-launch')).text();
    expect(detail).toContain('data-copy="https://go.tobs.app/ph-x-post"');
    expect(detail).toContain('data-copy="https://go.tobs.app/ph-bili"');
    expect(detail).toContain('3 clicks across 2 links');
    expect(detail).toContain('data-chart="daily"');
    expect(detail).toContain('data-chart="links"');
    expect(detail).toContain('<script type="module" src="/admin/assets/admin-charts.js">');
    const data = JSON.parse(
      /<script type="application\/json" id="chart-data">([\s\S]*?)<\/script>/.exec(detail)?.[1] ??
        '{}',
    ) as { days: string[]; links: { link: string; clicks: number }[] };
    expect(data.days).toHaveLength(30);
    expect(data.links).toEqual(
      expect.arrayContaining([
        { link: 'ph-x-post', clicks: 2 },
        { link: 'ph-bili', clicks: 1 },
      ]),
    );
    expect(detail).toContain(
      'href="https://tobs.app/en/docs/overview/?utm_campaign=ph-launch&amp;utm_source=x&amp;utm_medium=post&amp;utm_content=ph-x-post"',
    );

    const invalid = await post('/admin/links', {
      campaign: 'ph-launch',
      slug: 'Bad Slug',
      platform: 'x',
      media: 'post',
    });
    expect(invalid.headers.get('location')).toMatch(/^\/admin\/campaigns\/ph-launch\?error=slug/);
    const taken = await post('/admin/links', {
      campaign: 'ph-launch',
      slug: 'ph-bili',
      platform: 'x',
      media: 'post',
    });
    expect(taken.headers.get('location')).toBe('/admin/campaigns/ph-launch?error=link-slug-taken');

    await post('/admin/links/ph-bili', { platform: 'bilibili', media: 'video', path: '/market' });
    await post('/admin/links/ph-x-post/archive', {});
    await post('/admin/campaigns/ph-launch', { name: 'Product Hunt launch', description: 'Oct' });
    const after = await (await page('/admin/campaigns/ph-launch')).text();
    expect(after).toContain('Product Hunt launch');
    expect(after).toContain('>/market</a');
    expect(after).toContain('badge off">archived');

    const dashboard = await (await page('/admin')).text();
    expect(dashboard).toContain('href="/admin/campaigns/ph-launch"');

    await post('/admin/campaigns/ph-launch/archive', {});
    expect(await (await page('/admin')).text()).toContain('No campaigns yet.');
  });

  it('escapes user content', async () => {
    const { post, page } = await signedIn();
    await post('/admin/campaigns', { slug: 'xss', name: '<script>alert(1)</script>' });
    const html = await (await page('/admin')).text();
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows a new PAT once, and the PAT works against the API until revoked', async () => {
    const { post, page, request, sqlite } = await signedIn();
    const created = await post('/admin/tokens', {
      name: 'launch agent',
      scope: 'write',
      expiresInDays: '90',
    });
    expect(created.status).toBe(200);
    expect(created.headers.get('cache-control')).toBe('no-store');
    const html = await created.text();
    const token = /value="(bhl_[A-Za-z0-9_-]{43})"/.exec(html)?.[1];
    expect(token).toBeDefined();
    expect(html).toContain('only its hash is stored');
    expect(html).toContain('<dialog open data-modal');
    expect(html).toContain('bh-links login');

    const later = await (await page('/admin')).text();
    expect(later).not.toContain(token as string);
    expect(later).toContain(`${(token as string).slice(0, 12)}…`);
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM tokens').all())).not.toContain(
      token as string,
    );

    const api = await request('/v1/campaigns', {
      method: 'POST',
      token: token as string,
      body: { slug: 'from-agent', name: 'From agent' },
    });
    expect(api.status).toBe(201);

    const id = (sqlite.prepare('SELECT id FROM tokens').get() as { id: string }).id;
    const revoked = await post(`/admin/tokens/${id}/revoke`, {});
    expect(revoked.headers.get('location')).toBe('/admin?ok=Revoked+launch+agent.');
    expect((await request('/v1/campaigns', { token: token as string })).status).toBe(401);

    const never = await post('/admin/tokens', {
      name: 'ci',
      scope: 'read',
      expiresInDays: 'never',
    });
    expect(await never.text()).toMatch(/expires\s+never/);
  });
});
