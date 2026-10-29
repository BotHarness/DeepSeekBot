import { afterEach, describe, expect, it, vi } from 'vitest';
import { app } from '../src/worker.js';

const forwarded: Request[] = [];
afterEach(() => {
  forwarded.length = 0;
  vi.unstubAllGlobals();
});
const stubPostHog = (response = new Response('{"status":1}')) =>
  vi.stubGlobal('fetch', async (input: URL, init: RequestInit) => {
    forwarded.push(new Request(input, init));
    return response.clone();
  });

describe('telemetry ingest proxy', () => {
  it('forwards events to PostHog US with the client address and without our cookies', async () => {
    stubPostHog(new Response('{"status":1}', { headers: { 'set-cookie': 'ph=1' } }));
    const response = await app.request('https://t.botharness.ai/e/?compression=gzip-js', {
      method: 'POST',
      body: 'payload',
      headers: {
        cookie: 'session=secret',
        'cf-connecting-ip': '203.0.113.9',
        'x-forwarded-for': '198.51.100.1, 203.0.113.9',
        'content-type': 'text/plain',
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toBeNull();
    const [request] = forwarded;
    expect(request?.url).toBe('https://us.i.posthog.com/e/?compression=gzip-js');
    expect(request?.headers.get('cookie')).toBeNull();
    expect(request?.headers.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(await request?.text()).toBe('payload');
  });

  it('serves posthog-js assets and remote config from the US asset host', async () => {
    stubPostHog();
    await app.request('https://t.botharness.ai/static/array.js');
    await app.request('https://t.botharness.ai/array/phc_key/config.js');
    expect(forwarded.map((request) => request.url)).toEqual([
      'https://us-assets.i.posthog.com/static/array.js',
      'https://us-assets.i.posthog.com/array/phc_key/config.js',
    ]);
  });

  it('allows the product site and local dev origins, not others', async () => {
    stubPostHog();
    const preflight = (origin: string) =>
      app.request('https://t.botharness.ai/e/', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST' },
      });
    expect(
      (await preflight('https://deepseekbot.botharness.ai')).headers.get(
        'access-control-allow-origin',
      ),
    ).toBe('https://deepseekbot.botharness.ai');
    for (const site of ['https://tobs.app', 'https://deepseekbot.app', 'https://deepseekbot.dev'])
      expect((await preflight(site)).headers.get('access-control-allow-origin')).toBe(site);
    expect(
      (await preflight('http://localhost:5173')).headers.get('access-control-allow-origin'),
    ).toBe('http://localhost:5173');
    for (const other of [
      'https://evil.example',
      'https://tobs.app.evil.example',
      'https://deepseekbot.app.evil.example',
      'https://deepseekbot.example',
    ])
      expect((await preflight(other)).headers.get('access-control-allow-origin')).toBeNull();
    expect(forwarded).toHaveLength(0);
  });
});

describe('legacy event names', () => {
  it('renames events and properties from clients released before the tracking plan', async () => {
    stubPostHog();
    await app.request('https://t.botharness.ai/batch/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: 'phc_test',
        batch: [
          {
            event: 'daily_usage',
            properties: { source: 'plugin', plugin_version: '1.4.1', messages: 3, sessions: 1 },
          },
          { event: 'tutorial_action', properties: { source: 'plugin', action: 'continue' } },
          { event: 'marketplace_bot_installed', properties: { source: 'plugin', from: 'hot' } },
          { event: 'mobile_app_opened', properties: { source: 'mobile', launch_kind: 'cold' } },
          { event: 'app:host_start', properties: { source: 'host', app_version: '1.6.0' } },
          { event: '$exception', properties: { source: 'plugin', plugin_version: '1.3.1' } },
        ],
      }),
    });
    const sent = (await forwarded[0]!.json()) as {
      api_key: string;
      batch: { event: string; properties: Record<string, unknown> }[];
    };
    expect(sent.api_key).toBe('phc_test');
    expect(sent.batch).toEqual([
      {
        event: 'app:usage_report',
        properties: { source: 'host', app_version: '1.4.1', message_count: 3, session_count: 1 },
      },
      { event: 'onboarding:tutorial_resume', properties: { source: 'host' } },
      { event: 'marketplace:bot_install', properties: { source: 'host', entry: 'hot' } },
      { event: 'app:app_open', properties: { source: 'mobile', launch_kind: 'cold' } },
      { event: 'app:host_start', properties: { source: 'host', app_version: '1.6.0' } },
      { event: '$exception', properties: { source: 'host', app_version: '1.3.1' } },
    ]);
  });

  it('forwards compressed and non-JSON bodies untouched', async () => {
    stubPostHog();
    await app.request('https://t.botharness.ai/batch/?compression=gzip-js', {
      method: 'POST',
      body: 'gzip-bytes',
    });
    await app.request('https://t.botharness.ai/batch/', { method: 'POST', body: 'data=abc' });
    expect(await forwarded[0]!.text()).toBe('gzip-bytes');
    expect(await forwarded[1]!.text()).toBe('data=abc');
  });

  it('maps every old name to a well-formed tracking-plan name', async () => {
    const { LEGACY_EVENT_NAMES } = await import('../src/taxonomy.js');
    const { TELEMETRY_EVENTS, RESERVED_TELEMETRY_EVENTS, telemetryNameIsWellFormed } =
      await import('../../core/src/telemetry/events.js');
    for (const [from, to] of Object.entries(LEGACY_EVENT_NAMES)) {
      expect(telemetryNameIsWellFormed(to), `${from} -> ${to}`).toBe(true);
      if (
        from.startsWith('intro_') ||
        ['plugin_started', 'daily_usage', 'bot_created', 'marketplace_bot_installed'].includes(from)
      )
        expect(
          Object.hasOwn(TELEMETRY_EVENTS, to) ||
            (RESERVED_TELEMETRY_EVENTS as readonly string[]).includes(to),
        ).toBe(true);
    }
  });
});
