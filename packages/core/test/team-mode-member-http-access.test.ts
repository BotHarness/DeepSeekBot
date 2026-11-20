import { createDevicePairing } from '../src/devices/pairing.js';
import {
  noisePublicKey,
  noiseFingerprint,
  NOISE_PROTOCOL,
} from '@botharness/host-protocol/noise/xk';
import { CONNECT_PROTOCOL } from '@botharness/host-protocol/noise/channel';
import { randomBytes } from 'node:crypto';
import {
  createRelationshipHttp,
  RELATIONSHIP_ACTIONS,
  RELATIONSHIPS_PATH,
} from '../src/devices/relationship-http.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import {
  REMOTE_CUSTODY_ACTIONS,
  REMOTE_CUSTODY_PATH,
  REMOTE_CUSTODY_STREAM_PATH,
} from '../src/devices/remote-custody-http.js';
import { createRelationshipControl } from '../src/devices/relationship-control.js';
import { IncomingMessage, request as httpRequest } from 'node:http';
import { Socket } from 'node:net';
import { passwordTransportAllowed, TEAM_PATH } from '../src/team/http.js';
import { API_PATH, HostConnectionService, Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamError } from '../src/team/service.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { closes, teamFixture, enabledFixture, memberHttp, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('member HTTP carrier', { timeout: 60_000 }, () => {
  it('routes only Memory images through the authenticated member Gateway', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const http = await memberHttp(f);
    const cookie = (await http.signIn('bob', 'member-password-1')).headers.get('set-cookie') ?? '';
    const bytes = Buffer.from('bounded-image');
    const invoke = vi
      .spyOn(f.gateway, 'invoke')
      .mockResolvedValue({ mime: 'image/png', dataBase64: bytes.toString('base64') });
    const imageUrl = `${http.origin}${TEAM_PATH}/api/botharness/memory/image?slug=own&path=image.png&source=worktree&revision=${'a'.repeat(64)}`;
    const response = await fetch(imageUrl, { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('content-security-policy')).toContain('sandbox');
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        namespace: 'botharness',
        method: 'memoryImage',
        args: { slug: 'own', path: 'image.png', source: 'worktree', revision: 'a'.repeat(64) },
        peer: expect.objectContaining({
          principal: expect.objectContaining({ humanId: f.human.humanId }),
        }),
      }),
    );
    invoke.mockRejectedValue(new TeamError('bot-not-found'));
    const refused = await fetch(imageUrl, { headers: { cookie } });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ code: 'bot-not-found' });
    invoke.mockClear();
    expect((await fetch(imageUrl)).status).toBe(401);
    const native = await fetch(`${http.origin}${TEAM_PATH}/api/dsh-session/read`, {
      headers: { cookie },
    });
    expect(native.status).toBe(403);
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each(['member', 'admin'])(
    'never exposes Host relationships to an authenticated %s carrier',
    async (role) => {
      const f = await enabledFixture();
      await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
      f.team.roles.set(owner, f.human.humanId, [role]);
      const http = await memberHttp(f);
      const cookie =
        (await http.signIn('bob', 'member-password-1')).headers.get('set-cookie') ?? '';
      expect(RELATIONSHIP_ACTIONS).toEqual(
        expect.arrayContaining(['initiate', 'approve', 'enroll', 'disconnect']),
      );
      for (const action of ['list', ...RELATIONSHIP_ACTIONS]) {
        const response = await fetch(`${http.origin}${TEAM_PATH}/api/botharness/relationships`, {
          method: action === 'list' ? 'GET' : 'POST',
          headers: { cookie, 'content-type': 'application/json' },
          ...(action === 'list'
            ? {}
            : { body: JSON.stringify({ action, id: 'a'.repeat(32), confirm: true }) }),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ code: 'remote-access/denied' });
        expect(await http.rpc(cookie, 'relationships', { action })).toMatchObject({
          result: { ok: false },
        });
      }
      expect(f.database.read((db) => db.prepare('SELECT * FROM host_relationships').all())).toEqual(
        [],
      );
      expect(
        f.database.read((db) => db.prepare('SELECT * FROM relationship_device_grants').all()),
      ).toEqual([]);
    },
  );
  it('refuses Member and Admin peers at the DSH shared fetch gate for the registered relationship route', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const admin = await f.team.createMember(owner, 'carol', 'Carol');
    await f.team.changePassword(
      humanContext(admin.member.humanId),
      admin.initialPassword,
      'admin-password-1',
    );
    f.team.roles.set(owner, admin.member.humanId, ['admin']);
    const pairing = createDevicePairing({
      database: f.database,
      hostName: 'Test',
      ownerHumanId: () => f.team.ownerContext().humanId,
    });
    const relationships = createHostRelationships({ database: f.database, pairing });
    const privateKey = randomBytes(32);
    const publicKey = noisePublicKey(privateKey);
    const control = createRelationshipControl({
      relationships,
      pairing,
      identity: {
        key: async () => Uint8Array.from(privateKey),
        publicIdentity: async () => ({
          protocol: CONNECT_PROTOCOL,
          noise: NOISE_PROTOCOL,
          required: true,
          publicKey: Buffer.from(publicKey).toString('hex'),
          fingerprint: noiseFingerprint(publicKey),
        }),
      },
      routes: async () => ['http://127.0.0.1:1'],
    });
    closes.push(async () => control.close());
    const reached = vi.fn(createRelationshipHttp(control));
    const connection = new HostConnectionService(f.ctx, ['localhost'], {} as never);
    connection.fetch.register({
      path: RELATIONSHIPS_PATH,
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: reached,
    });
    const shared = connection.createSharedFetchHandler(API_PATH);
    const call = (peer: Peer, action: string) =>
      shared.fetch(
        new Request(`http://localhost${RELATIONSHIPS_PATH}`, {
          method: action === 'list' ? 'GET' : 'POST',
          headers: { 'content-type': 'application/json' },
          ...(action === 'list'
            ? {}
            : {
                body: JSON.stringify({
                  action,
                  id: 'a'.repeat(32),
                  link: 'https://example.invalid/pair',
                  confirmedKey: 'b'.repeat(64),
                  publicKey: 'c'.repeat(64),
                  name: 'Laptop',
                  generation: 'g1',
                  confirm: true,
                }),
              }),
        }),
        peer,
      );
    const bob = await f.team.signIn('bob', 'member-password-1', '127.0.0.1');
    const carol = await f.team.signIn('carol', 'admin-password-1', '127.0.0.1');
    expect(f.team.roles.permissions(humanContext(carol.member.humanId)).length).toBeGreaterThan(
      f.team.roles.permissions(f.human).length,
    );
    for (const { peer } of [bob, carol])
      for (const action of ['list', ...RELATIONSHIP_ACTIONS]) {
        const response = await call(peer as Peer, action);
        expect(response.status).toBe(403);
        expect(await response.text()).toBe('forbidden');
      }
    expect(reached).not.toHaveBeenCalled();
    expect(f.database.read((db) => db.prepare('SELECT * FROM host_relationships').all())).toEqual(
      [],
    );
    expect(
      f.database.read((db) => db.prepare('SELECT * FROM relationship_device_grants').all()),
    ).toEqual([]);
    expect(pairing.list()).toEqual([]);
    const ownerPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    const listed = await call(ownerPeer, 'list');
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual({ relationships: [] });
    const approve = await call(ownerPeer, 'approve');
    expect(approve.status).toBe(409);
    expect(await approve.json()).toEqual({ code: expect.stringMatching(/^relationship-/u) });
    expect(reached).toHaveBeenCalledTimes(2);
  });
  it('keeps Remote Host credential custody away from Member and Admin peers at the DSH shared fetch gate', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const admin = await f.team.createMember(owner, 'carol', 'Carol');
    await f.team.changePassword(
      humanContext(admin.member.humanId),
      admin.initialPassword,
      'admin-password-1',
    );
    f.team.roles.set(owner, admin.member.humanId, ['admin']);
    const reached = vi.fn(async () => Response.json({ ok: true }));
    const connection = new HostConnectionService(f.ctx, ['localhost'], {} as never);
    connection.fetch.register({
      path: REMOTE_CUSTODY_PATH,
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: reached,
    });
    connection.fetch.register({
      path: REMOTE_CUSTODY_STREAM_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: reached,
    });
    const shared = connection.createSharedFetchHandler(API_PATH);
    const handle = 'custody.' + 'a'.repeat(43);
    const calls = [
      ...REMOTE_CUSTODY_ACTIONS.map(
        (action) => () =>
          new Request(`http://localhost${REMOTE_CUSTODY_PATH}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action, handle, url: 'https://example.invalid/' }),
          }),
      ),
      () => new Request(`http://localhost${REMOTE_CUSTODY_STREAM_PATH}?socket=${'b'.repeat(24)}`),
    ];
    const bob = await f.team.signIn('bob', 'member-password-1', '127.0.0.1');
    const carol = await f.team.signIn('carol', 'admin-password-1', '127.0.0.1');
    for (const { peer } of [bob, carol])
      for (const call of calls) {
        const response = await shared.fetch(call(), peer as Peer);
        expect(response.status).toBe(403);
        expect(await response.text()).toBe('forbidden');
      }
    expect(reached).not.toHaveBeenCalled();
    const ownerPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    expect((await shared.fetch(calls[0]!(), ownerPeer)).status).toBe(200);
    expect(reached).toHaveBeenCalledTimes(1);
  });
  it('allows cross-site top-level entry navigation but refuses cross-site subresources and POSTs', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const navigate = await new Promise<number>((resolve, reject) => {
      const request = httpRequest(
        `${http.origin}${TEAM_PATH}/`,
        {
          headers: {
            'sec-fetch-site': 'cross-site',
            'sec-fetch-mode': 'navigate',
            'sec-fetch-dest': 'document',
          },
        },
        (response) => {
          response.resume();
          response.once('end', () => resolve(response.statusCode ?? 0));
        },
      );
      request.once('error', reject);
      request.end();
    });
    expect(navigate).toBe(200);
    const embedded = await fetch(`${http.origin}${TEAM_PATH}/`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    expect(embedded.status).toBe(403);
    const post = await http.signIn('bob', f.initialPassword, {
      'sec-fetch-site': 'cross-site',
      'sec-fetch-dest': 'document',
    });
    expect(post.status).toBe(403);
    expect(await post.json()).toEqual({ code: 'origin-refused' });
  });

  it('enforces transport and the shared IP/account budget on RPC password changes', async () => {
    const f = await enabledFixture();
    const local = await memberHttp(f);
    const cookie = (await local.signIn('bob', f.initialPassword)).headers.get('set-cookie') ?? '';
    const remote = await memberHttp(f, true);
    f.team.setInsecureHttp(owner, true);
    f.team.setInsecureHttp(owner, false);
    expect(
      await remote.rpc(cookie, 'memberPasswordChange', {
        current: f.initialPassword,
        next: 'member-password-1',
      }),
    ).toMatchObject({ result: { ok: false, error: { code: 'insecure-transport' } } });
    for (let i = 0; i < 4; i++)
      expect(
        await local.rpc(cookie, 'memberPasswordChange', {
          current: 'wrong-password',
          next: 'member-password-1',
        }),
      ).toMatchObject({ result: { error: { code: 'credentials-invalid' } } });
    const limited = await local.password(cookie, f.initialPassword, 'member-password-1');
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ code: 'rate-limited', retryAfterSeconds: 60 });
  });

  it('reserves stream keys and peer/global capacity while gateway opens are pending', async () => {
    const started = performance.now();
    const phases: Array<{ phase: string; elapsedMs: number }> = [];
    const phase = (value: string) =>
      phases.push({ phase: value, elapsedMs: performance.now() - started });
    let now = 0;
    const f = await enabledFixture({ now: () => now });
    phase('fixture-ready');
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const cookies: string[] = [];
    for (let i = 0; i < 17; i++) {
      now += 60_000;
      const login = await f.team.signIn('bob', 'member-password-1', `ip-${i}`);
      cookies.push(`botharness-member=${login.token}`);
      phase(`signed-in-${i + 1}`);
    }
    const releases: Array<() => void> = [];
    const opened = vi
      .spyOn(f.gateway.wireStream, 'open')
      .mockImplementation(
        () =>
          new Promise<AsyncIterable<unknown>>((resolve) =>
            releases.push(() => resolve((async function* () {})())),
          ),
      );
    const http = await memberHttp(f);
    phase('server-listening');
    http.server.once('close', () => phase('server-closed'));
    const open = (cookie: string, id: number) =>
      http.wire(cookie, {
        op: 'stream-open',
        id,
        endpoint: 'botharness/followRoster',
        payload: { args: {} },
      });
    const requests: Array<Promise<PromiseSettledResult<Response>>> = [];
    const observe = async (request: Promise<Response>): Promise<PromiseSettledResult<Response>> => {
      try {
        return { status: 'fulfilled', value: await request };
      } catch (reason) {
        return { status: 'rejected', reason };
      }
    };
    let primary: unknown;
    try {
      const deadline = performance.now() + 10000;
      for (const [index, cookie] of cookies.slice(0, 16).entries()) {
        for (let id = 1; id <= 16; id++) requests.push(observe(open(cookie, id)));
        const remaining = deadline - performance.now();
        if (remaining <= 0) throw new Error('pending-stream-capacity-deadline');
        await vi.waitFor(
          () => {
            expect(performance.now()).toBeLessThanOrEqual(deadline);
            expect(opened).toHaveBeenCalledTimes((index + 1) * 16);
          },
          { timeout: remaining, interval: 10 },
        );
        phase(`pending-${(index + 1) * 16}`);
      }
      phase('all-pending-open');
      expect(opened).toHaveBeenCalledTimes(256);
      expect((await open(cookies[0]!, 1)).status).toBe(429);
      expect((await open(cookies[0]!, 17)).status).toBe(429);
      expect((await open(cookies[16]!, 1)).status).toBe(429);
      expect(opened).toHaveBeenCalledTimes(256);
    } catch (error) {
      primary = error;
    } finally {
      for (const release of releases) release();
    }
    const results = await Promise.all(requests);
    const failures = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    phase('requests-settled');
    if (primary !== undefined || failures.length)
      throw new AggregateError(
        [
          new Error(
            JSON.stringify({ phases, opened: opened.mock.calls.length, refused: failures.length }),
          ),
          ...(primary === undefined ? [] : [primary]),
          ...failures,
        ],
        'pending-stream-capacity-failed',
      );
  });

  it('releases a failed or cancelled pending stream reservation', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    const http = await memberHttp(f);
    const cookie = `botharness-member=${login.token}`;
    const opened = vi
      .spyOn(f.gateway.wireStream, 'open')
      .mockRejectedValueOnce(new Error('open-failed'))
      .mockResolvedValue((async function* () {})());
    const request = {
      op: 'stream-open',
      id: 1,
      endpoint: 'botharness/followRoster',
      payload: { args: {} },
    };
    expect(await (await http.wire(cookie, request)).json()).toHaveProperty('failure');
    expect(await (await http.wire(cookie, request)).json()).toEqual({});
    expect(opened).toHaveBeenCalledTimes(2);
  });
  it('requires trusted transport for forwarding headers on IPv4, mapped IPv4 and IPv6 loopback', () => {
    const f = teamFixture();
    for (const address of ['127.0.0.1', '127.42.0.1', '::ffff:127.0.0.1', '::1']) {
      const socket = new Socket();
      Object.defineProperty(socket, 'remoteAddress', { value: address });
      const request = new IncomingMessage(socket);
      expect(passwordTransportAllowed(request, { team: f.team, tls: () => false })).toBe(true);
      for (const name of [
        'forwarded',
        'x-forwarded-for',
        'x-forwarded-proto',
        'x-forwarded-host',
        'x-forwarded-port',
        'x-real-ip',
        'via',
      ]) {
        request.headers = {
          [name]: '',
          'x-forwarded-proto': 'https',
          'x-botharness-device-route': 'untrusted',
        };
        expect(
          passwordTransportAllowed(request, { team: f.team, tls: () => false }),
          `${address}: ${name}`,
        ).toBe(false);
      }
      socket.destroy();
    }
  });
  it.each(['forwarded', 'x-forwarded-for', 'x-real-ip', 'via'])(
    'refuses an untrusted loopback proxy carrying %s but permits Host-known encrypted hops',
    async (name) => {
      const f = await enabledFixture();
      const plain = await memberHttp(f);
      const headers = { [name]: '192.0.2.5', 'x-forwarded-proto': 'https' };
      const denied = await plain.signIn('bob', f.initialPassword, headers);
      expect(denied.status).toBe(403);
      expect(await denied.json()).toEqual({ code: 'insecure-transport' });
      const tls = await memberHttp(f, false, true);
      expect((await tls.signIn('bob', f.initialPassword, headers)).status).toBe(200);
      const connect = await memberHttp(f, false, false, true);
      expect((await connect.signIn('bob', f.initialPassword, headers)).status).toBe(200);
      f.team.setInsecureHttp(owner, true);
      expect((await plain.signIn('bob', f.initialPassword, headers)).status).toBe(200);
    },
  );
});

