import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { avatarDataUrl } from '../../market/test/avatar-fixtures.js';
import { createBotAvatarHttp } from '../src/bots/avatar-http.js';
import { admin, createMarket, post, solve } from '../../market/test/market-harness.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { solveChallenge } from '../src/marketplace/altcha.js';
import { createMarketplaceClient } from '../src/marketplace/client.js';
import {
  createInstallReceipts,
  ensureMarketplaceHostId,
} from '../src/marketplace/install-receipts.js';
import { DEEPSEEKBOT_RECIPE } from '../src/onboarding/service.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const alice = humanContext('alice');
const manager = humanContext('manager');
const member = humanContext('member');
const closes = new Set<() => Promise<void>>();

afterEach(async () => {
  vi.restoreAllMocks();
  for (const close of closes) await close();
  closes.clear();
});

type Market = ReturnType<typeof createMarket>;

function makeHost(market: Market, dshHome = createTempRoot('market-avatar-apply-')) {
  const core = createCore({
    dshHome,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  const close = async () => {
    if (!closes.delete(close)) return;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  closes.add(close);
  const send = vi.fn<typeof fetch>((input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    return market.request(url.pathname + url.search, init);
  });
  const marketplace = createMarketplaceClient({ baseUrl: 'https://market.test', fetchImpl: send });
  const dataDir = join(dshHome, 'marketplace');
  const marketplaceReceipts = createInstallReceipts({ client: marketplace, dataDir });
  const methods = createBridgeMethodsForHumans({ ...core, marketplace, marketplaceReceipts });
  return { core, close, send, marketplace, methods, dataDir, dshHome };
}

async function publish(market: Market, type: 'png' | 'webp' = 'png'): Promise<string> {
  const headers = { authorization: 'Bearer token-alice', 'content-type': 'application/json' };
  expect(
    (
      await market.request('/v1/me', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ displayName: 'River Artist', acceptTerms: true }),
      })
    ).ok,
  ).toBe(true);
  const created = await market.request('/v1/avatars', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: type,
      image: avatarDataUrl(type),
      requestKey: randomUUID(),
      confirm: true,
    }),
  });
  expect(created.status).toBe(201);
  return (await created.json()).avatar.id;
}

const target = (id: string, bot = 'first') => ({ id, bot });

function count(market: Market, id: string) {
  return async () => (await (await market.request(`/v1/avatars/${id}`)).json()).avatar.applyCount;
}

async function expectAvatar(host: ReturnType<typeof makeHost>, slug: string, type: 'png' | 'webp') {
  const profile = host.methods(owner).get({ slug });
  if (!profile.ok || !profile.value.bot.avatar) throw new Error('Bot has no Avatar');
  const response = await createBotAvatarHttp(host.core.registry)(
    new Request(new URL(profile.value.bot.avatar, 'http://host.test')),
  );
  expect(response.headers.get('content-type')).toBe(`image/${type}`);
  expect(Buffer.from(await response.arrayBuffer()).toString('base64')).toBe(
    avatarDataUrl(type).split(',')[1],
  );
}

function bot(host: ReturnType<typeof makeHost>, slug: string, ownerHumanId = owner.humanId) {
  expect(host.core.registry.create({ slug, displayName: slug, ownerHumanId }).ok).toBe(true);
}

function team(host: ReturnType<typeof makeHost>) {
  const { core } = host;
  attachOperationalModule(core.operationalDatabase, 'market-avatar-test').transaction((sql) => {
    sql.prepare('UPDATE team_settings SET enabled=1').run();
    for (const human of [alice, manager, member]) {
      sql
        .prepare("INSERT INTO humans VALUES (?,?,'active','now')")
        .run(human.humanId, human.humanId);
      sql.prepare("INSERT INTO human_roles VALUES (?,'member')").run(human.humanId);
    }
  });
  for (const human of [alice, manager, member]) core.team.spaces.ensureAccount(human.humanId);
  const role = core.team.roles.create(owner, 'Bot manager', ['bots.manageAll']).role;
  core.team.roles.set(owner, manager.humanId, ['member', role.roleId]);
}

