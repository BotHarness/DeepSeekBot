import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods, createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { createHostRelationships } from '../src/devices/relationships.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { DEVICE_GATEWAY_PREFIX } from '../src/devices/gateway.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { servers, fakeDsh, pair, stream } from './support/device-gateway.js';

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

it('retains the authenticated Owner Human on paired Client messages and refuses revoked writes', async () => {
  const core = createCore({
    dshHome: createTempRoot('gateway-human-context-'),
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
    },
  });
  trackTestOwner(core.operationalDatabase);
  let offPairing: (() => void) | undefined;
  try {
    const methods = createBridgeMethodsForHumans(core);
    const created = methods(core.team.ownerContext()).create({
      displayName: 'Gateway Human',
      persona: 'Short replies',
    });
    expect(created.ok).toBe(true);
    const bot = core.registry.list()[0]!;
    const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, bot.slug, bot.displayName)!;
    const live = await fakeDsh(
      undefined,
      undefined,
      (method, payload) => {
        const current = methods(core.team.ownerContext());
        if (method === 'botharness/channelMessages') return current.channelMessages(payload);
        if (method !== 'botharness/channelSend') throw new Error('unexpected method');
        return current.channelSend(payload);
      },
      undefined,
      core.operationalDatabase,
      () => core.team.ownerContext().humanId,
    );
    const client = await pair(live.base, live.pairing.createOffer().offer);
    const send = (credential = client.body.credential, channelId = channel.id) =>
      fetch(live.base + DEVICE_GATEWAY_PREFIX + '/api/botharness/channelSend', {
        method: 'POST',
        headers: {
          authorization: 'Device ' + credential,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'human-context',
          method: 'botharness/channelSend',
          humanId: 'spoofed-envelope',
          payload: {
            args: { channelId, body: 'Owner message', humanId: 'spoofed-payload' },
          },
        }),
      });
    expect(await (await send()).json()).toMatchObject({ result: { ok: true } });
    const events = () =>
      attachOperationalModule(core.operationalDatabase, 'human-context-test').read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE channel_id = ?').all(channel.id),
      );
    expect(events()).toEqual([{ human_id: OWNER_HUMAN_CONTEXT.humanId }]);
    offPairing = core.team.bindPairing(live.pairing);
    await core.team.setOwnerPassword(OWNER_HUMAN_CONTEXT, 'owner-password-1');
    await core.team.setMode(OWNER_HUMAN_CONTEXT, true);
    const next = await core.team.createMember(OWNER_HUMAN_CONTEXT, 'nextowner', 'Next Owner');
    const nextHuman = humanContext(next.member.humanId);
    await core.team.changePassword(nextHuman, next.initialPassword, 'next-owner-password-1');
    const pending = live.pairing.createOffer();
    await core.team.transferOwner(OWNER_HUMAN_CONTEXT, nextHuman.humanId, 'owner-password-1');
    expect((await send()).status).toBe(401);
    expect(live.pairing.redeem({ offer: pending.offer })).toEqual({
      ok: false,
      code: 'offer-invalid',
    });
    expect(events()).toEqual([{ human_id: OWNER_HUMAN_CONTEXT.humanId }]);
    const relationships = createHostRelationships({
      database: attachOperationalModule(core.operationalDatabase, 'host-relationships'),
      pairing: live.pairing,
    });
    const peer = {
      id: 'trusted-host',
      name: 'Trusted',
      publicKey: 'ab'.repeat(32),
      routes: ['http://127.0.0.1:31002'],
    };
    const relationship = relationships.propose({ peer, direction: 'incoming' });
    relationships.approve(relationship.id, peer.publicKey);
    relationships.activate(relationship.id, peer.publicKey);
    const offer = relationships.enrollment(relationship.id, peer.publicKey, {
      name: 'New Owner derived',
      publicKey: 'cd'.repeat(32),
    });
    const derived = live.pairing.redeem({ offer: offer.offer, publicKey: 'cd'.repeat(32) });
    if (!derived.ok) throw new Error(derived.code);
    const nextBot = core.registry.create({
      slug: 'next-private-bot',
      displayName: 'Next private Bot',
      ownerHumanId: nextHuman.humanId,
    });
    if (!nextBot.ok) throw new Error(nextBot.reason);
    const nextChannel = core.channels.getOrCreateDm(
      nextHuman,
      nextBot.record.slug,
      nextBot.record.displayName,
    )!;
    expect(await (await send(derived.credential, nextChannel.id)).json()).toMatchObject({
      result: { ok: true },
    });
    expect(
      attachOperationalModule(core.operationalDatabase, 'human-context-test').read((db) =>
        db.prepare('SELECT human_id FROM source_events WHERE channel_id = ?').all(nextChannel.id),
      ),
    ).toEqual([{ human_id: nextHuman.humanId }]);
    expect(await (await send(derived.credential, channel.id)).json()).toMatchObject({
      result: { ok: false },
    });
    const hidden = await fetch(
      live.base + DEVICE_GATEWAY_PREFIX + '/api/botharness/channelMessages',
      {
        method: 'POST',
        headers: {
          authorization: 'Device ' + derived.credential,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'private-read',
          method: 'botharness/channelMessages',
          payload: { args: { channelId: channel.id, limit: 10 } },
        }),
      },
    );
    expect(await hidden.json()).toMatchObject({ result: { ok: false } });
    expect(events()).toEqual([{ human_id: OWNER_HUMAN_CONTEXT.humanId }]);
    relationships.disconnect(relationship.id);
    expect((await send(derived.credential, nextChannel.id)).status).toBe(401);
  } finally {
    offPairing?.();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('does not let a paired device manage or inherit Host relationships', async () => {
  const host = await fakeDsh();
  const paired = host.pairing.redeem({ offer: host.pairing.createOffer().offer, name: 'Phone' });
  if (!paired.ok) throw new Error(paired.code);
  for (const endpoint of [
    'botharness/relationships',
    'botharness/%72elationships',
    'botharness//relationships',
  ]) {
    const response = await fetch(`${host.base}/botharness-device/api/${endpoint}`, {
      method: 'POST',
      headers: { authorization: `Device ${paired.credential}` },
      body: JSON.stringify({ action: 'enroll', id: 'forged', desktop: true }),
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'relationship-local-client-required' });
  }
  expect(host.state.seen).toEqual([]);
  expect(host.pairing.admit(`Device ${paired.credential}`).ok).toBe(true);
});

it('never uses the Owner session for a grant that is not bound to the current Owner', async () => {
  let ownerHumanId = OWNER_HUMAN_CONTEXT.humanId;
  const host = await fakeDsh(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    () => ownerHumanId,
  );
  const paired = await pair(host.base, host.pairing.createOffer().offer);
  const authorization = `Device ${paired.body.credential}`;
  const ticket = (await (
    await fetch(`${host.base}/botharness-device/stream-ticket`, {
      method: 'POST',
      headers: { authorization },
    })
  ).json()) as { ticket: string };
  ownerHumanId = 'not-the-owner';
  const refused = { code: 'device-revoked' };
  const unary = await fetch(`${host.base}/botharness-device/api/botharness/list`, {
    method: 'POST',
    headers: { authorization, 'content-type': 'application/json' },
    body: '{"type":"client-request"}',
  });
  expect([unary.status, await unary.json()]).toEqual([401, refused]);
  const avatar = await fetch(
    `${host.base}/botharness-device/api/botharness/bot-avatar?slug=ada&v=portrait-1`,
    { headers: { authorization } },
  );
  expect([avatar.status, await avatar.json()]).toEqual([401, refused]);
  const issued = await fetch(`${host.base}/botharness-device/stream-ticket`, {
    method: 'POST',
    headers: { authorization },
  });
  expect([issued.status, await issued.json()]).toEqual([401, refused]);
  expect(await stream(host.port, { authorization })).toEqual({
    status: 401,
    body: JSON.stringify(refused),
  });
  expect(
    await stream(host.port, {}, `/botharness-device/api/remote.mux?ticket=${ticket.ticket}`),
  ).toEqual({ status: 401, body: JSON.stringify(refused) });
  expect(host.state.mints).toBe(0);
  expect(host.state.seen).toEqual([]);
  expect(host.state.upgrades).toEqual([]);
});

it('attributes Feed acknowledgement to the authenticated device and refuses revoked or missing credentials', async () => {
  const host = await fakeDsh();
  const paired = host.pairing.redeem({ offer: host.pairing.createOffer().offer });
  if (!paired.ok) throw new Error(paired.code);
  const post = (authorization?: string) =>
    fetch(`${host.base}/botharness-device/feed-read`, {
      method: 'POST',
      headers: authorization ? { authorization } : {},
      body: JSON.stringify({ deviceId: 'forged' }),
    });
  expect((await post()).status).toBe(401);
  const response = await post(`Device ${paired.credential}`);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ feedReadAt: expect.any(String) });
  expect(host.pairing.list()).toHaveLength(1);
  expect(host.pairing.list()[0]).toMatchObject({
    id: paired.device.id,
    feedReadAt: expect.any(String),
  });
  host.pairing.revoke(paired.device.id);
  expect((await post(`Device ${paired.credential}`)).status).toBe(401);
});