describe('member entry addresses', () => {
  it('offers only non-loopback HTTPS addresses even with the insecure HTTP opt-in', () => {
    const entry = (origin: string) => `${origin}${TEAM_PATH}/`;
    const https = [
      'https://192.168.1.20:5050',
      'https://host.tail.ts.net',
      'https://[fd00::20]:5050',
    ].map(entry);
    const lan = [
      'http://192.168.1.20:5050',
      'http://10.0.0.20:5050',
      'http://172.16.0.20:5050',
    ].map(entry);
    const rejected = [
      'http://127.0.0.1:5050',
      'https://127.42.0.1:5050',
      'https://localhost:5050',
      'https://localhost.:5050',
      'https://foo.localhost:5050',
      'https://[::1]:5050',
      'https://[::ffff:127.0.0.1]:5050',
      'https://0.0.0.0:5050',
      'https://[::]:5050',
      'http://host.example:5050',
      'http://203.0.113.5:5050',
      'ftp://192.168.1.20:5050',
      'https://user:secret@192.168.1.20:5050',
    ].map(entry);
    const f = teamFixture({
      urls: () => [...https, ...lan, ...rejected, 'not-a-url', `${https[0]}?token=private`],
    });
    expect(f.team.mode(owner).memberUrls).toEqual(https);
    f.team.setInsecureHttp(owner, true);
    expect(f.team.mode(owner).memberUrls).toEqual(https);
    f.team.setInsecureHttp(owner, false);
    expect(f.team.mode(owner).memberUrls).toEqual(https);
    const local = teamFixture({ urls: () => [entry('http://127.0.0.1:5050')] });
    expect(local.team.mode(owner).memberUrls).toEqual([]);
  });
});