it('writes one local copy, counts distinct Bots across two Hosts, and reads after restart offline', async () => {
  const market = createMarket();
  const id = await publish(market);
  const other = await publish(market, 'webp');
  const host = makeHost(market);
  bot(host, 'first');
  bot(host, 'second');
  const bridge = host.methods(owner);
  expect(host.core.registry.setAppearance('first', DEEPSEEKBOT_RECIPE).ok).toBe(true);
  const apply = async (id: string, slug = 'first') =>
    expect(await bridge.marketplaceAvatarApply(target(id, slug))).toEqual({
      ok: true,
      value: { applied: true },
    });

  expect(bridge.marketplaceAvatarApplyCandidates({})).toMatchObject({
    value: {
      bots: expect.arrayContaining([
        expect.objectContaining({
          slug: 'first',
          displayName: 'first',
          avatar: expect.any(String),
          hasAppearance: true,
        }),
      ]),
    },
  });
  await apply(id);
  const profile = bridge.get({ slug: 'first' });
  await expectAvatar(host, 'first', 'png');
  if (!profile.ok) throw new Error(profile.error.code);
  expect(profile.ok && profile.value.bot).not.toHaveProperty('appearance');
  expect(bridge.list({})).toMatchObject({
    value: {
      bots: expect.arrayContaining([
        expect.objectContaining({ slug: 'first', avatar: profile.value.bot.avatar }),
      ]),
    },
  });
  await expect.poll(count(market, id)).toBe(1);
  const sent = host.send.mock.calls.find(([url]) => String(url).endsWith('/applies'));
  const botHash = createHash('sha256')
    .update(JSON.stringify([ensureMarketplaceHostId(host.dataDir), 'first']))
    .digest('hex');
  expect(JSON.parse(String(sent?.[1]?.body))).toEqual({ botHash });
  expect(new Headers(sent?.[1]?.headers).has('authorization')).toBe(false);

  await Promise.all([apply(id), apply(id)]);
  await apply(other);
  await expect.poll(count(market, other)).toBe(1);
  await apply(id);
  expect(await count(market, id)()).toBe(1);
  await apply(id, 'second');
  await expect.poll(count(market, id)).toBe(2);

  const remote = makeHost(market);
  bot(remote, 'first');
  expect((await remote.methods(owner).marketplaceAvatarApply(target(id))).ok).toBe(true);
  await expectAvatar(remote, 'first', 'png');
  await expect.poll(count(market, id)).toBe(3);

  await host.close();
  const reopened = makeHost(market, host.dshHome);
  reopened.send.mockRejectedValue(new Error('offline'));
  expect(reopened.methods(owner).get({ slug: 'first' })).toEqual(profile);
  await expectAvatar(reopened, 'first', 'png');
  expect(reopened.send).not.toHaveBeenCalled();
}, 75_000);

it('uses manual Avatar permissions and audit, with no cross-owner authority for Bot callers', async () => {
  const market = createMarket();
  const id = await publish(market);
  const host = makeHost(market);
  team(host);
  bot(host, 'first');
  bot(host, 'private', alice.humanId);
  bot(host, 'managed', manager.humanId);
  const candidates = (human: Parameters<typeof host.methods>[0]) => {
    const result = host.methods(human).marketplaceAvatarApplyCandidates({});
    return result.ok ? result.value.bots.map(({ slug }) => slug).sort() : result;
  };
  expect(candidates(owner)).toEqual(['first', 'managed', 'private']);
  expect(candidates(alice)).toEqual(['private']);
  expect(candidates(manager)).toEqual(['first', 'managed', 'private']);
  expect(candidates(member)).toEqual([]);
  const caller = { ...manager, caller: 'bot' as const };
  expect(candidates(caller)).toEqual(['managed']);
  for (const human of [alice, member, caller])
    expect(await host.methods(human).marketplaceAvatarApply(target(id))).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
  expect(host.send).not.toHaveBeenCalled();
  expect(host.methods(owner).get({ slug: 'first' })).toMatchObject({ ok: true });
  expect(host.core.registry.get('first')?.avatar).toBeUndefined();

  expect((await host.methods(alice).marketplaceAvatarApply(target(id, 'private'))).ok).toBe(true);
  expect((await host.methods(manager).marketplaceAvatarApply(target(id))).ok).toBe(true);
  expect((await host.methods(owner).marketplaceAvatarApply(target(id, 'private'))).ok).toBe(true);
  expect((await host.methods(caller).marketplaceAvatarApply(target(id, 'managed'))).ok).toBe(true);
  expect(await host.methods(owner).auditLog({})).toMatchObject({
    value: {
      records: expect.arrayContaining([
        expect.objectContaining({
          viewerHumanId: manager.humanId,
          objectId: 'first',
          action: 'botAvatarSet',
        }),
        expect.objectContaining({
          viewerHumanId: owner.humanId,
          objectId: 'private',
          action: 'botAvatarSet',
        }),
      ]),
    },
  });
}, 45_000);

