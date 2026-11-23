import { afterEach, describe, expect, it } from 'vitest';
import { createHostClient, type HostClient } from '@botharness/host-client/client';
import { parsePairingLink, redeemPairing } from '@botharness/host-client/pairing';
import { checkRoute } from '@botharness/host-protocol/route';
import { SECRET_ROUTE_METHODS } from '../../../packages/core/src/bridge/secret-route';
import { openLocalStore } from '@botharness/host-client/local-store';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import { nodeSqlConnection } from './node-sql-connection';

import { LOOPBACK, ROUTE, until } from './host-client-fixtures';

let client: HostClient | undefined;

afterEach(() => client?.stop());

function connect(
  host: FakeHost,
  credential = host.credential,
  routes = [ROUTE, LOOPBACK],
): HostClient {
  client = createHostClient({
    routes,
    credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  return client;
}

describe('Host client', () => {
  it('connects when the Host requires an explicit JSON media type for RPC requests', async () => {
    const host = new FakeHost();
    const mediaTypes: Array<string | undefined> = [];
    client = createHostClient({
      routes: [LOOPBACK],
      credential: host.credential,
      carrier: {
        ...host.carrier,
        request: (url, init) => {
          if (init.method === 'POST' && url.includes('/api/botharness/')) {
            mediaTypes.push(init.headers?.['content-type']);
            if (init.headers?.['content-type'] !== 'application/json')
              return Promise.resolve({ status: 415, text: async () => 'Unsupported Media Type' });
          }
          return host.carrier.request(url, init);
        },
      },
      backoff: () => 5,
      timeoutMs: 200,
    });
    client.start();
    const snapshot = await until(client, (state) => state.connection.status === 'connected');
    expect(snapshot.roster?.bots.length).toBeGreaterThan(0);
    expect(mediaTypes.length).toBeGreaterThan(0);
    expect(mediaTypes.every((mediaType) => mediaType === 'application/json')).toBe(true);
  });

  it('labels JSON resource requests without changing bodyless reads or binary uploads', async () => {
    const host = new FakeHost();
    const resourceHeaders: Array<Record<string, string> | undefined> = [];
    client = createHostClient({
      routes: [LOOPBACK],
      credential: host.credential,
      carrier: {
        ...host.carrier,
        request: (url, init) => {
          if (url.endsWith('/api/computer/qa-json')) {
            resourceHeaders.push(init.headers);
            const accepted =
              init.method === 'GET'
                ? init.headers?.['content-type'] === undefined
                : init.headers?.['content-type'] === 'application/json';
            return Promise.resolve({ status: accepted ? 200 : 415, text: async () => '{}' });
          }
          if (url.includes('/attachment/upload'))
            expect(init.headers?.['content-type']).toBe('application/octet-stream');
          return host.carrier.request(url, init);
        },
      },
      backoff: () => 5,
      timeoutMs: 200,
    });
    client.start();
    await until(client, (state) => state.connection.status === 'connected');
    expect((await client.api('/api/computer/qa-json', { body: { value: true } })).status).toBe(200);
    expect((await client.api('/api/computer/qa-json')).status).toBe(200);
    await client.upload('qa.txt', new Blob(['qa']));
    expect(resourceHeaders).toEqual([
      { authorization: `Device ${host.credential}`, 'content-type': 'application/json' },
      { authorization: `Device ${host.credential}` },
    ]);
  });

  it.each(['channelChangeCursor', 'channelListChanges'])(
    'connects to an older Host whose optional %s endpoint returns HTTP 404',
    async (method) => {
      const store = await openLocalStore(nodeSqlConnection());
      if (method === 'channelListChanges')
        await store.write((tx) => tx.run("insert into list_cursor values (1, 'old', 1)"));
      const host = new FakeHost();
      client = createHostClient({
        routes: [ROUTE],
        credential: host.credential,
        carrier: {
          ...host.carrier,
          request: (url, init) =>
            url.endsWith(`/${method}`)
              ? Promise.resolve({ status: 404, text: async () => 'Not Found' })
              : host.carrier.request(url, init),
        },
        localStore: () => Promise.resolve(store),
        backoff: () => 5,
        timeoutMs: 200,
      });
      try {
        client.start();
        const snapshot = await until(client, (state) => state.connection.status === 'connected');
        expect(snapshot.roster?.bots.length).toBeGreaterThan(0);
        expect(host.calls.some((call) => call.method === 'channels')).toBe(true);
      } finally {
        client.stop();
        await store.close();
      }
    },
  );

  it('asks to pair again when the Host revokes this phone, closing its live stream', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.revoke();
    const refused = await until(target, (s) => s.connection.status === 'refused');
    expect(refused.connection).toMatchObject({ code: 'device-revoked' });
    const attempts = host.requests.length;
    target.retryNow('resume');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(host.requests.length).toBe(attempts);
  });

  it.each([
    [401, 'credentials-invalid', 'sign-in-required'],
    [401, 'sign-in-required', 'sign-in-required'],
    [403, 'member-suspended', 'member-suspended'],
  ] as const)(
    'stops retrying and names why a Team Host refused this member (%i %s)',
    async (status, code, expected) => {
      const host = new FakeHost();
      const target = connect(host);
      await until(target, (s) => s.connection.status === 'connected');
      host.teamRefusal = { status, code };
      host.revoke();
      const refused = await until(target, (s) => s.connection.status === 'refused');
      expect(refused.connection).toMatchObject({ code: expected });
      const attempts = host.requests.length;
      target.retryNow('resume');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(host.requests.length).toBe(attempts);
    },
  );

  it('stops at a member refusal that an upload meets first', async () => {
    const host = new FakeHost();
    const target = connect(host);
    await until(target, (s) => s.connection.status === 'connected');
    host.teamRefusal = { status: 403, code: 'member-suspended' };
    await expect(target.upload('qa.txt', new Blob(['qa']))).rejects.toThrow();
    expect(target.getSnapshot().connection).toMatchObject({
      status: 'refused',
      code: 'member-suspended',
    });
  });

  it('asks to pair again when the Host does not know this phone', async () => {
    const host = new FakeHost();
    const target = connect(host, 'device-9.unknown');
    const snapshot = await until(target, (s) => s.connection.status === 'refused');
    expect(snapshot.connection).toMatchObject({ code: 'device-unknown' });
  });

  it('never exposes the device credential in its published state', async () => {
    const host = new FakeHost();
    const target = connect(host);
    const states: string[] = [];
    target.subscribe(() => states.push(JSON.stringify(target.getSnapshot())));
    await until(target, (s) => s.connection.status === 'connected');
    host.revoke();
    await until(target, (s) => s.connection.status === 'refused');
    expect(states.join('\n')).not.toContain('secret-1');
  });
});

describe('route check', () => {
  it('accepts tailnet HTTPS and loopback like the live CLI', () => {
    expect(checkRoute('https://studio.tailnet-example.ts.net/')).toEqual({
      ok: true,
      origin: 'https://studio.tailnet-example.ts.net',
    });
    expect(checkRoute('http://127.0.0.1:3080')).toEqual({
      ok: true,
      origin: 'http://127.0.0.1:3080',
    });
    expect(checkRoute('http://studio.tailnet-example.ts.net').ok).toBe(false);
    expect(checkRoute('https://example.com').ok).toBe(false);
    expect(checkRoute('https://studio.deepseekbot.dev')).toEqual({
      ok: true,
      origin: 'https://studio.deepseekbot.dev',
    });
    expect(checkRoute('http://studio.deepseekbot.dev').ok).toBe(false);
    expect(checkRoute('https://a.studio.deepseekbot.dev').ok).toBe(false);
    expect(checkRoute('https://studio.deepseekbot.dev:8443').ok).toBe(false);
    expect(checkRoute('https://studio.tailnet-example.ts.net/?token=x').ok).toBe(false);
  });
});

function link(payload: Record<string, unknown>, scheme = 'deepseekbot'): string {
  return `${scheme}://pair?p=${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

describe('pairing', () => {
  const payload = {
    v: 1,
    host: { id: 'host-1', name: 'studio' },
    offer: 'offer-1',
    routes: [ROUTE, 'http://evil.example', LOOPBACK],
    expiresAt: '2099-01-01T00:00:00.000Z',
  };

  it.each(['deepseekbot', 'deepseekbot-dev'])(
    'reads %s QR/paste links with the same payload and refusal boundaries',
    (scheme) => {
      expect(parsePairingLink(link(payload, scheme))).toEqual({
        ok: true,
        payload: {
          host: payload.host,
          offer: 'offer-1',
          routes: [ROUTE, LOOPBACK],
          expiresAt: payload.expiresAt,
        },
      });
      const encryption = { protocol: 'connect-noise-xk-v1', publicKey: 'a'.repeat(64) };
      expect(parsePairingLink(link({ ...payload, encryption }, scheme))).toMatchObject({
        ok: true,
        payload: { encryption },
      });
      expect(parsePairingLink(`${scheme}://pair?p=not-json`)).toEqual({
        ok: false,
        code: 'link-invalid',
      });
      expect(parsePairingLink('https://example.com/?p=x')).toEqual({
        ok: false,
        code: 'link-invalid',
      });
      expect(
        parsePairingLink(link({ ...payload, expiresAt: '2000-01-01T00:00:00Z' }, scheme)),
      ).toEqual({
        ok: false,
        code: 'link-expired',
      });
      expect(
        parsePairingLink(link({ ...payload, routes: ['http://8.8.8.8:3000'] }, scheme)),
      ).toEqual({
        ok: false,
        code: 'no-route',
      });
    },
  );

  it('redeems the offer once through the first route that answers', async () => {
    const host = new FakeHost();
    host.unreachable.add(ROUTE);
    const parsed = parsePairingLink(link(payload));
    if (!parsed.ok) throw new Error('link rejected');
    const paired = await redeemPairing({
      payload: parsed.payload,
      deviceName: 'iPhone',
      carrier: host.carrier,
    });
    expect(paired).toEqual({
      ok: true,
      host: {
        hostId: 'host-1',
        hostName: 'studio',
        routes: [LOOPBACK, ROUTE],
        deviceId: 'device-1',
        credential: host.credential,
      },
    });
    expect(
      await redeemPairing({ payload: parsed.payload, deviceName: 'iPhone', carrier: host.carrier }),
    ).toEqual({ ok: false, code: 'offer-invalid', detail: 'remote:refused-offer-invalid' });
  });
});

describe('Connect secret preflight', () => {
  it.each(SECRET_ROUTE_METHODS)(
    'refuses %s before serializing or sending a request',
    async (endpoint) => {
      const host = new FakeHost();
      client = createHostClient({
        routes: ['https://safety.deepseekbot.dev'],
        credential: host.credential,
        carrier: host.carrier,
      });
      const args = {
        toJSON() {
          throw new Error('must not serialize secret');
        },
      };
      await expect(client.call(endpoint, args)).rejects.toMatchObject({
        code: 'secret-route-refused',
      });
      expect(host.requests).toEqual([]);
    },
  );
  it.each([ROUTE, LOOPBACK])('preserves secret submission on %s', async (route) => {
    const host = new FakeHost();
    host.methods.set('privateInputSubmit', () => ({ accepted: true }));
    client = createHostClient({
      routes: [route],
      credential: host.credential,
      carrier: host.carrier,
    });
    await expect(
      client.call('privateInputSubmit', { values: { key: 'synthetic-only' } }),
    ).resolves.toEqual({ accepted: true });
    expect(host.requests).toHaveLength(1);
  });
});