describe('Local Computer video gateway admission', () => {
  it('binds direct commands to admitted identity and keeps removed web routes refused', async () => {
    const admitted: string[] = [];
    const live = await fakeDsh(undefined, async ({ deviceId }) => {
      admitted.push(deviceId);
      return { ok: false, code: 'media-not-live', error: 'No live picture.' };
    });
    const phone = await pair(live.base, live.pairing.createOffer().offer);
    const credential = `Device ${phone.body.credential}`;
    for (const path of ['/api/computer/video', '/api/computer/%76ideo', '/api//computer/video/']) {
      const answer = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}${path}`, {
        method: 'POST',
        headers: { authorization: credential, 'x-botharness-device-id': 'forged' },
        body: JSON.stringify({ kind: 'status', deviceId: 'forged' }),
      });
      expect(answer.status).toBe(409);
      expect(await answer.json()).toMatchObject({ code: 'media-not-live' });
    }
    for (const path of [
      '/web/api/computer/video',
      '/web/api/computer/%76ideo',
      '/web/api//computer/video/',
    ]) {
      const answer = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}${path}`, {
        method: 'POST',
        headers: { authorization: credential },
        body: '{"kind":"open"}',
      });
      expect(answer.status).toBe(404);
      const upgrade = await stream(
        live.port,
        { authorization: credential },
        `${DEVICE_GATEWAY_PREFIX}${path}`,
      );
      expect(upgrade.status).toBe(404);
    }
    expect(admitted).toEqual([phone.body.deviceId, phone.body.deviceId, phone.body.deviceId]);
    expect(live.state.seen).toHaveLength(0);
    live.pairing.revoke(phone.body.deviceId!);
    const refused = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}/api/computer/video`, {
      method: 'POST',
      headers: { authorization: credential },
      body: '{"kind":"open"}',
    });
    expect(refused.status).toBe(401);
    expect(admitted).toHaveLength(3);
  });

  it('refuses missing owner and oversized commands without proxying through the Host owner', async () => {
    const live = await fakeDsh();
    const phone = await pair(live.base, live.pairing.createOffer().offer);
    for (const [body, code] of [
      ['{"kind":"open"}', 'not-ready'],
      [JSON.stringify({ kind: 'signal', data: 'x'.repeat(128 * 1024) }), 'request-too-large'],
    ] as const) {
      const result = await fetch(`${live.base}${DEVICE_GATEWAY_PREFIX}/api/computer/video`, {
        method: 'POST',
        headers: { authorization: `Device ${phone.body.credential}` },
        body,
      });
      expect(await result.json()).toMatchObject({ code });
    }
    expect(live.state.seen).toHaveLength(0);
  });
});

describe('mobile creation recovery through device admission', () => {
  it.each(['blank', 'git'] as const)(
    'recovers a lost %s create reply with the same Bot and DM and refuses revoked pairing',
    async (kind) => {
      let gitSource: { gitUrl: string; expectedCommit: string } | undefined;
      if (kind === 'git') {
        const directory = createTempRoot('gateway-git-source-');
        const git = (...args: string[]) =>
          execFileSync('git', args, {
            cwd: directory,
            encoding: 'utf8',
            windowsHide: true,
            shell: false,
          }).trim();
        git('init', '--quiet');
        git('config', 'user.name', 'Fixture');
        git('config', 'user.email', 'fixture@example.test');
        writeFileSync(join(directory, 'SOUL.md'), 'Paired imported persona.');
        git('add', '.');
        git('commit', '--quiet', '-m', 'source');
        vi.stubEnv('GIT_CONFIG_COUNT', '1');
        vi.stubEnv('GIT_CONFIG_KEY_0', `url.${directory.replaceAll('\\', '/')}/.insteadOf`);
        vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://gateway.example/source.git');
        gitSource = {
          gitUrl: 'https://gateway.example/source.git',
          expectedCommit: git('rev-parse', 'HEAD'),
        };
      }
      const lookupMethod = kind === 'git' ? 'botImportLookup' : 'createLookup';
      const createMethod = kind === 'git' ? 'createFromGit' : 'create';
      const core = createCore({
        dshHome: createTempRoot('gateway-create-'),
        agents: {
          async runOrchestrator() {},
          async runAssignment() {},
          async close() {},
          requestAssignment() {
            throw new Error('unexpected');
          },
        },
      });
      try {
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
        let drop = true;
        const live = await fakeDsh(undefined, undefined, async (method, payload) => {
          if (method === 'botharness/' + lookupMethod)
            return kind === 'git'
              ? methods.botImportLookup(payload)
              : methods.createLookup(payload);
          const result =
            kind === 'git' ? await methods.createFromGit(payload) : methods.create(payload);
          if (drop) {
            drop = false;
            return 'lost-response';
          }
          return result;
        });
        const phone = await pair(live.base, live.pairing.createOffer().offer);
        const payload = {
          displayName: 'Recovery',
          ...(gitSource ?? { persona: 'Short replies' }),
          description: 'QA',
          roles: ['qa'],
          operationKey: 'device-create-001',
        };
        const call = (method: string) =>
          fetch(live.base + DEVICE_GATEWAY_PREFIX + '/api/botharness/' + method, {
            method: 'POST',
            headers: {
              authorization: 'Device ' + phone.body.credential,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: 'test',
              method: 'botharness/' + method,
              payload: { args: payload },
            }),
          });
        expect(await (await call(lookupMethod)).json()).toMatchObject({
          result: { ok: true, value: { receipt: null } },
        });
        expect(core.registry.list()).toHaveLength(0);
        const lost = await call(createMethod).catch(() => null);
        expect(lost === null || !lost.ok).toBe(true);
        const recovered = await (await call(lookupMethod)).json();
        expect(recovered.result.value.receipt).toMatchObject({
          operationKey: payload.operationKey,
          status: 'created',
        });
        const retried = await (await call(createMethod)).json();
        expect(retried.result.value.receipt).toEqual(recovered.result.value.receipt);
        expect(core.registry.list()).toHaveLength(1);
        expect(core.channels.list()).toHaveLength(1);
        live.pairing.revoke(phone.body.deviceId!);
        expect((await call(lookupMethod)).status).toBe(401);
        expect(core.registry.list()).toHaveLength(1);
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );
});

it('admits activity operations by credential, ignoring caller-supplied device identity', async () => {
  const admitted: string[] = [];
  const live = await fakeDsh(undefined, undefined, undefined, async (input) => {
    admitted.push(input.deviceId);
    return { status: 200, body: { accepted: true } };
  });
  const paired = live.pairing.redeem({ offer: live.pairing.createOffer().offer, name: 'Phone' });
  if (!paired.ok) throw new Error('pairing failed');
  const url = `${live.base}/botharness-device/activity/register`;
  expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401);
  expect(admitted).toHaveLength(0);
  const request = () =>
    fetch(url, {
      method: 'POST',
      headers: { authorization: `Device ${paired.credential}` },
      body: JSON.stringify({ deviceId: 'other-device', token: 'private-token' }),
    });
  expect((await request()).status).toBe(200);
  expect(admitted).toEqual([paired.device.id]);
  live.pairing.revoke(paired.device.id);
  expect((await request()).status).toBe(401);
  expect(admitted).toHaveLength(1);
});