it('rechecks the target and roles after image fetch and sends no receipt on refusal or write failure', async () => {
  const market = createMarket();
  const id = await publish(market);
  const host = makeHost(market);
  team(host);
  bot(host, 'first');
  bot(host, 'removed');
  const imageFetch = host.marketplace.avatarImage;
  const hook = vi.spyOn(host.marketplace, 'avatarImage');
  hook.mockImplementationOnce(async (id) => {
    const image = await imageFetch(id);
    host.core.team.roles.set(owner, manager.humanId, ['member']);
    return image;
  });
  expect(await host.methods(manager).marketplaceAvatarApply(target(id))).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
  hook.mockImplementationOnce(async (id) => {
    const image = await imageFetch(id);
    const preview = host.methods(owner).deletionPreview({ slug: 'removed' });
    if (!preview.ok) throw new Error(preview.error.code);
    const deleted = await host
      .methods(owner)
      .deletionConfirm({ slug: 'removed', token: preview.value.preview.token, eraseMemory: false });
    if (!deleted.ok) throw new Error(deleted.error.code);
    return image;
  });
  expect(await host.methods(owner).marketplaceAvatarApply(target(id, 'removed'))).toMatchObject({
    ok: false,
    error: { code: 'bot-not-found' },
  });
  for (const bytes of [new Uint8Array([0, 1, 2]), new Uint8Array(131_073)]) {
    host.send.mockResolvedValueOnce(new Response(bytes));
    expect(await host.methods(owner).marketplaceAvatarApply(target(id))).toMatchObject({
      ok: false,
      error: { code: 'unprocessed-image' },
    });
  }
  vi.spyOn(host.core.registry, 'update').mockImplementationOnce(() => {
    throw new Error('disk full');
  });
  await expect(host.methods(owner).marketplaceAvatarApply(target(id))).rejects.toThrow('disk full');
  expect(host.send.mock.calls.filter(([url]) => String(url).endsWith('/applies'))).toEqual([]);
  expect(host.core.registry.get('first')?.avatar).toBeUndefined();
  expect(await count(market, id)()).toBe(0);
});

it('preserves the applied Tob avatar through report takedown, block and deletion despite a lost receipt', async () => {
  const market = createMarket({ env: { REPORT_THRESHOLD: '2' } });
  const id = await publish(market);
  const host = makeHost(market);
  const { botSlug } = await host.core.tob.ensure();
  const receipt = vi
    .spyOn(host.marketplace, 'avatarApplyReceipt')
    .mockRejectedValue(new Error('offline'));
  const bridge = host.methods(owner);
  expect((await bridge.marketplaceAvatarApply(target(id, botSlug))).ok).toBe(true);
  expect(receipt).toHaveBeenCalledTimes(1);
  expect(bridge.get({ slug: botSlug })).toMatchObject({
    value: { bot: { tob: { defaultAvatar: false } } },
  });
  const challenge = await bridge.marketplaceChallenge();
  if (!challenge.ok) throw new Error('No reporting challenge');
  const proof = await solveChallenge(challenge.value);
  expect(await bridge.marketplaceAvatarReport({ id, altcha: proof, reason: 'spam' })).toEqual({
    ok: true,
    value: { received: true },
  });
  const ip = '203.0.113.2';
  expect(
    (await post(market, `/v1/avatars/${id}/reports`, { altcha: await solve(market, ip) }, ip))
      .status,
  ).toBe(202);

  const expectUnavailable = async () => {
    expect(await bridge.marketplaceAvatarApply(target(id, botSlug))).toMatchObject({
      ok: false,
      error: { code: 'avatar-not-found', message: 'This Avatar is no longer available.' },
    });
    await expectAvatar(host, botSlug, 'png');
  };
  await expectUnavailable();
  expect((await admin(market, { kind: 'avatar', id, action: 'restore' })).status).toBe(200);
  expect((await admin(market, { kind: 'avatar', id, action: 'block' })).status).toBe(200);
  await expectUnavailable();
  expect(
    (
      await market.request(`/v1/me/avatars/${id}`, {
        method: 'DELETE',
        headers: { authorization: 'Bearer token-alice' },
      })
    ).status,
  ).toBe(200);
  await expectUnavailable();
  expect(receipt).toHaveBeenCalledTimes(1);
}, 45_000);

it('replays a successful operation key on the same Host without overwriting a later Avatar', async () => {
  const market = createMarket();
  const id = await publish(market);
  const other = await publish(market, 'webp');
  const host = makeHost(market);
  bot(host, 'first');
  const bridge = host.methods(owner);
  const request = { ...target(id), operationKey: 'apply-first' };
  const replies = await Promise.all([
    bridge.marketplaceAvatarApply(request),
    bridge.marketplaceAvatarApply(request),
  ]);
  expect(replies.every((reply) => reply.ok)).toBe(true);
  expect(host.send.mock.calls.filter(([url]) => String(url).endsWith('/image'))).toHaveLength(1);
  expect((await bridge.marketplaceAvatarApply(target(other))).ok).toBe(true);
  expect((await bridge.marketplaceAvatarApply(request)).ok).toBe(true);
  await expectAvatar(host, 'first', 'webp');
  expect(await bridge.marketplaceAvatarApply({ ...request, id: other })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
});
