import { createServer } from 'node:http';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { setup, CLIENT_ID } from '../../../packages/connect-relay/test/support';
import { createConnectAccount } from '../src/host/connect-account';

it('releases an offline slot through the mobile owner and HTTP relay without clearing local data', async () => {
  const revoked: string[] = [];
  const { relay, call, tokenFor, row } = await setup(undefined, {
    revokeSession: async (id) => {
      revoked.push(id);
    },
  });
  const oldToken = await tokenFor('user_alice', { sid: 'session_old' });
  const phoneToken = await tokenFor('user_alice', { sid: 'session_phone' });
  const bobToken = await tokenFor('user_bob', { sid: 'session_bob' });
  const old = await call('POST', '/v1/hosts', {
    token: oldToken,
    body: { name: 'Offline laptop' },
  });
  for (let i = 0; i < 4; i++)
    expect(
      (await call('POST', '/v1/hosts', { token: phoneToken, body: { name: `Computer ${i}` } }))
        .status,
    ).toBe(201);
  const register = (token: string) =>
    call('POST', '/v1/hosts', { token, body: { name: 'New computer' } });
  expect((await register(phoneToken)).body.error.code).toBe('host-limit');
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks);
    const result = await relay.fetch(
      new Request(`https://connect.botharness.ai${req.url}`, {
        method: req.method ?? 'GET',
        headers: { authorization: req.headers.authorization ?? '' },
        ...(body.length ? { body } : {}),
      }),
    );
    res.writeHead(result.status, Object.fromEntries(result.headers));
    res.end(Buffer.from(await result.arrayBuffer()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing HTTP address');
  const localRelay = `http://127.0.0.1:${address.port}`;
  let cleanupCalls = 0;
  const localData = { paired: ['offline-laptop', 'manual-computer'], bots: ['local-bot'] };
  const before = JSON.stringify(localData);
  const owner = (subject: string, token: string) => {
    let session: string | null = JSON.stringify({
      clientId: CLIENT_ID,
      subject,
      sessionId: subject === 'user_alice' ? 'session_phone' : 'session_bob',
      refreshToken: 'test-refresh',
      email: `${subject}@example.invalid`,
    });
    return createConnectAccount({
      relay: localRelay,
      redirectUri: 'fixture:/callback',
      removeConnections: async () => {
        cleanupCalls++;
        localData.paired.length = 0;
      },
      runtime: {
        read: async () => session,
        write: async (value) => {
          session = value;
        },
        random: () => 'fixture',
        challenge: async (value) => value,
        authorize: async () => null,
        now: () => Date.parse('2026-10-20T12:00:00Z'),
        request: (url, init) =>
          url === 'https://api.workos.com/user_management/authenticate'
            ? Promise.resolve(Response.json({ access_token: token, user: { id: subject } }))
            : fetch(url, init),
      },
    });
  };
  try {
    const phone = owner('user_alice', phoneToken),
      bob = owner('user_bob', bobToken);
    const key = await phone.actionKey(),
      bobKey = await bob.actionKey();
    if (!key || !bobKey) throw new Error('Missing account key');
    const hosts = await phone.hosts();
    expect(hosts.ok && hosts.value.length).toBe(5);
    expect(hosts.ok && hosts.value.find((host) => host.id === old.body.host.id)?.online).toBe(
      false,
    );
    expect(await bob.revokeHost(bobKey, old.body.host.id)).toEqual({
      ok: false,
      code: 'host-not-found',
      diagnostic: {
        code: 'host-not-found',
        phase: 'account-action',
        status: 404,
        occurredAt: expect.any(String),
      },
    });
    expect(await row(old.body.host.id)).not.toBeNull();
    expect(await phone.revokeHost(key, old.body.host.id)).toEqual({
      ok: true,
      value: { sessionKnown: true, sessionRevoked: true },
    });
    expect(await row(old.body.host.id)).toBeNull();
    expect(revoked).toEqual(['session_old']);
    expect((await register(oldToken)).body.error.code).toBe('session-revoked');
    expect((await register(phoneToken)).status).toBe(201);
    const refreshed = await phone.hosts();
    expect(refreshed.ok && refreshed.value.length).toBe(5);
    expect(await phone.email()).toBe('user_alice@example.invalid');
    expect(cleanupCalls).toBe(0);
    expect(JSON.stringify(localData)).toBe(before);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
