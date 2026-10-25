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
