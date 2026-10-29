import { describe, expect, it } from 'vitest';
import { createActivityApns } from '../src/activity-apns.js';

describe('ActivityKit APNs transport', () => {
  it('refuses absent/invalid provider configuration before registration', async () => {
    expect(await createActivityApns({}).capability()).toBeUndefined();
    expect(
      await createActivityApns({
        teamId: 'TEAM123456',
        keyId: 'KEY1234567',
        privateKey: 'invalid',
        bundleIdentifier: 'app.deepseekbot.mobile',
        environment: 'production',
      }).capability(),
    ).toBeUndefined();
  });
  it('sends only fixed-topic ActivityKit content and bounded terminal retention', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ]);
    const privateKey = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
    const sent: { url: string; init: RequestInit }[] = [];
    const sender = createActivityApns({
      teamId: 'TEAM123456',
      keyId: 'KEY1234567',
      privateKey,
      bundleIdentifier: 'app.deepseekbot.mobile',
      environment: 'sandbox',
      fetch: async (url, init) => {
        sent.push({ url: String(url), init: init! });
        return new Response('', { status: 200 });
      },
    });
    expect(await sender.capability()).toEqual({ bundleIdentifier: 'app.deepseekbot.mobile' });
    const before = Math.floor(Date.now() / 1000);
    await sender.send({
      token: 'a'.repeat(64),
      source: 'abcd12',
      state: 'completed',
      terminal: true,
      timestamp: 123,
      updatedAt: '2026-10-26T00:00:00Z',
      locale: 'zh',
    });
    expect(sent[0]?.url).toBe(`https://api.sandbox.push.apple.com/3/device/${'a'.repeat(64)}`);
    expect(sent[0]?.init.headers).toMatchObject({
      'apns-push-type': 'liveactivity',
      'apns-topic': 'app.deepseekbot.mobile.push-type.liveactivity',
    });
    const body = JSON.parse(String(sent[0]?.init.body));
    expect(body.aps).toMatchObject({
      event: 'end',
      timestamp: 123,
      'content-state': { name: 'TobsRequest' },
    });
    expect(body.aps['dismissal-date']).toBeGreaterThanOrEqual(before + 120);
    expect(body.aps['dismissal-date']).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 120);
    expect(
      Number(new Headers(sent[0]?.init.headers).get('apns-expiration')),
    ).toBeGreaterThanOrEqual(before + 300);
    expect(JSON.parse(body.aps['content-state'].props)).toEqual({
      state: 'completed',
      source: 'abcd12',
      updatedAt: '2026-10-26T00:00:00Z',
      locale: 'zh',
    });
  });
});
