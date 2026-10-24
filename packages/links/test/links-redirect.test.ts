import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from './links-harness.js';

const captured: Request[] = [];
afterEach(() => {
  captured.length = 0;
  vi.unstubAllGlobals();
});
const stubPostHog = (respond: () => Promise<Response> = async () => new Response('{"status":1}')) =>
  vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
    captured.push(new Request(input, init));
    return respond();
  });

async function seeded(overrides: Parameters<typeof createHarness>[0] = {}) {
  const harness = createHarness(overrides);
  const { token } = await harness.createToken('write');
  await harness.request('/v1/campaigns', {
    method: 'POST',
    token,
    body: { slug: 'ph-launch', name: 'Product Hunt launch' },
  });
  await harness.request('/v1/links', {
    method: 'POST',
    token,
    body: {
      slug: 'ph-x-post',
      campaign: 'ph-launch',
      platform: 'x',
      media: 'post',
      path: '/docs/overview/',
      language: 'en',
    },
  });
  await harness.request('/v1/links', {
    method: 'POST',
    token,
    body: { slug: 'bili-video', campaign: 'ph-launch', platform: 'bilibili', media: 'video' },
  });
  return { ...harness, token };
}

describe('campaign link redirect', () => {
  it('redirects with the campaign UTMs, counts the click and sends link_clicked without a person', async () => {
    stubPostHog();
    const { request, token } = await seeded();

    const response = await request('/ph-x-post');
    expect(response.status).toBe(302);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('location')).toBe(
      'https://tobs.app/en/docs/overview/?utm_campaign=ph-launch&utm_source=x&utm_medium=post&utm_content=ph-x-post',
    );

    const [event] = captured;
    expect(event?.url).toBe('https://us.i.posthog.com/i/v0/e/');
    const body = (await event?.json()) as Record<string, unknown> & {
      properties: Record<string, unknown>;
    };
    expect(body.api_key).toBe('phc_test');
    expect(body.event).toBe('link_clicked');
    expect(body.distinct_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.properties).toEqual({
      source: 'links',
      campaign: 'ph-launch',
      link: 'ph-x-post',
      platform: 'x',
      media: 'post',
      language: 'en',
      $process_person_profile: false,
      $geoip_disable: true,
    });

    await request('/ph-x-post');
    const second = captured[1] ? ((await captured[1].json()) as { distinct_id: string }) : null;
    expect(second?.distinct_id).not.toBe(body.distinct_id);

    const clicks = (await (await request('/v1/links/ph-x-post/clicks', { token })).json()) as {
      total: number;
      daily: { day: string; clicks: number }[];
    };
    expect(clicks.total).toBe(2);
    expect(clicks.daily).toEqual([{ day: new Date().toISOString().slice(0, 10), clicks: 2 }]);
  });

  it('opens a zh link at the path as is', async () => {
    stubPostHog();
    const { request } = await seeded();
    expect((await request('/bili-video')).headers.get('location')).toBe(
      'https://tobs.app/?utm_campaign=ph-launch&utm_source=bilibili&utm_medium=video&utm_content=bili-video',
    );
  });

  it('still redirects and counts when PostHog fails or is not configured', async () => {
    stubPostHog(async () => {
      throw new Error('network down');
    });
    const { request, token } = await seeded();
    expect((await request('/bili-video')).status).toBe(302);

    const unconfigured = await seeded({ POSTHOG_KEY: '' });
    captured.length = 0;
    expect((await unconfigured.request('/bili-video')).status).toBe(302);
    expect(captured).toHaveLength(0);

    const clicks = (await (await request('/v1/links/bili-video/clicks', { token })).json()) as {
      total: number;
    };
    expect(clicks.total).toBe(1);
  });

  it('sends unknown, archived and reserved slugs to the site root without UTMs or counting', async () => {
    stubPostHog();
    const { request, token, sqlite } = await seeded();
    for (const path of ['/nope', '/health', '/Not_Valid']) {
      const response = await request(path);
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('https://tobs.app/');
    }
    await request('/v1/links/ph-x-post/archive', { method: 'POST', token });
    expect((await request('/ph-x-post')).headers.get('location')).toBe('https://tobs.app/');
    await request('/v1/campaigns/ph-launch/archive', { method: 'POST', token });
    expect((await request('/bili-video')).headers.get('location')).toBe('https://tobs.app/');
    expect(captured).toHaveLength(0);
    expect(sqlite.prepare('SELECT SUM(clicks) AS total FROM links').get()).toEqual({ total: 0 });
  });

  it('redirects link previewers and crawlers with UTMs without counting them', async () => {
    stubPostHog();
    const { request, sqlite } = await seeded();
    const previewers = [
      'Twitterbot/1.0',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
      'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'TelegramBot (like TwitterBot)',
      'WhatsApp/2.23.20.0',
      'LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Applebot/0.1',
      'Mozilla/5.0 (compatible; Embedly/0.2; +http://support.embed.ly/)',
      'Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)',
      'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)',
      'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)',
      'some-crawler/1.0',
      'LinkPreview/1.0',
    ];
    for (const userAgent of previewers) {
      const response = await request('/bili-video', { userAgent });
      expect(response.status, userAgent).toBe(302);
      expect(response.headers.get('location'), userAgent).toContain('utm_content=bili-video');
    }
    expect(captured).toHaveLength(0);
    expect(sqlite.prepare('SELECT SUM(clicks) AS total FROM links').get()).toEqual({ total: 0 });

    const people = [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.47(0x18002f2c) NetType/WIFI Language/zh_CN',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (Linux; Android 10; CUBOT_X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
    ];
    for (const userAgent of people) await request('/bili-video', { userAgent });
    expect(captured).toHaveLength(people.length);
    expect(sqlite.prepare('SELECT SUM(clicks) AS total FROM links').get()).toEqual({
      total: people.length,
    });
    for (const event of captured) expect(await event.text()).not.toMatch(/Mozilla|user.?agent/i);
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM links').all())).not.toMatch(/Mozilla/);
  });

  it('does not count HEAD requests', async () => {
    stubPostHog();
    const { request, sqlite } = await seeded();
    const response = await request('/bili-video', { method: 'HEAD' });
    expect(response.status).toBe(302);
    expect(captured).toHaveLength(0);
    expect(sqlite.prepare('SELECT SUM(clicks) AS total FROM links').get()).toEqual({ total: 0 });
  });

  it('redirects the bare domain to the product site', async () => {
    const { request } = createHarness();
    const response = await request('/');
    expect(response.headers.get('location')).toBe('https://tobs.app/');
  });
});

describe('Tobs migration compatibility', () => {
  it('shares short codes, authentication and clicks across new and legacy hosts', async () => {
    stubPostHog();
    const { request, token } = await seeded();
    for (const origin of [
      'https://go.tobs.app',
      'https://go.botharness.ai',
      'https://go.deepseekbot.app',
    ]) {
      const response = await request('/ph-x-post', { origin });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe(
        'https://tobs.app/en/docs/overview/?utm_campaign=ph-launch&utm_source=x&utm_medium=post&utm_content=ph-x-post',
      );
      expect((await request('/v1/links', { origin })).status).toBe(401);
      expect((await request('/v1/links', { origin, token })).status).toBe(200);
      expect((await request('/admin', { origin })).status).not.toBe(200);
    }
    expect(captured).toHaveLength(3);
    const links = await (await request('/v1/links', { token })).json();
    expect(JSON.stringify(links)).toContain('https://go.tobs.app/ph-x-post');
  });
});
