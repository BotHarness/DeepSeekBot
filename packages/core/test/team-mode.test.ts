import { DatabaseSync } from 'node:sqlite';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createDevicePairing } from '../src/devices/pairing.js';
import { createServer, IncomingMessage, request as httpRequest } from 'node:http';
import { Socket } from 'node:net';
import { readFileSync } from 'node:fs';
import { createChannelLiveHub } from '../src/channels/live.js';
import { openLiveFrames } from '../src/channels/live-frames.js';
import { createChannelManagement } from '../src/channels/management.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { stampConnectRoute } from '../src/devices/route-context.js';
import { createTeamHttp, passwordTransportAllowed, TEAM_PATH } from '../src/team/http.js';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { TeamService, TeamError } from '../src/team/service.js';
import { ARGON2_PARAMS, hashPassword, verifyPassword } from '../src/team/password.js';
import * as passwords from '../src/team/password.js';
import { SignInRateLimit } from '../src/team/rate-limit.js';
import { memberPolicy } from '../src/team/policy.js';
import {
  MEMBER_GLOBAL_METHODS,
  MEMBER_BOT_METHODS,
  MEMBER_CHANNEL_METHODS,
  MEMBER_METHODS,
} from '../src/team/member-methods.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { composerRecoveryIdentity } from '../src/bridge/composer-recovery.js';
import { registerBridge, resolveInvocationHuman } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTempRoot, createTestOwnership } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});

function teamFixture(options: { urls?: () => string[]; now?: () => number } = {}) {
  const root = createTempRoot('team-mode-');
  const registry = createTestRegistry({ rootDir: root });
  const db = registryDatabase(root);
  const database = attachOperationalModule(db, 'team');
  const channels = createSqliteChannelStore({ database, rootDir: join(root, 'channels') });
  let placements: Array<{ sourceEventId: string; channelId: string; messageId: string }> = [];
  const team = new TeamService(database, channels, {
    now: options.now ?? (() => Date.parse('2026-11-14T00:00:00Z')),
  });
  const live = createChannelLiveHub(
    channels,
    undefined,
    () => placements,
    undefined,
    (human) => team.isOwner(human),
  );
  const ctx = new Context();
  const peers: Peer[] = [];
  const invalidate = vi.fn();
  const off = team.bindRuntime({
    createPeer: (principal) => {
      const peer = new Peer(ctx, { principal });
      peers.push(peer);
      return peer;
    },
    invalidate,
    urls: options.urls ?? (() => ['https://host.test/botharness-device/team/']),
  });
  closes.push(async () => {
    live.close();
    await off();
    await ctx.fiber.dispose();
    db.close();
  });
  const methods = createBridgeMethodsForHumans({
    registry,
    channels,
    team,
    states: createBotStateTracker(),
    ownership: createTestOwnership(),
    roster: createTestRosterStore({ database: db }),
    humanAttention: createHumanAttentionQuery(database),
    composerIdentity: (human = owner) =>
      composerRecoveryIdentity(
        join(root, 'composer-host-id'),
        join(root, 'composer-profile-id'),
        human.humanId,
      ),
    channelManagement: createChannelManagement({
      database,
      registry,
      channels,
      isProtectedBot: () => false,
    }),
    createBotId: () => 'ada',
  });
  registerBridge(
    ctx,
    methods,
    undefined,
    {
      followRoster: (human, signal) => live.followRoster(human, signal),
      followActivity: (human, signal) => live.followActivity(human, signal),
      followChannel: (human, id, limit, signal, drafts) =>
        live.followChannel(human, id, limit, signal, drafts),
      journalPage: (human, id, request) => channels.readHumanJournalPage(human, id, request),
      filesPage: (human, id, request) => channels.readHumanFilesPage(human, id, request),
      changes: (human, id, request) => channels.readHumanChanges?.(human, id, request),
      changeCursor: () => channels.changeCursor?.(),
      async *followCompanion() {},
    },
    team,
  );
  ctx.provide('typert');
  ctx.set('typert', {
    local: { get: () => undefined, hasSeen: () => false },
    lookups: {
      definitions: () => [
        { key: 'botharness-public-flag', parameter: 'publicValue', wire: 'public' },
      ],
      get: (key: string) =>
        key === 'botharness-public-flag'
          ? { wire: 'public', resolve: (value: unknown) => z.boolean().parse(value) }
          : undefined,
    },
    resources: { entries: () => [] },
  });
  const access = new RemoteAccessService(ctx);
  access.registerPolicy('botharness-member', memberPolicy(team));
  const gateway = new TypertGatewayService(ctx, {});
  return {
    team,
    channels,
    database,
    db,
    methods,
    peers,
    ctx,
    gateway,
    access,
    invalidate,
    registry,
    live,
    setPlacements(value: typeof placements) {
      placements = value;
    },
  };
}

async function enabledFixture(options: Parameters<typeof teamFixture>[0] = {}) {
  const fixture = teamFixture(options);
  await fixture.team.setOwnerPassword(owner, 'owner-password-1');
  await fixture.team.setMode(owner, true);
  const created = await fixture.team.createMember(owner, 'bob', 'Bob');
  return { ...fixture, ...created, human: humanContext(created.member.humanId) };
}

class NativeSession extends TypertRemoteService {
  constructor(ctx: Context) {
    super(ctx, 'nativeSession', { namespace: 'session' });
  }
  list() {
    return { sessions: ['owner-session'] };
  }
}
Object.defineProperty(NativeSession.prototype, '@deepseek-ai/dsh-typert-protocol/remote-methods', {
  value: { version: 1, methods: [{ method: 'list', invocation: { kind: 'direct' } }] },
});

describe('Host members', { timeout: 60_000 }, () => {
  it('recovers a committed member only as Owner and revokes every previous grant', async () => {
    const f = await enabledFixture();
    const login = await f.team.signIn('bob', f.initialPassword, 'ip');
    await expect(f.team.resetPassword(f.human, f.human.humanId)).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'owner' },
    });
    await expect(f.team.resetPassword(owner, owner.humanId)).rejects.toMatchObject({
      code: 'owner-protected',
    });
    await expect(f.team.resetPassword(owner, 'missing-member')).rejects.toMatchObject({
      code: 'member-not-found',
    });
    const reset = await f.gateway.invoke({
      namespace: 'botharness',
      method: 'memberPasswordReset',
      args: { humanId: f.human.humanId },
      peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
    });
    const result = z.object({ initialPassword: z.string() }).strict().parse(reset);
    expect(login.peer.signal.aborted).toBe(true);
    expect(f.team.admit(login.token)).toBeUndefined();
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
    await expect(f.team.signIn('bob', f.initialPassword, 'another')).rejects.toMatchObject({
      code: 'credentials-invalid',
    });
    const fresh = await f.team.signIn('bob', result.initialPassword, 'another');
    expect(fresh.member.humanId).toBe(f.human.humanId);
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordReset',
        args: { humanId: f.human.humanId },
        peer: fresh.peer,
      }),
    ).rejects.toMatchObject({ code: 'remote-access/denied' });
  });

  it.each(['reset', 'change'] as const)(
    'refuses a sign-in verified before a concurrent credential %s',
    async (kind) => {
      const f = await enabledFixture();
      let release!: () => void;
      let verified!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const reached = new Promise<void>((resolve) => {
        verified = resolve;
      });
      const realVerify = passwords.verifyPassword;
      let first = true;
      vi.spyOn(passwords, 'verifyPassword').mockImplementation(async (password, hash) => {
        const valid = await realVerify(password, hash);
        if (first) {
          first = false;
          verified();
          await held;
        }
        return valid;
      });
      const signIn = f.team.signIn('bob', f.initialPassword, 'ip');
      const refused = expect(signIn).rejects.toMatchObject({ code: 'credentials-invalid' });
      await reached;
      try {
        if (kind === 'reset') await f.team.resetPassword(owner, f.human.humanId);
        else await f.team.changePassword(f.human, f.initialPassword, 'changed-password-1');
      } finally {
        release();
      }
      await refused;
      expect(f.peers).toHaveLength(0);
    },
  );

  it('preserves only the changing initial-password grant and shares the account limiter for RPC', async () => {
    const f = await enabledFixture();
    const first = await f.team.signIn('bob', f.initialPassword, 'ip-a');
    const other = await f.team.signIn('bob', f.initialPassword, 'ip-b');
    await f.gateway.invoke({
      namespace: 'botharness',
      method: 'memberPasswordChange',
      args: { current: f.initialPassword, next: 'member-password-1' },
      peer: first.peer,
    });
    expect(first.peer.signal.aborted).toBe(false);
    expect(f.team.admit(first.token)).toBe(first.peer);
    expect(other.peer.signal.aborted).toBe(true);
    expect(f.team.admit(other.token)).toBeUndefined();
    for (let i = 0; i < 2; i++)
      await expect(
        f.gateway.invoke({
          namespace: 'botharness',
          method: 'memberPasswordChange',
          args: { current: 'wrong-password', next: 'member-password-2' },
          peer: first.peer,
        }),
      ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordChange',
        args: { current: 'wrong-password', next: 'member-password-2' },
        peer: first.peer,
      }),
    ).rejects.toMatchObject({ code: 'rate-limited' });
    const carol = await f.team.createMember(owner, 'carol', 'Carol');
    const login = await f.team.signIn('carol', carol.initialPassword, 'ip-c');
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'memberPasswordChange',
        args: { current: carol.initialPassword, next: 'carol-password-1' },
        peer: login.peer,
      }),
    ).resolves.toBe(null);
  });
  it('does not let an IP-limited attacker consume buckets for unrelated accounts', () => {
    const limiter = new SignInRateLimit(() => 0);
    for (let i = 0; i < 20; i++) expect(limiter.admit(`seed-${i}`, 'attacker')).toBe(0);
    for (let i = 0; i < 5000; i++) expect(limiter.admit(`spam-${i}`, 'attacker')).toBe(60);
    expect(limiter.admit('unrelated-member', 'other-ip')).toBe(0);
  });
  it('hashes with Argon2id and random salts, verifies without retaining a plaintext password', async () => {
    const a = await hashPassword('member-password-1');
    const b = await hashPassword('member-password-1');
    expect(a).toMatchObject({ algorithm: 'argon2id', params: ARGON2_PARAMS });
    expect(a.salt).not.toBe(b.salt);
    expect(await verifyPassword('member-password-1', a)).toBe(true);
    expect(await verifyPassword('different-password', a)).toBe(false);
    expect(JSON.stringify(a)).not.toContain('member-password-1');
  });

  it('limits usernames across IPs and IPs across usernames, without forgetting full buckets', () => {
    let now = 0;
    const byUsername = new SignInRateLimit(() => now);
    for (let i = 0; i < 5; i++) expect(byUsername.admit('bob', String(i))).toBe(0);
    expect(byUsername.admit('bob', 'another-ip')).toBe(60);
    const byIp = new SignInRateLimit(() => now);
    for (let i = 0; i < 20; i++) expect(byIp.admit(String(i), 'one-ip')).toBe(0);
    expect(byIp.admit('fresh-user', 'one-ip')).toBe(60);
    now = 60_000;
    expect(byUsername.admit('bob', 'another-ip')).toBe(0);
    expect(byIp.admit('fresh-user', 'one-ip')).toBe(0);
  });

  it('requires an Owner password and rejects invalid or duplicate usernames and non-Owner management', async () => {
    const f = teamFixture();
    await expect(f.team.setMode(owner, true)).rejects.toMatchObject({
      code: 'owner-password-required',
    });
    await expect(f.team.setOwnerPassword(owner, 'short')).rejects.toMatchObject({
      code: 'password-weak',
    });
    await f.team.setOwnerPassword(owner, 'owner-password-1');
    await expect(
      f.team.setOwnerPassword(owner, 'owner-password-2', 'wrong-password'),
    ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await f.team.setMode(owner, true);
    await expect(f.team.createMember(owner, 'B', 'Bob')).rejects.toMatchObject({
      code: 'username-invalid',
    });
    const created = await f.team.createMember(owner, 'bob', 'Bob');
    await expect(f.team.createMember(owner, 'bob', 'Another Bob')).rejects.toMatchObject({
      code: 'username-taken',
    });
    expect(() => f.team.members(humanContext(created.member.humanId))).toThrow(
      'permission-required',
    );
    expect(f.team.members(owner)).toHaveLength(2);
    const stored = f.database.read((db) =>
      db.prepare('SELECT password_json FROM member_credentials WHERE username = ?').get('bob'),
    );
    expect(JSON.stringify(stored)).not.toContain(created.initialPassword);
  });

  it('answers identically for an unknown user and a wrong password and rate limits both', async () => {
    const f = await enabledFixture();
    const unknown = await f.team
      .signIn('nobody', 'wrong-password', 'ip-a')
      .catch((error: unknown) => error);
    const wrong = await f.team
      .signIn('bob', 'wrong-password', 'ip-b')
      .catch((error: unknown) => error);
    expect(unknown).toBeInstanceOf(TeamError);
    expect(wrong).toMatchObject({ code: 'credentials-invalid', message: 'credentials-invalid' });
    expect(unknown).toMatchObject({ code: 'credentials-invalid', message: 'credentials-invalid' });
    for (let i = 0; i < 4; i++)
      await f.team.signIn('nobody', 'wrong-password', 'ip-a').catch(() => {});
    await expect(f.team.signIn('nobody', 'wrong-password', 'ip-a')).rejects.toMatchObject({
      code: 'rate-limited',
      retryAfterSeconds: 60,
    });
  });

  it('enforces first-password change and history, then denies native methods while allowing public browsing', async () => {
    const f = await enabledFixture();
    new NativeSession(f.ctx);
    const login = await f.team.signIn('bob', f.initialPassword, 'ip');
    expect(resolveInvocationHuman(login.peer, undefined, f.team)).toEqual(f.human);
    const invoke = (method: string, args = {}) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer: login.peer });
    await expect(invoke('teamMode')).resolves.toMatchObject({
      viewer: { kind: 'member', mustChangePassword: true },
    });
    await expect(invoke('publicChannels')).rejects.toMatchObject({
      code: 'remote-access/denied',
      details: { reason: 'password-change-required' },
    });
    await expect(
      invoke('memberPasswordChange', { current: 'wrong-password', next: 'member-password-1' }),
    ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await expect(
      invoke('memberPasswordChange', { current: f.initialPassword, next: 'short' }),
    ).rejects.toMatchObject({ code: 'password-weak' });
    await invoke('memberPasswordChange', { current: f.initialPassword, next: 'member-password-1' });
    await expect(
      invoke('memberPasswordChange', { current: 'member-password-1', next: f.initialPassword }),
    ).rejects.toMatchObject({ code: 'password-reused' });
    await expect(invoke('publicChannels')).resolves.toEqual([]);
    await expect(
      f.gateway.invoke({ namespace: 'session', method: 'list', args: {}, peer: login.peer }),
    ).rejects.toMatchObject({ code: 'remote-access/denied', details: { reason: 'no-allow' } });
    const ownerPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    await expect(
      f.gateway.invoke({ namespace: 'session', method: 'list', args: {}, peer: ownerPeer }),
    ).resolves.toEqual({ sessions: ['owner-session'] });
  });

  it('joins only public groups, isolates reads and records each message author and Source Event Human', async () => {
    const f = await enabledFixture();
    const group = f.channels.createGroup(owner, { name: 'Public', members: [] });
    const privateGroup = f.channels.createGroup(owner, { name: 'Private', members: [] });
    expect(() => f.team.joinPublic(f.human, 'missing')).toThrow('channel-not-found');
    expect(() => f.team.joinPublic(f.human, group.id)).toThrow('channel-not-public');
    f.team.setPublic(owner, group.id, true);
    expect(f.team.publicChannels(f.human)).toEqual([
      { channelId: group.id, name: 'Public', memberCount: 1, joined: false },
    ]);
    f.team.joinPublic(f.human, group.id);
    f.team.joinPublic(f.human, group.id);
    expect(f.channels.listHumanMembers(owner, group.id)).toHaveLength(2);
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    const invoke = (method: string, args = {}) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer: login.peer });
    await expect(invoke('channelMessages', { channelId: privateGroup.id })).rejects.toMatchObject({
      code: 'remote-access/denied',
    });
    await expect(invoke('channels')).resolves.toMatchObject({ channels: [{ id: group.id }] });
    const sent = await invoke('channelSend', { channelId: group.id, body: 'Hello from Bob' });
    expect(sent).toMatchObject({
      message: { author: { kind: 'human', humanId: f.human.humanId, displayName: 'Bob' } },
    });
    expect(
      f.database.read((db) =>
        db.prepare("SELECT human_id FROM source_events WHERE body = 'Hello from Bob'").get(),
      ),
    ).toMatchObject({ human_id: f.human.humanId });
    expect(f.channels.readMessages(group.id)[0]?.author).toMatchObject({
      humanId: f.human.humanId,
      displayName: 'Bob',
    });
    expect(f.team.publicChannels(f.human)[0]).toMatchObject({ joined: true, memberCount: 2 });
    const reads = f.db.diagnostics().metrics.reads;
    f.team.publicChannels(f.human);
    expect(f.db.diagnostics().metrics.reads - reads).toBe(1);
  });

  it('revokes only one signed-out grant and disposes all member Peers on suspension or Team mode off', async () => {
    const f = await enabledFixture();
    const a = await f.team.signIn('bob', f.initialPassword, 'ip-a');
    const b = await f.team.signIn('bob', f.initialPassword, 'ip-b');
    if (a.peer.principal.kind !== 'botharness-member') throw new Error('member principal required');
    await f.team.revoke(a.peer.principal.grantId);
    expect(a.peer.signal.aborted).toBe(true);
    expect(f.team.admit(a.token)).toBeUndefined();
    expect(f.team.admit(b.token)).toBe(b.peer);
    const committed = f.db.diagnostics().metrics.transactionsCommitted;
    for (let i = 0; i < 20; i++) expect(f.team.admit(b.token)).toBe(b.peer);
    expect(f.db.diagnostics().metrics.transactionsCommitted).toBe(committed);
    await f.team.suspend(owner, f.human.humanId);
    expect(b.peer.signal.aborted).toBe(true);
    await expect(f.team.signIn('bob', f.initialPassword, 'ip-a')).rejects.toMatchObject({
      code: 'member-suspended',
    });
    const carol = await f.team.createMember(owner, 'carol', 'Carol');
    const c = await f.team.signIn('carol', carol.initialPassword, 'ip-c');
    await f.team.setMode(owner, false);
    expect(c.peer.signal.aborted).toBe(true);
    expect(f.team.resolve(c.peer.principal)).toBeUndefined();
    await expect(f.team.signIn('carol', carol.initialPassword, 'ip-c')).rejects.toMatchObject({
      code: 'team-mode-off',
    });
    expect(f.team.mode(owner)).toMatchObject({ enabled: false, viewer: { kind: 'owner' } });
    await f.team.setMode(owner, true);
    expect(f.team.admit(c.token)).toBeUndefined();
    expect(f.team.members(owner)).toHaveLength(3);
  });
});

describe('member confidentiality', { timeout: 60_000 }, () => {
  it('delivers deleted-group removals and purges only to retained members, resetting unknown tombstones', async () => {
    const f = await enabledFixture();
    const joined = f.channels.createGroup(owner, { name: 'Deleted joined', members: [] });
    const privateGroup = f.channels.createGroup(owner, { name: 'Deleted private', members: [] });
    f.team.setPublic(owner, joined.id, true);
    f.team.joinPublic(f.human, joined.id);
    const controller = new AbortController();
    const frames = f.live.followRoster(f.human, controller.signal)[Symbol.asyncIterator]();
    await frames.next();
    const since = f.channels.changeCursor!();
    f.channels.deleteGroup(joined.id);
    expect(f.channels.get(joined.id)).toBeUndefined();
    expect(f.channels.hasHumanMembership?.(f.human, joined.id)).toBe(true);
    const delta = await f
      .methods(f.human)
      .channelListChanges({ sinceSeq: since.seq, epoch: since.epoch });
    expect(delta).toMatchObject({ ok: true, value: { removed: [joined.id] } });
    const permitted = {
      channelId: joined.id,
      messageId: 'deleted-visible',
      sourceEventId: 'visible-source',
    };
    f.setPlacements([
      permitted,
      { channelId: privateGroup.id, messageId: 'deleted-secret', sourceEventId: 'secret-source' },
    ]);
    f.live.publishContentPurged();
    expect((await frames.next()).value).toEqual({ type: 'purged', placements: [permitted] });
    const reopened = f.live.followRoster(f.human, controller.signal)[Symbol.asyncIterator]();
    expect((await reopened.next()).value).toEqual({ type: 'baseline', placements: [permitted] });
    f.live.publishCommitted({
      channelId: joined.id,
      revision: 99,
      message: {
        id: 'not-visible',
        at: '2026-11-14',
        author: { kind: 'human' },
        body: 'Deleted content must stay hidden',
      },
    });
    f.live.publishRosterCommitted();
    expect((await frames.next()).value).toEqual({ type: 'changed' });
    const next = f.channels.changeCursor!();
    f.channels.deleteGroup(privateGroup.id);
    const reset = await f
      .methods(f.human)
      .channelListChanges({ sinceSeq: next.seq, epoch: next.epoch });
    expect(reset).toMatchObject({ ok: true, value: { reset: true } });
    expect(JSON.stringify(reset)).not.toContain(privateGroup.id);
    controller.abort();
    await frames.return?.();
    await reopened.return?.();
  });
  it('keeps the shared member-method contract dependency-free and its denials explicit', () => {
    const source = readFileSync(new URL('../src/team/member-methods.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/\bimport\b/u);
    expect([...MEMBER_METHODS]).toEqual([
      ...MEMBER_GLOBAL_METHODS,
      ...MEMBER_CHANNEL_METHODS,
      ...MEMBER_BOT_METHODS,
    ]);
    expect(MEMBER_METHODS.has('composerIdentity')).toBe(true);
    for (const method of ['dataReset']) expect(MEMBER_METHODS.has(method)).toBe(false);
    for (const method of ['teamModeSet', 'members', 'roles', 'create', 'createLookup'])
      expect(MEMBER_METHODS.has(method)).toBe(true);
  });
  it('returns only opaque composer ids and the calling Human, never the Owner identity', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const member = await f.team.signIn('bob', 'member-password-1', 'ip');
    const invoke = (peer: typeof member.peer) =>
      f.gateway.invoke({ namespace: 'botharness', method: 'composerIdentity', args: {}, peer });
    const identitySchema = z
      .object({ hostId: z.string(), profileId: z.string(), humanId: z.string() })
      .strict();
    const ownerIdentity = identitySchema.parse(
      await invoke(new Peer(f.ctx, { principal: { kind: 'owner' } })),
    );
    const memberIdentity = identitySchema.parse(await invoke(member.peer));
    expect(ownerIdentity).toEqual({
      hostId: expect.any(String),
      profileId: expect.any(String),
      humanId: owner.humanId,
    });
    expect(memberIdentity).toEqual({
      hostId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      profileId: expect.stringMatching(/^[0-9a-f-]{36}$/u),
      humanId: f.human.humanId,
    });
    expect(memberIdentity).toMatchObject({
      hostId: ownerIdentity.hostId,
      profileId: ownerIdentity.profileId,
    });
    expect(JSON.stringify(memberIdentity)).not.toContain('local-human');
    expect(JSON.stringify(memberIdentity)).not.toContain(f.channels.rootDir);
  });

  it('returns an empty member attention status when only the Owner has attention', async () => {
    const f = await enabledFixture();
    f.registry.create({ slug: 'private-attention', displayName: 'Private attention Bot' });
    const dm = f.channels.getOrCreateDm(owner, 'private-attention', 'Private attention DM')!;
    await f.channels.appendMessage(owner, dm.id, {
      id: 'owner-attention-secret',
      at: '2026-11-14T00:00:00Z',
      author: { kind: 'bot', slug: 'private-attention' },
      body: 'Owner-only attention body',
      grantRequest: true,
    });
    await f.channels.appendMessage(owner, dm.id, {
      id: 'owner-unread-secret',
      at: '2026-11-14T00:00:01Z',
      author: { kind: 'bot', slug: 'private-attention' },
      body: 'Owner-only unread body',
    });
    const query = createHumanAttentionQuery(f.database);
    const ownerStatus = query.status(owner, true);
    expect(ownerStatus.unreadCount).toBeGreaterThan(0);
    expect(ownerStatus.hasAction).toBe(true);
    expect(query.status(f.human, true)).toEqual({
      unreadCount: 0,
      hasAction: false,
      messageCounts: { replies: 0, other: 0 },
    });
    expect(f.team.belongs(f.human, dm.id)).toBe(false);
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const member = await f.team.signIn('bob', 'member-password-1', 'ip');
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'humanAttentionStatus',
        args: { messageCounts: true },
        peer: member.peer,
      }),
    ).resolves.toEqual({
      unreadCount: 0,
      hasAction: false,
      messageCounts: { replies: 0, other: 0 },
    });
    await expect(
      f.gateway.invoke({
        namespace: 'botharness',
        method: 'humanAttentionStatus',
        args: { messageCounts: true },
        peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
      }),
    ).resolves.toEqual(ownerStatus);
  });
  it('scopes both roster carriers to current membership, including purges and queued frames', async () => {
    const f = await enabledFixture();
    const dm = f.channels.getOrCreateDm(owner, 'secret-bot', 'Owner secret DM')!;
    const group = f.channels.createGroup(owner, { name: 'Shared public', members: [] });
    f.team.setPublic(owner, group.id, true);
    f.team.joinPublic(f.human, group.id);
    const privatePlacement = {
      sourceEventId: 'private-source',
      channelId: dm.id,
      messageId: 'private-message',
    };
    const publicPlacement = {
      sourceEventId: 'public-source',
      channelId: group.id,
      messageId: 'public-message',
    };
    f.setPlacements([privatePlacement, publicPlacement]);
    const abort = new AbortController();
    const sse = openLiveFrames(
      (request) => f.live.open(f.human, request),
      'scope=roster',
      '',
      abort.signal,
    );
    await sse.next();
    expect(JSON.parse((await sse.next()).value.data)).toEqual({ placements: [publicPlacement] });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    const typed = (
      await f.gateway.stream({
        namespace: 'botharness',
        method: 'followRoster',
        args: {},
        peer: login.peer,
        signal: abort.signal,
      })
    )[Symbol.asyncIterator]();
    expect((await typed.next()).value).toEqual({ type: 'baseline', placements: [publicPlacement] });
    const ownerFrames = f.live.followRoster(owner, abort.signal)[Symbol.asyncIterator]();
    expect((await ownerFrames.next()).value).toEqual({
      type: 'baseline',
      placements: [privatePlacement, publicPlacement],
    });
    const message = (id: string, body: string) => ({
      id,
      body,
      at: '2026-11-14T00:00:00Z',
      author: { kind: 'human' as const },
    });
    const secret = message('private-message', 'Owner DM secret body');
    const shared = message('public-message', 'Shared public body');
    f.live.publishCommitted({ channelId: dm.id, revision: 1, message: secret });
    f.live.publishCommitted({ channelId: group.id, revision: 1, message: shared });
    expect((await typed.next()).value).toEqual({
      type: 'latest',
      channelId: group.id,
      message: shared,
    });
    expect(JSON.parse((await sse.next()).value.data)).toEqual({
      channelId: group.id,
      message: shared,
    });
    expect((await ownerFrames.next()).value).toEqual({
      type: 'latest',
      channelId: dm.id,
      message: secret,
    });
    f.live.publishContentPurged();
    expect((await typed.next()).value).toEqual({ type: 'purged', placements: [publicPlacement] });
    expect(JSON.parse((await sse.next()).value.data)).toEqual({ placements: [publicPlacement] });
    f.live.publishCommitted({ channelId: group.id, revision: 2, message: shared });
    f.database.transaction((db) =>
      db
        .prepare(
          'UPDATE channel_human_members SET left_at = ? WHERE channel_id = ? AND human_id = ?',
        )
        .run('2026-11-14', group.id, f.human.humanId),
    );
    f.live.publishRosterCommitted();
    expect((await typed.next()).value).toEqual({ type: 'changed' });
    abort.abort();
    await typed.return?.();
    await sse.return(undefined);
    await ownerFrames.return?.();
  });

  it('audits every member-allowed method against Owner Channels and embedded results', async () => {
    const f = await enabledFixture();
    f.registry.create({ slug: 'owner-secret-bot', displayName: 'Owner secret Bot' });
    f.registry.create({ slug: 'shared-bot', displayName: 'Shared Bot' });
    const dm = f.channels.getOrCreateDm(owner, 'owner-secret-bot', 'Owner private DM')!;
    const privateGroup = f.channels.createGroup(owner, {
      name: 'Owner private group',
      members: ['owner-secret-bot'],
    });
    const memberGroup = f.channels.createGroup(f.human, {
      name: 'Member only',
      members: ['shared-bot'],
    });
    const start = f.channels.changeCursor!();
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE channel_records SET record_json = json_set(record_json, '$.invitations', json(?)) WHERE channel_id = ?",
        )
        .run(
          JSON.stringify([
            {
              id: 'private-invitation',
              targetBotSlug: 'owner-secret-bot',
              targetBotCreatedAt: '2026-11-14',
              inviterHuman: true,
              status: 'pending',
              createdAt: '2026-11-14',
            },
          ]),
          memberGroup.id,
        ),
    );
    f.team.setPublic(owner, memberGroup.id, true);
    for (const channel of [dm, privateGroup, memberGroup])
      await f.channels.appendMessage(owner, channel.id, {
        id: `message-${channel.id}`,
        at: '2026-11-14T00:00:00Z',
        author: { kind: 'bot', slug: channel === memberGroup ? 'shared-bot' : 'owner-secret-bot' },
        body:
          channel === memberGroup ? 'visible member text' : 'Confidential Owner message body text',
      });
    f.database.transaction((db) => {
      for (const channel of [dm, privateGroup, memberGroup])
        db.prepare(
          "UPDATE source_events SET payload_json = json_set(payload_json, '$.attachments', json(?)) WHERE source_event_id IN (SELECT source_event_id FROM channel_placements WHERE channel_id = ?)",
        ).run(
          JSON.stringify([
            {
              fileId: 'file:6a1f3c2e-1b2c-4d3e-8f40-123456789abc',
              name: channel === memberGroup ? 'member.txt' : 'Owner private file',
              mime: 'text/plain',
              size: 1,
            },
          ]),
          channel.id,
        );
    });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const login = await f.team.signIn('bob', 'member-password-1', 'ip');
    f.setPlacements([
      { sourceEventId: 'secret-source', channelId: dm.id, messageId: `message-${dm.id}` },
    ]);
    const args: Record<string, Record<string, unknown>> = {
      roleCreate: { name: 'Operators', permissions: [] },
      roleUpdate: { roleId: 'member' },
      roleDelete: { roleId: 'member' },
      memberCreate: { username: 'carol', displayName: 'Carol' },
      memberRolesSet: { humanId: owner.humanId, roleIds: ['member'] },
      memberDevices: { humanId: f.human.humanId },
      memberDeviceRevoke: { humanId: f.human.humanId, grantId: 'absent' },
      ownerTransfer: { humanId: f.human.humanId, password: 'owner-password-1' },
      teamModeSet: { enabled: true },
      teamInsecureHttpSet: { allowed: false },
      teamOwnerPasswordSet: { password: 'replacement-password' },
      channelPublicSet: { channelId: memberGroup.id, public: true },
      memberPasswordReset: { humanId: f.human.humanId },
      memberPasswordChange: { current: 'member-password-1', next: 'member-password-2' },
      publicChannelJoin: { channelId: memberGroup.id },
      channelListChanges: { sinceSeq: start.seq, epoch: start.epoch },
      channelSearch: { text: 'text' },
      channelMarkRead: { messageId: `message-${memberGroup.id}` },
      channelReact: { messageId: `message-${memberGroup.id}`, emoji: '👍', active: true },
      channelSend: { body: 'member test send' },
      channelSendStatus: { messageId: `message-${memberGroup.id}` },
      channelJournalPage: { through: f.channels.revision(memberGroup.id) },
      channelChanges: { sinceSeq: start.seq, epoch: start.epoch },
      create: { displayName: 'Member Bot' },
      createLookup: { operationKey: 'audit-create-0001', displayName: 'Member Bot' },
      followChannel: { limit: 10 },
    };
    const forbidden = [
      dm.id,
      dm.name,
      privateGroup.id,
      privateGroup.name,
      'Confidential Owner message body',
      'owner-secret-bot',
      'Owner secret Bot',
      'Owner private file',
    ];
    const streams = new Set(['followRoster', 'followChannel', 'followActivity']);
    const table = [...MEMBER_GLOBAL_METHODS, ...MEMBER_CHANNEL_METHODS];
    for (const method of table) {
      const abort = new AbortController();
      const request = {
        namespace: 'botharness',
        method,
        peer: login.peer,
        signal: abort.signal,
        args: {
          ...(MEMBER_CHANNEL_METHODS.some((name) => name === method)
            ? { channelId: memberGroup.id }
            : {}),
          ...args[method],
        },
      };
      let result: unknown;
      try {
        if (streams.has(method)) {
          const iterator = (await f.gateway.stream(request))[Symbol.asyncIterator]();
          result = (await iterator.next()).value;
          abort.abort();
          await iterator.return?.();
        } else result = await f.gateway.invoke(request);
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        if (
          [
            'roles',
            'roleCreate',
            'roleUpdate',
            'roleDelete',
            'members',
            'memberCreate',
            'memberRolesSet',
            'memberPasswordReset',
            'memberDevices',
            'memberDeviceRevoke',
            'ownerTransfer',
            'teamModeSet',
            'teamInsecureHttpSet',
            'teamOwnerPasswordSet',
            'channelPublicSet',
          ].includes(method)
        )
          expect(['permission-required', 'device-not-found']).toContain(code);
        else
          expect([
            'unavailable',
            'creation-unavailable',
            'storage-unavailable',
            'invalid-input',
          ]).toContain(code);
        result = { code };
      } finally {
        abort.abort();
      }
      const encoded = JSON.stringify(result) ?? '';
      for (const value of forbidden)
        expect.soft(encoded, `${method} exposed ${value}`).not.toContain(value);
      if (
        [
          'channelMessages',
          'channelTimeline',
          'channelSearch',
          'channelJournalPage',
          'channelFilesPage',
          'channelChanges',
          'followChannel',
        ].includes(method)
      )
        expect(encoded, `${method} did not exercise a nonempty member page`).toContain(
          'visible member text',
        );
    }
    for (const method of MEMBER_CHANNEL_METHODS) {
      const request = {
        namespace: 'botharness',
        method,
        peer: login.peer,
        args: { channelId: dm.id, ...args[method] },
      };
      await expect(
        streams.has(method) ? f.gateway.stream(request) : f.gateway.invoke(request),
      ).rejects.toMatchObject({ code: 'remote-access/denied' });
    }
    for (const method of ['channelGroupDelete', 'channelGroupWakeSet'])
      await expect(
        f.gateway.invoke({
          namespace: 'botharness',
          method,
          args: { channelId: memberGroup.id },
          peer: login.peer,
        }),
      ).rejects.toMatchObject({ code: 'remote-access/denied' });
    expect(
      await f.gateway.invoke({
        namespace: 'botharness',
        method: 'channelListChanges',
        args: { sinceSeq: start.seq, epoch: start.epoch },
        peer: new Peer(f.ctx, { principal: { kind: 'owner' } }),
      }),
    ).toMatchObject({ channels: expect.arrayContaining([expect.objectContaining({ id: dm.id })]) });
  });
});

async function memberHttp(
  f: ReturnType<typeof teamFixture>,
  remote = false,
  tls = false,
  connect = false,
) {
  const handler = createTeamHttp({
    team: f.team,
    gateway: f.gateway,
    hostName: () => 'Test Host',
    tls: () => tls,
    async readResource(_request, peer) {
      return new Response(`<html><head></head><body>${peer.principal.kind}</body></html>`, {
        headers: { 'content-type': 'text/html' },
      });
    },
    async fetchBundle() {
      return new Response('asset');
    },
  });
  const server = createServer((request, response) => {
    if (connect) stampConnectRoute(request);
    if (remote)
      Object.defineProperty(request.socket, 'remoteAddress', {
        value: '192.0.2.5',
        configurable: true,
      });
    void handler.handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  closes.push(async () => {
    await handler.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const origin = `http://127.0.0.1:${address.port}`;
  const signIn = (username: string, password: string, headers = {}) =>
    fetch(`${origin}${TEAM_PATH}/sign-in`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ username, password }),
    });
  const password = (cookie: string, current: string, next: string, headers = {}) =>
    fetch(`${origin}${TEAM_PATH}/password`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ current, next }),
    });
  const wire = (cookie: string, command: unknown, headers = {}) =>
    fetch(`${origin}${TEAM_PATH}/__share/rpc`, {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: JSON.stringify(command),
    });
  const rpc = async (cookie: string, method: string, args: Record<string, unknown>, headers = {}) =>
    (
      await wire(
        cookie,
        {
          op: 'call',
          path: `/api/botharness/${method}`,
          body: {
            type: 'client-request',
            rpcId: 'review-4',
            method: `botharness/${method}`,
            payload: { args },
          },
        },
        headers,
      )
    ).json();
  return { origin, signIn, password, wire, rpc };
}

describe('member HTTP carrier', { timeout: 60_000 }, () => {
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
    let now = 0;
    const f = await enabledFixture({ now: () => now });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const cookies: string[] = [];
    for (let i = 0; i < 17; i++) {
      now += 60_000;
      const login = await f.team.signIn('bob', 'member-password-1', `ip-${i}`);
      cookies.push(`botharness-member=${login.token}`);
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
    const open = (cookie: string, id: number) =>
      http.wire(cookie, {
        op: 'stream-open',
        id,
        endpoint: 'botharness/followRoster',
        payload: { args: {} },
      });
    const requests: Promise<Response>[] = [];
    try {
      for (const cookie of cookies.slice(0, 16))
        for (let id = 1; id <= 16; id++) requests.push(open(cookie, id));
      await vi.waitFor(() => expect(opened).toHaveBeenCalledTimes(256), { timeout: 10000 });
      expect((await open(cookies[0]!, 1)).status).toBe(429);
      expect((await open(cookies[0]!, 17)).status).toBe(429);
      expect((await open(cookies[16]!, 1)).status).toBe(429);
      expect(opened).toHaveBeenCalledTimes(256);
    } finally {
      for (const release of releases) release();
      await Promise.all(requests);
    }
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
      for (const name of ['forwarded', 'x-forwarded-for', 'x-real-ip', 'via']) {
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
  it('serves the nonce-protected sign-in page and loopback member cookie, then dispatches calls as the member', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const page = await fetch(`${http.origin}${TEAM_PATH}/`);
    const html = await page.text();
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('x-frame-options')).toBe('DENY');
    const nonce = /script-src 'nonce-([^']+)'/u.exec(
      page.headers.get('content-security-policy') ?? '',
    )?.[1];
    expect(nonce).toBeTruthy();
    expect(html).toContain(`nonce="${nonce}"`);
    const login = await http.signIn('bob', f.initialPassword);
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(await login.json()).toMatchObject({
      humanId: f.human.humanId,
      displayName: 'Bob',
      mustChangePassword: true,
    });
    const forced = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    const forcedHtml = await forced.text();
    expect(forcedHtml).toContain('data-step="change-password"');
    expect(forcedHtml).toContain('Bob');
    expect(forcedHtml).not.toContain('__DSH_TRANSPORT__');
    expect(forced.headers.get('cache-control')).toBe('no-store');
    expect(forced.headers.get('x-frame-options')).toBe('DENY');
    const forcedNonce = /script-src 'nonce-([^']+)'/u.exec(
      forced.headers.get('content-security-policy') ?? '',
    )?.[1];
    expect(forcedNonce).toBeTruthy();
    expect(forcedHtml).toContain(`nonce="${forcedNonce}"`);
    const rpc = async (method: string, args = {}) => {
      const answer = await fetch(`${http.origin}${TEAM_PATH}/__share/rpc`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({
          op: 'call',
          path: `/api/botharness/${method}`,
          body: {
            type: 'client-request',
            rpcId: 'test',
            method: `botharness/${method}`,
            payload: { args },
          },
        }),
      });
      return answer.json();
    };
    expect(await rpc('teamMode')).toMatchObject({
      result: { ok: true, value: { viewer: { humanId: f.human.humanId, kind: 'member' } } },
    });
    expect(await rpc('publicChannels')).toMatchObject({
      result: { ok: false, error: { code: 'password-change-required' } },
    });
    expect(
      await rpc('memberPasswordChange', { current: f.initialPassword, next: 'member-password-1' }),
    ).toMatchObject({ result: { ok: true } });
    expect(await rpc('publicChannels')).toMatchObject({ result: { ok: true, value: [] } });
    const shell = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await shell.text()).toContain('__DSH_TRANSPORT__');
    const ownerHttp = await fetch(`${http.origin}${TEAM_PATH}/api/botharness/appearance-control`, {
      headers: { cookie },
    });
    expect(ownerHttp.status).toBe(403);
    expect(await ownerHttp.json()).toEqual({ code: 'remote-access/denied' });
    const out = await fetch(`${http.origin}${TEAM_PATH}/sign-out`, {
      method: 'POST',
      headers: { cookie },
    });
    expect(out.status).toBe(200);
    const after = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await after.text()).toContain('data-step="sign-in"');
  });

  it('refuses spoofed TLS headers, permits only the Owner exception, and denies cross-origin sign-in', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f, true);
    const denied = await http.signIn('bob', f.initialPassword, { 'x-forwarded-proto': 'https' });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'insecure-transport' });
    f.team.setInsecureHttp(owner, true);
    const allowed = await http.signIn('bob', f.initialPassword);
    expect(allowed.status).toBe(200);
    const cross = await http.signIn('bob', f.initialPassword, {
      origin: 'https://attacker.example',
    });
    expect(cross.status).toBe(403);
    expect(await cross.json()).toEqual({ code: 'origin-refused' });
  });

  it('uses Secure for Host-known TLS and refuses new sign-ins after Team mode is disabled', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f, true, true);
    const login = await http.signIn('bob', f.initialPassword);
    expect(login.status).toBe(200);
    expect(login.headers.get('set-cookie')).toContain('; Secure');
    await f.team.setMode(owner, false);
    const denied = await http.signIn('bob', f.initialPassword);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'team-mode-off' });
  });

  it('changes the one-time password over HTTP before serving the shell', async () => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const login = await http.signIn('bob', f.initialPassword);
    const cookie = login.headers.get('set-cookie') ?? '';
    const changed = await http.password(cookie, f.initialPassword, 'member-password-1');
    expect(changed.status).toBe(200);
    expect(await changed.json()).toEqual({});
    expect(changed.headers.get('cache-control')).toBe('no-store');
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(false);
    const shell = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await shell.text()).toContain('__DSH_TRANSPORT__');
    await expect(f.team.signIn('bob', 'member-password-1', 'another-ip')).resolves.toMatchObject({
      member: { mustChangePassword: false },
    });
    const reused = await http.password(cookie, 'member-password-1', f.initialPassword);
    expect(reused.status).toBe(409);
    expect(await reused.json()).toEqual({ code: 'password-reused' });
  });

  it.each([
    ['wrong-current', 401, 'credentials-invalid'],
    ['weak', 400, 'password-weak'],
    ['reused', 409, 'password-reused'],
  ] as const)('refuses HTTP password change: %s', async (kind, status, code) => {
    const f = await enabledFixture();
    const http = await memberHttp(f);
    const login = await http.signIn('bob', f.initialPassword);
    const cookie = login.headers.get('set-cookie') ?? '';
    const answer = await http.password(
      cookie,
      kind === 'wrong-current' ? 'wrong-password' : f.initialPassword,
      kind === 'weak' ? 'short' : kind === 'reused' ? f.initialPassword : 'member-password-1',
    );
    expect(answer.status).toBe(status);
    expect(await answer.json()).toEqual({ code });
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
  });

  it.each(['absent', 'revoked', 'suspended', 'mode-off'] as const)(
    'refuses HTTP password changes without a live member grant: %s',
    async (kind) => {
      const f = await enabledFixture();
      const http = await memberHttp(f);
      const login = await http.signIn('bob', f.initialPassword);
      const cookie = kind === 'absent' ? '' : (login.headers.get('set-cookie') ?? '');
      if (kind === 'revoked') {
        const peer = f.peers[0];
        if (peer?.principal.kind !== 'botharness-member') throw new Error('missing member');
        await f.team.revoke(peer.principal.grantId);
      }
      if (kind === 'suspended') await f.team.suspend(owner, f.human.humanId);
      if (kind === 'mode-off') await f.team.setMode(owner, false);
      const answer = await http.password(cookie, f.initialPassword, 'member-password-1');
      expect(answer.status).toBe(401);
      expect(await answer.json()).toEqual({ code: 'credentials-invalid' });
      expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
    },
  );

  it('applies sign-in transport and origin checks to HTTP password changes', async () => {
    const f = await enabledFixture();
    const local = await memberHttp(f);
    const cookie = (await local.signIn('bob', f.initialPassword)).headers.get('set-cookie') ?? '';
    const remote = await memberHttp(f, true);
    const denied = await remote.password(cookie, f.initialPassword, 'member-password-1', {
      'x-forwarded-proto': 'https',
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'insecure-transport' });
    const proxy = await local.password(cookie, f.initialPassword, 'member-password-1', {
      forwarded: 'for=192.0.2.5',
    });
    expect(proxy.status).toBe(403);
    const cross = await local.password(cookie, f.initialPassword, 'member-password-1', {
      origin: 'https://attacker.example',
    });
    expect(cross.status).toBe(403);
    expect(await cross.json()).toEqual({ code: 'origin-refused' });
    f.team.setInsecureHttp(owner, true);
    expect((await remote.password(cookie, f.initialPassword, 'member-password-1')).status).toBe(
      200,
    );
    const tls = await memberHttp(f, true, true);
    expect((await tls.password(cookie, 'member-password-1', 'member-password-2')).status).toBe(200);
    const connect = await memberHttp(f, true, false, true);
    f.team.setInsecureHttp(owner, false);
    expect((await connect.password(cookie, 'member-password-2', 'member-password-3')).status).toBe(
      200,
    );
  });

  it('shares username and IP rate-limit budgets between sign-in and HTTP password changes', async () => {
    let now = Date.parse('2026-11-14T00:00:00Z');
    const f = await enabledFixture({ now: () => now });
    const http = await memberHttp(f);
    const cookie = (await http.signIn('bob', f.initialPassword)).headers.get('set-cookie') ?? '';
    for (let i = 0; i < 4; i++)
      expect((await http.password(cookie, 'wrong-current', 'member-password-1')).status).toBe(401);
    const signInLimited = await http.signIn('bob', f.initialPassword);
    expect(signInLimited.status).toBe(429);
    expect(await signInLimited.json()).toEqual({ code: 'rate-limited', retryAfterSeconds: 60 });
    now += 60_000;
    for (let i = 0; i < 4; i++)
      expect((await http.signIn('bob', 'wrong-password')).status).toBe(401);
    expect((await http.signIn('bob', f.initialPassword)).status).toBe(200);
    const passwordLimited = await http.password(cookie, f.initialPassword, 'member-password-1');
    expect(passwordLimited.status).toBe(429);
    expect(await passwordLimited.json()).toEqual({ code: 'rate-limited', retryAfterSeconds: 60 });
    now += 60_000;
    for (let i = 0; i < 20; i++)
      expect((await http.signIn(`unknown-${i}`, 'wrong-password')).status).toBe(401);
    const ipLimited = await http.password(cookie, f.initialPassword, 'member-password-1');
    expect(ipLimited.status).toBe(429);
    expect(await ipLimited.json()).toEqual({ code: 'rate-limited', retryAfterSeconds: 60 });
    expect(f.team.member(f.human.humanId)?.mustChangePassword).toBe(true);
  });
});

describe('member entry addresses', () => {
  it('offers only non-loopback HTTPS or explicitly allowed LAN HTTP addresses', () => {
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
    expect(f.team.mode(owner).memberUrls).toEqual([...https, ...lan]);
    f.team.setInsecureHttp(owner, false);
    expect(f.team.mode(owner).memberUrls).toEqual(https);
    const local = teamFixture({ urls: () => [entry('http://127.0.0.1:5050')] });
    expect(local.team.mode(owner).memberUrls).toEqual([]);
  });
});

describe('M3 Host Roles and devices', { timeout: 60_000 }, () => {
  async function actors() {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const alice = await f.team.createMember(owner, 'alice', 'Alice');
    await f.team.changePassword(
      humanContext(alice.member.humanId),
      alice.initialPassword,
      'alice-password-1',
    );
    const bobLogin = await f.team.signIn('bob', 'member-password-1', 'bob-ip');
    const aliceLogin = await f.team.signIn('alice', 'alice-password-1', 'alice-ip');
    const invoke = (method: string, args: Record<string, unknown> = {}, peer = bobLogin.peer) =>
      f.gateway.invoke({ namespace: 'botharness', method, args, peer });
    return { ...f, alice, bobLogin, aliceLogin, invoke };
  }

  it('exposes fixed ids, built-ins and a self-only viewer; unions roles and keeps Owner implicit', async () => {
    const f = await actors();
    const catalog = z
      .array(z.object({ id: z.string(), group: z.string() }).strict())
      .parse(await f.invoke('permissionCatalog'));
    expect(catalog).toHaveLength(15);
    expect(f.team.mode(owner).viewer).toMatchObject({
      owner: true,
      roleIds: [],
      permissions: catalog.map((p) => p.id),
    });
    expect(f.team.mode(f.human).viewer).toMatchObject({
      owner: false,
      roleIds: ['member'],
      permissions: ['channels.create', 'dm.humans', 'bots.create', 'models.use'],
    });
    const builtins = f.team.roles.list(owner);
    expect(builtins.find((r) => r.builtin === 'admin')?.permissions).toHaveLength(14);
    expect(builtins.find((r) => r.builtin === 'admin')?.permissions).not.toContain(
      'privateContent.view',
    );
    expect(builtins.find((r) => r.builtin === 'member')?.memberCount).toBe(2);
    const { role } = f.team.roles.create(owner, 'Operators', ['usage.view', 'audit.view']);
    f.team.roles.set(owner, f.human.humanId, ['member', role.roleId, role.roleId]);
    expect(f.team.mode(f.human).viewer.permissions).toEqual([
      'channels.create',
      'dm.humans',
      'bots.create',
      'models.use',
      'usage.view',
      'audit.view',
    ]);
    expect(f.team.members(owner).find((m) => m.humanId === f.human.humanId)).toMatchObject({
      roleIds: ['member', role.roleId].sort(),
      deviceCount: 1,
    });
    const before = f.db.diagnostics().metrics.reads;
    expect(f.team.roles.permissions(f.human)).toContain('audit.view');
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
  });

  it.each(['', ' ', 'a'.repeat(129), 'a\u0000b'])(
    'refuses invalid role names: %j',
    async (name) => {
      const f = await enabledFixture();
      expect(() => f.team.roles.create(owner, name, [])).toThrow('role-name-invalid');
    },
  );

  it('validates names and permissions and preserves built-ins', async () => {
    const f = await enabledFixture();
    const { role } = f.team.roles.create(owner, 'Finance', ['usage.view', 'usage.view']);
    expect(role.permissions).toEqual(['usage.view']);
    expect(() => f.team.roles.create(owner, ' finance ', [])).toThrow('role-name-taken');
    expect(() => f.team.roles.update(owner, role.roleId, { name: 'ADMIN' })).toThrow(
      'role-name-taken',
    );
    expect(() => f.team.roles.create(owner, 'Unknown', ['not-a-permission'])).toThrow(
      'permission-unknown',
    );
    expect(() => f.team.roles.update(owner, role.roleId, { permissions: ['bogus'] })).toThrow(
      'permission-unknown',
    );
    expect(() =>
      f.team.roles.update(owner, 'admin', { permissions: ['privateContent.view'] }),
    ).toThrow('permission-not-grantable');
    expect(() => f.team.roles.update(owner, 'absent', {})).toThrow('role-not-found');
    expect(() => f.team.roles.delete(owner, 'absent')).toThrow('role-not-found');
    for (const id of ['admin', 'member'])
      expect(() => f.team.roles.delete(owner, id)).toThrow('role-builtin');
    expect(
      f.team.roles.update(owner, 'admin', { name: 'Operators', permissions: ['roles.manage'] })
        .role,
    ).toMatchObject({ builtin: 'admin', name: 'Operators', permissions: ['roles.manage'] });
  });

  it('repairs the last deleted role with member and keeps other roles intact', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Temporary', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    f.team.roles.set(owner, f.alice.member.humanId, ['admin', role.roleId]);
    f.team.roles.delete(owner, role.roleId);
    expect(f.team.member(f.human.humanId)?.roleIds).toEqual(['member']);
    expect(f.team.member(f.alice.member.humanId)?.roleIds).toEqual(['admin']);
    f.team.roles.set(owner, f.human.humanId, []);
    expect(f.team.member(f.human.humanId)?.roleIds).toEqual(['member']);
  });

  it('admits member managers, refuses Admin grants, and reevaluates existing Peers after permission removal', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Member managers', ['members.manage']);
    f.team.roles.set(owner, f.human.humanId, ['member', role.roleId]);
    expect(await f.invoke('roles')).toBeInstanceOf(Array);
    const created = await f.invoke('memberCreate', { username: 'carol', displayName: 'Carol' });
    expect(created).toMatchObject({ member: { roleIds: ['member'] } });
    await expect(
      f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: ['admin'] }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(
      f.invoke('memberCreate', { username: 'admin2', displayName: 'Admin', roleIds: ['admin'] }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(
      f.invoke('memberRolesSet', { humanId: 'absent', roleIds: ['member'] }),
    ).rejects.toMatchObject({ code: 'member-not-found' });
    await expect(
      f.invoke('memberRolesSet', { humanId: owner.humanId, roleIds: ['member'] }),
    ).rejects.toMatchObject({ code: 'owner-protected' });
    await expect(
      f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: ['absent'] }),
    ).rejects.toMatchObject({ code: 'role-not-found' });
    const before = f.invalidate.mock.calls.length;
    f.team.roles.update(owner, role.roleId, { permissions: [] });
    expect(f.invalidate.mock.calls.length).toBeGreaterThan(before);
    await expect(f.invoke('members')).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    await expect(f.invoke('roles')).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'roles.manage' },
    });
    expect(f.team.resolve(f.bobLogin.peer.principal)).toEqual(f.human);
  });

  it('authorizes role editors and Team settings independently', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Settings', [
      'roles.manage',
      'team.settings',
      'audit.view',
      'usage.view',
    ]);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    const result = await f.invoke('roleCreate', { name: 'Reviewers', permissions: ['audit.view'] });
    const id = z.object({ role: z.object({ roleId: z.string() }) }).parse(result).role.roleId;
    await f.invoke('roleUpdate', { roleId: id, permissions: ['usage.view'] });
    await f.invoke('roleDelete', { roleId: id });
    await f.invoke('teamInsecureHttpSet', { allowed: true });
    expect(f.team.mode(f.human).insecureHttpAllowed).toBe(true);
    const group = f.channels.createGroup(owner, { name: 'Publish', members: [] });
    await f.invoke('channelPublicSet', { channelId: group.id, public: true });
    expect(f.team.publicChannels(f.human).map((c) => c.channelId)).toContain(group.id);
    await expect(f.invoke('members')).rejects.toMatchObject({ code: 'permission-required' });
    await expect(
      f.invoke('teamOwnerPasswordSet', { password: 'replacement-password' }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await f.invoke('teamModeSet', { enabled: false });
    expect(f.bobLogin.peer.signal.aborted).toBe(true);
  });

  it('keeps password recovery Owner-only across ownership transfer', async () => {
    const f = await actors();
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    await expect(
      f.invoke('memberPasswordReset', { humanId: f.alice.member.humanId }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    const oldOwner = await f.team.signIn('owner', 'owner-password-1', 'owner-ip');
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    await expect(
      f.invoke('memberPasswordReset', { humanId: f.alice.member.humanId }, oldOwner.peer),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(
      f.invoke('memberPasswordReset', { humanId: f.human.humanId }),
    ).rejects.toMatchObject({ code: 'owner-protected' });
    expect(await f.invoke('memberPasswordReset', { humanId: owner.humanId })).toMatchObject({
      initialPassword: expect.any(String),
    });
    expect(f.team.member(owner.humanId)?.mustChangePassword).toBe(true);
    expect(oldOwner.peer.signal.aborted).toBe(true);
  });

  describe('role delegation ceiling', () => {
    const paths = [
      'create',
      'update-grant',
      'rename-existing',
      'strip-existing',
      'delete-existing',
      'assign',
      'member-create',
    ] as const;
    it.each(
      paths.flatMap((path) => [
        { path, permission: 'privateContent.view', admin: true },
        { path, permission: 'audit.view', admin: false },
      ]),
    )(
      'refuses $path beyond the caller ceiling: $permission',
      async ({ path, permission, admin }) => {
        const f = await actors();
        const manager = f.team.roles.create(owner, 'Managers', [
          'roles.manage',
          'members.manage',
        ]).role;
        f.team.roles.set(owner, f.human.humanId, admin ? ['admin'] : ['member', manager.roleId]);
        const existing = ['update-grant', 'create'].includes(path) ? [] : [permission];
        const protectedRole = f.team.roles.create(owner, 'Protected', existing).role;
        const beforeRoles = f.team.roles.list(owner);
        const beforeMembers = f.team.members(owner);
        const beforeInvalidations = f.invalidate.mock.calls.length;
        const run = () => {
          switch (path) {
            case 'create':
              return f.invoke('roleCreate', { name: 'Escalated', permissions: [permission] });
            case 'update-grant':
              return f.invoke('roleUpdate', {
                roleId: protectedRole.roleId,
                permissions: [permission],
              });
            case 'rename-existing':
              return f.invoke('roleUpdate', { roleId: protectedRole.roleId, name: 'Changed' });
            case 'strip-existing':
              return f.invoke('roleUpdate', { roleId: protectedRole.roleId, permissions: [] });
            case 'delete-existing':
              return f.invoke('roleDelete', { roleId: protectedRole.roleId });
            case 'assign':
              return f.invoke('memberRolesSet', {
                humanId: f.alice.member.humanId,
                roleIds: [protectedRole.roleId],
              });
            case 'member-create':
              return f.invoke('memberCreate', {
                username: 'escalated',
                displayName: 'Escalated',
                roleIds: [protectedRole.roleId],
              });
          }
        };
        await expect(run()).rejects.toMatchObject({
          code: 'permission-not-grantable',
          details: { permission },
        });
        expect(f.team.roles.list(owner)).toEqual(beforeRoles);
        expect(f.team.members(owner)).toEqual(beforeMembers);
        expect(f.invalidate.mock.calls.length).toBe(beforeInvalidations);
      },
    );

    it.each(['member', 'admin', 'private', 'absent'])(
      'refuses Admin self-assignment of %s',
      async (requested) => {
        const f = await actors();
        const privateRole = f.team.roles.create(owner, 'Private', ['privateContent.view']).role;
        f.team.roles.set(owner, f.human.humanId, ['admin']);
        const before = f.team.mode(f.human).viewer;
        await expect(
          f.invoke('memberRolesSet', {
            humanId: f.human.humanId,
            roleIds: [requested === 'private' ? privateRole.roleId : requested],
          }),
        ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
        expect(f.team.mode(f.human).viewer).toEqual(before);
      },
    );

    it.each(['create', 'update', 'assign', 'member-create'] as const)(
      'reserves private grants to Owner even when the caller already holds private access: %s',
      async (path) => {
        const f = await actors();
        const privateRole = f.team.roles.create(owner, 'Private', ['privateContent.view']).role;
        const empty = f.team.roles.create(owner, 'Empty', []).role;
        f.team.roles.set(owner, f.human.humanId, ['admin', privateRole.roleId]);
        const run = () => {
          switch (path) {
            case 'create':
              return f.invoke('roleCreate', {
                name: 'Another private role',
                permissions: ['privateContent.view'],
              });
            case 'update':
              return f.invoke('roleUpdate', {
                roleId: empty.roleId,
                permissions: ['privateContent.view'],
              });
            case 'assign':
              return f.invoke('memberRolesSet', {
                humanId: f.alice.member.humanId,
                roleIds: [privateRole.roleId],
              });
            case 'member-create':
              return f.invoke('memberCreate', {
                username: 'private2',
                displayName: 'Private',
                roleIds: [privateRole.roleId],
              });
          }
        };
        await expect(run()).rejects.toMatchObject({
          code: 'permission-not-grantable',
          details: { permission: 'privateContent.view' },
        });
      },
    );

    it('permits the Owner to create, edit, assign and delete private roles', async () => {
      const f = await actors();
      const role = f.team.roles.create(owner, 'Private', ['privateContent.view']).role;
      f.team.roles.update(owner, role.roleId, {
        name: 'Private access',
        permissions: ['privateContent.view', 'audit.view'],
      });
      f.team.roles.set(owner, f.human.humanId, [role.roleId]);
      f.team.roles.set(owner, f.alice.member.humanId, [role.roleId]);
      const created = await f.team.createMember(owner, 'private3', 'Private', [role.roleId]);
      for (const human of [
        f.human,
        humanContext(f.alice.member.humanId),
        humanContext(created.member.humanId),
      ])
        expect(f.team.roles.permissions(human)).toContain('privateContent.view');
      f.team.roles.delete(owner, role.roleId);
      expect(f.team.member(f.human.humanId)?.roleIds).toEqual(['member']);
    });

    it('permits delegation of held permissions to another member and new members', async () => {
      const f = await actors();
      f.team.roles.set(owner, f.human.humanId, ['admin']);
      const reads = f.db.diagnostics().metrics.reads;
      const role = f.team.roles.create(f.human, 'Auditors', ['audit.view']).role;
      expect(f.db.diagnostics().metrics.reads - reads).toBe(5);
      f.team.roles.update(f.human, role.roleId, { permissions: ['usage.view'] });
      f.team.roles.set(f.human, f.alice.member.humanId, [role.roleId]);
      const created = await f.team.createMember(f.human, 'auditor2', 'Auditor', [role.roleId]);
      expect(created.member.roleIds).toEqual([role.roleId]);
      f.team.roles.delete(f.human, role.roleId);
      expect(f.team.member(f.alice.member.humanId)?.roleIds).toEqual(['member']);
    });

    it('refuses self-assignment even without member-management permission', async () => {
      const f = await actors();
      await expect(
        f.invoke('memberRolesSet', { humanId: f.human.humanId, roleIds: ['member'] }),
      ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    });

    it.each(['actor-ceiling', 'assigned-role'] as const)(
      'rechecks delegation after member password hashing yields: %s',
      async (changed) => {
        const f = await actors();
        const manager = f.team.roles.create(owner, 'Managers', [
          'members.manage',
          'audit.view',
        ]).role;
        const assigned = f.team.roles.create(owner, 'Auditors', ['audit.view']).role;
        f.team.roles.set(owner, f.human.humanId, ['member', manager.roleId]);
        const pending = f.team.createMember(f.human, 'late-auditor', 'Late', [assigned.roleId]);
        if (changed === 'actor-ceiling')
          f.team.roles.update(owner, manager.roleId, { permissions: ['members.manage'] });
        else f.team.roles.update(owner, assigned.roleId, { permissions: ['privateContent.view'] });
        await expect(pending).rejects.toMatchObject({
          code: 'permission-not-grantable',
          details: {
            permission: changed === 'actor-ceiling' ? 'audit.view' : 'privateContent.view',
          },
        });
        expect(f.team.members(owner).some((member) => member.username === 'late-auditor')).toBe(
          false,
        );
      },
    );

    it('checks the automatic Member fallback against the deleting caller ceiling', async () => {
      const f = await actors();
      f.team.roles.set(owner, f.human.humanId, ['admin']);
      const role = f.team.roles.create(owner, 'Temporary', ['usage.view']).role;
      f.team.roles.set(owner, f.alice.member.humanId, [role.roleId]);
      f.team.roles.update(owner, 'member', { permissions: ['privateContent.view'] });
      const before = f.team.roles.list(owner);
      await expect(f.invoke('roleDelete', { roleId: role.roleId })).rejects.toMatchObject({
        code: 'permission-not-grantable',
        details: { permission: 'privateContent.view' },
      });
      expect(f.team.roles.list(owner)).toEqual(before);
      expect(f.team.member(f.alice.member.humanId)?.roleIds).toEqual([role.roleId]);
    });
  });

  it('lists only the target grants, marks the authenticated grant, and revokes its Peer immediately', async () => {
    const f = await actors();
    const principal = f.bobLogin.peer.principal;
    if (principal.kind !== 'botharness-member') throw new Error('missing grant');
    await expect(
      f.invoke('memberDevices', { humanId: f.human.humanId, currentGrantId: f.aliceLogin.peer.id }),
    ).rejects.toMatchObject({ code: 'gateway/arguments-invalid' });
    expect(await f.invoke('memberDevices', { humanId: f.human.humanId })).toEqual([
      {
        grantId: principal.grantId,
        label: '',
        kind: 'browser',
        createdAt: '2026-11-14T00:00:00.000Z',
        lastSeenAt: '2026-11-14T00:00:00.000Z',
        current: true,
      },
    ]);
    await expect(
      f.invoke('memberDevices', { humanId: f.alice.member.humanId }),
    ).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    await expect(
      f.invoke('memberDeviceRevoke', {
        humanId: f.alice.member.humanId,
        grantId: principal.grantId,
      }),
    ).rejects.toMatchObject({ code: 'permission-required' });
    await expect(
      f.invoke('memberDeviceRevoke', { humanId: f.human.humanId, grantId: 'absent' }),
    ).rejects.toMatchObject({ code: 'device-not-found' });
    await f.invoke('memberDeviceRevoke', { humanId: f.human.humanId, grantId: principal.grantId });
    expect(f.bobLogin.peer.signal.aborted).toBe(true);
    expect(f.team.admit(f.bobLogin.token)).toBeUndefined();
    expect(f.team.memberDevices(owner, f.human.humanId)).toEqual([]);
    expect(f.aliceLogin.peer.signal.aborted).toBe(false);
    expect(f.team.member(f.human.humanId)?.deviceCount).toBe(0);
  });

  it('uses the pairing authority to revoke paired devices and excludes revoked rows from counts', async () => {
    const f = await actors();
    f.database.transaction((db) =>
      db
        .prepare(
          `INSERT INTO paired_devices(device_id, name, secret_hash, paired_at, human_id) VALUES ('paired-bob', 'Bob phone', 'hash', ?, ?)`,
        )
        .run('2026-11-14T00:00:00.000Z', f.human.humanId),
    );
    const revoke = vi.fn((deviceId: string) => {
      f.database.transaction((db) =>
        db
          .prepare('UPDATE paired_devices SET revoked_at = ? WHERE device_id = ?')
          .run('2026-11-14T00:00:01.000Z', deviceId),
      );
      return { revoked: true, closedStreams: 1 };
    });
    const off = f.team.bindPairing({ revoke, clearOffers: vi.fn() });
    expect(f.team.member(f.human.humanId)?.deviceCount).toBe(2);
    expect(f.team.memberDevices(f.human, f.human.humanId)).toContainEqual(
      expect.objectContaining({ grantId: 'paired-bob', kind: 'paired-device', label: 'Bob phone' }),
    );
    await f.invoke('memberDeviceRevoke', { humanId: f.human.humanId, grantId: 'paired-bob' });
    expect(revoke).toHaveBeenCalledWith('paired-bob');
    expect(f.team.member(f.human.humanId)?.deviceCount).toBe(1);
    off();
  });

  it('transfers unique Owner authority atomically without transferring Human data or native access', async () => {
    const f = await actors();
    await expect(
      f.invoke('ownerTransfer', { humanId: f.alice.member.humanId, password: 'owner-password-1' }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(f.team.transferOwner(owner, f.human.humanId, 'wrong')).rejects.toMatchObject({
      code: 'credentials-invalid',
    });
    await expect(f.team.transferOwner(owner, 'absent', 'owner-password-1')).rejects.toMatchObject({
      code: 'member-not-found',
    });
    await f.team.suspend(owner, f.alice.member.humanId);
    await expect(
      f.team.transferOwner(owner, f.alice.member.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'member-suspended' });
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    expect(f.team.mode(f.human).viewer).toMatchObject({ owner: true, roleIds: [] });
    expect(f.team.mode(owner).viewer).toMatchObject({ owner: false, roleIds: ['admin'] });
    expect(
      f.team
        .members(f.human)
        .filter((m) => m.owner)
        .map((m) => m.humanId),
    ).toEqual([f.human.humanId]);
    const localPeer = new Peer(f.ctx, { principal: { kind: 'owner' } });
    expect(resolveInvocationHuman(localPeer, undefined, f.team)).toEqual(f.human);
    await expect(
      f.team.transferOwner(owner, f.alice.member.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'permission-required' });
    new NativeSession(f.ctx);
    await expect(
      f.gateway.invoke({ namespace: 'session', method: 'list', args: {}, peer: f.bobLogin.peer }),
    ).rejects.toMatchObject({ code: 'remote-access/denied' });
    await expect(f.team.signIn('owner', 'owner-password-1', 'old-owner-ip')).resolves.toMatchObject(
      { member: { owner: false, roleIds: ['admin'] } },
    );
    await expect(f.team.signIn('bob', 'member-password-1', 'new-owner-ip')).resolves.toMatchObject({
      member: { owner: true, roleIds: [] },
    });
    await f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: ['admin'] });
  });

  it('retains M1 identities and credentials while assigning the built-in Member role on upgrade', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`PRAGMA foreign_keys = ON;
        CREATE TABLE humans(human_id TEXT PRIMARY KEY);
        CREATE TABLE team_settings(singleton INTEGER PRIMARY KEY, enabled INTEGER, insecure_http_allowed INTEGER);
        INSERT INTO team_settings VALUES (1, 1, 0);
        INSERT INTO humans VALUES ('local-human'), ('existing-member');`);
      const migration = BOT_HARNESS_SCHEMA_PLAN.migrations.find(
        (entry) => entry.generation === 142,
      );
      if (!migration) throw new Error('missing migration');
      migration.migrate(db);
      expect(db.prepare('SELECT * FROM human_roles').all()).toEqual([
        { human_id: 'existing-member', role_id: 'member' },
      ]);
      expect(db.prepare('SELECT owner_human_id FROM team_settings').get()).toEqual({
        owner_human_id: 'local-human',
      });
      expect(db.prepare('SELECT human_id FROM humans ORDER BY human_id').all()).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it('revokes old Owner paired-device streams and pending offers without rebinding their Human identity', async () => {
    const f = await actors();
    const onRevoked = vi.fn();
    const pairing = createDevicePairing({
      database: f.database,
      hostName: 'Test',
      ownerHumanId: () => f.team.ownerContext().humanId,
      onRevoked,
    });
    f.team.bindPairing(pairing);
    const oldOffer = pairing.createOffer();
    const old = pairing.redeem({ offer: pairing.createOffer().offer });
    if (!old.ok) throw new Error('pairing failed');
    const close = vi.fn();
    pairing.attachStream(old.device.id, close);
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    expect(close).toHaveBeenCalledOnce();
    expect(onRevoked).toHaveBeenCalledWith(old.device.id);
    expect(pairing.admit(`Device ${old.credential}`)).toMatchObject({
      ok: false,
      code: 'device-revoked',
    });
    expect(pairing.redeem({ offer: oldOffer.offer })).toMatchObject({
      ok: false,
      code: 'offer-invalid',
    });
    expect(f.team.memberDevices(f.human, owner.humanId)).toEqual([]);
    const fresh = pairing.redeem({ offer: pairing.createOffer().offer });
    if (!fresh.ok) throw new Error('new Owner pairing failed');
    const before = f.db.diagnostics().metrics.reads;
    expect(pairing.admit(`Device ${fresh.credential}`).ok).toBe(true);
    expect(f.db.diagnostics().metrics.reads - before).toBe(2);
    expect(f.team.memberDevices(f.human, f.human.humanId)).toContainEqual(
      expect.objectContaining({ grantId: fresh.device.id, kind: 'paired-device' }),
    );
  });

  it.each([
    'roster-baseline',
    'roster-queued',
    'roster-publish',
    'roster-sse',
    'channel-open',
    'channel-follow-new',
    'channel-queued',
    'channel-publish',
  ] as const)('removes former Owner-wide live visibility after transfer: %s', async (path) => {
    const f = await actors();
    const alice = humanContext(f.alice.member.humanId);
    const secret = f.channels.getOrCreateDm(alice, 'alice-private', 'Alice private');
    if (!secret) throw new Error('missing private DM');
    const placement = {
      sourceEventId: 'alice-secret-source',
      channelId: secret.id,
      messageId: 'alice-secret-message',
    };
    f.setPlacements([placement]);
    const controller = new AbortController();
    const roster = f.live.followRoster(owner, controller.signal)[Symbol.asyncIterator]();
    const channel = f.live
      .followChannel(owner, secret.id, 10, controller.signal)
      [Symbol.asyncIterator]();
    const opened = f.live.open(
      owner,
      new Request('http://localhost/api/botharness/stream?scope=roster'),
    );
    const reader = opened.body?.getReader();
    const publish = async () => {
      const message = await f.channels.appendMessage(alice, secret.id, {
        id: 'alice-secret-message',
        at: '2026-11-14T00:00:00Z',
        author: { kind: 'human', humanId: alice.humanId },
        body: 'Alice private text',
      });
      if (!message) throw new Error('missing private message');
      f.live.publishCommitted({
        channelId: secret.id,
        message,
        revision: f.channels.revision(secret.id),
      });
    };
    try {
      expect((await roster.next()).value).toMatchObject({
        type: 'baseline',
        placements: [placement],
      });
      expect((await channel.next()).value).toMatchObject({ type: 'opened' });
      await reader?.read();
      await reader?.read();
      if (path === 'roster-queued' || path === 'channel-queued') {
        await publish();
        f.live.publishContentPurged();
      }
      await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
      if (path === 'roster-baseline') {
        const old = f.live.followRoster(owner, controller.signal)[Symbol.asyncIterator]();
        const current = f.live.followRoster(f.human, controller.signal)[Symbol.asyncIterator]();
        try {
          expect((await old.next()).value).toEqual({ type: 'baseline', placements: [] });
          expect((await current.next()).value).toEqual({
            type: 'baseline',
            placements: [placement],
          });
        } finally {
          await old.return?.();
          await current.return?.();
        }
      } else if (path === 'channel-open') {
        const denied = f.live.open(
          owner,
          new Request(`http://localhost/api/botharness/stream?channelId=${secret.id}`),
        );
        await denied.body?.cancel();
        expect(denied.status).toBe(404);
      } else if (path === 'channel-follow-new') {
        const denied = f.live
          .followChannel(owner, secret.id, 10, controller.signal)
          [Symbol.asyncIterator]();
        await expect(denied.next()).rejects.toMatchObject({ code: 'not-found' });
        await denied.return?.();
      } else if (path === 'channel-queued' || path === 'channel-publish') {
        if (path === 'channel-publish') await publish();
        expect((await channel.next()).done).toBe(true);
      } else {
        if (path !== 'roster-queued') {
          await publish();
          f.live.publishContentPurged();
        }
        f.live.publishRosterCommitted();
        if (path === 'roster-sse') {
          const frame = new TextDecoder().decode((await reader?.read())?.value);
          expect(frame).toContain('event: roster/changed');
          expect(frame).not.toContain('alice-secret');
        } else expect((await roster.next()).value).toEqual({ type: 'changed' });
      }
    } finally {
      controller.abort();
      await reader?.cancel();
      await roster.return?.();
      await channel.return?.();
    }
  });

  it('requires current-Owner credential provenance for transfer, beyond the forced-change flag', async () => {
    const f = await actors();
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    const created = await f.team.createMember(f.human, 'managed-target', 'Target');
    const target = humanContext(created.member.humanId);
    await expect(
      f.team.transferOwner(owner, target.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    await f.team.changePassword(target, created.initialPassword, 'manager-known-password-1');
    expect(f.team.member(target.humanId)?.mustChangePassword).toBe(false);
    const retained = await f.team.signIn(
      'managed-target',
      'manager-known-password-1',
      'manager-ip',
    );
    await expect(
      f.team.transferOwner(owner, target.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    const reset = await f.team.resetPassword(owner, target.humanId);
    expect(retained.peer.signal.aborted).toBe(true);
    await expect(
      f.team.signIn('managed-target', 'manager-known-password-1', 'manager-ip'),
    ).rejects.toMatchObject({ code: 'credentials-invalid' });
    await expect(
      f.team.transferOwner(owner, target.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    await f.team.changePassword(target, reset.initialPassword, 'target-only-password-2');
    await f.team.transferOwner(owner, target.humanId, 'owner-password-1');
    expect(f.team.ownerContext()).toEqual(target);
  });

  it('refuses transfer with unknown legacy credential provenance', async () => {
    const f = await actors();
    f.database.transaction((db) =>
      db
        .prepare(
          "UPDATE member_credentials SET password_json = json_remove(password_json, '$.ownerIssuerHumanId') WHERE human_id = ?",
        )
        .run(f.human.humanId),
    );
    await expect(
      f.team.transferOwner(owner, f.human.humanId, 'owner-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    expect(f.team.ownerContext()).toEqual(owner);
  });

  it('requires credential issuance by the current Owner rather than a previous Owner', async () => {
    const f = await actors();
    const alice = humanContext(f.alice.member.humanId);
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    await expect(
      f.team.transferOwner(f.human, alice.humanId, 'member-password-1'),
    ).rejects.toMatchObject({ code: 'owner-transfer-target-unverified' });
    const reset = await f.team.resetPassword(f.human, alice.humanId);
    await f.team.changePassword(alice, reset.initialPassword, 'alice-new-private-password-2');
    await f.team.transferOwner(f.human, alice.humanId, 'member-password-1');
    expect(f.team.ownerContext()).toEqual(alice);
  });

  it('invalidates outstanding pairing offers permanently across an Owner round trip', async () => {
    const f = await actors();
    const pairing = createDevicePairing({
      database: f.database,
      hostName: 'Test',
      ownerHumanId: () => f.team.ownerContext().humanId,
    });
    f.team.bindPairing(pairing);
    const offered = pairing.createOffer();
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    const reset = await f.team.resetPassword(f.human, owner.humanId);
    await f.team.changePassword(owner, reset.initialPassword, 'returned-owner-password-2');
    await f.team.transferOwner(f.human, owner.humanId, 'member-password-1');
    expect(pairing.redeem({ offer: offered.offer })).toEqual({ ok: false, code: 'offer-invalid' });
    expect(pairing.offerStatus(offered.receipt)).toMatchObject({ state: 'superseded' });
  });

  it('removes every effective permission from suspended Humans, including an in-flight member creator', async () => {
    const f = await actors();
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    const pending = f.team.createMember(f.human, 'late-suspended', 'Late').then(
      (member) => ({ member }),
      (error: unknown) => ({ error }),
    );
    await f.team.suspend(owner, f.human.humanId);
    expect(f.team.roles.permissions(f.human)).toEqual([]);
    expect(await pending).toMatchObject({
      error: { code: 'permission-required', details: { permission: 'members.manage' } },
    });
    expect(f.team.members(owner).some((member) => member.username === 'late-suspended')).toBe(
      false,
    );
    f.database.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = ?").run(owner.humanId),
    );
    expect(f.team.roles.permissions(owner)).toEqual([]);
  });

  it('rechecks member-creation authority after password hashing yields', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Managers', ['members.manage']);
    f.team.roles.set(owner, f.human.humanId, ['member', role.roleId]);
    const pending = f.team.createMember(f.human, 'late-member', 'Late');
    f.team.roles.update(owner, role.roleId, { permissions: [] });
    await expect(pending).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    expect(f.team.members(owner).some((m) => m.username === 'late-member')).toBe(false);
  });

  it('keeps directory and permission query counts constant as the team grows', async () => {
    const f = await actors();
    f.database.transaction((db) => {
      for (let index = 0; index < 1000; index++) {
        db.prepare("INSERT INTO humans VALUES (?, ?, 'active', '2026-11-14T00:00:00Z')").run(
          `scale-${index}`,
          `scale-${index}`,
        );
        db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(`scale-${index}`);
      }
    });
    let before = f.db.diagnostics().metrics.reads;
    expect(f.team.roles.permissions(f.human)).toContain('channels.create');
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
    before = f.db.diagnostics().metrics.reads;
    expect(f.team.members(owner)).toHaveLength(1003);
    expect(f.db.diagnostics().metrics.reads - before).toBe(2);
    before = f.db.diagnostics().metrics.reads;
    expect(f.team.roles.list(owner)).toHaveLength(2);
    expect(f.db.diagnostics().metrics.reads - before).toBe(2);
  });

  it.each([
    ['permissionCatalog', {}, null],
    ['roles', {}, 'roles.manage'],
    ['roleCreate', { name: 'Not allowed', permissions: [] }, 'roles.manage'],
    ['roleUpdate', { roleId: 'admin', permissions: [] }, 'roles.manage'],
    ['roleDelete', { roleId: 'admin' }, 'roles.manage'],
    ['members', {}, 'members.manage'],
    ['memberCreate', { username: 'not-allowed', displayName: 'No' }, 'members.manage'],
    ['memberRolesSet', { humanId: 'other-human', roleIds: [] }, 'members.manage'],
    ['memberDevices', { humanId: 'other-human' }, 'members.manage'],
    ['memberDeviceRevoke', { humanId: 'other-human', grantId: 'other-grant' }, 'members.manage'],
    ['ownerTransfer', { humanId: 'other-human', password: 'password' }, 'owner'],
    ['memberPasswordReset', { humanId: 'other-human' }, 'owner'],
    ['teamModeSet', { enabled: true }, 'team.settings'],
    ['teamInsecureHttpSet', { allowed: true }, 'team.settings'],
    ['teamOwnerPasswordSet', { password: 'password' }, 'owner'],
    ['channelPublicSet', { channelId: 'private-channel', public: true }, 'team.settings'],
  ] as const)(
    'scopes newly allowed %s with no other Human content or counts',
    async (method, args, permission) => {
      const f = await actors();
      f.channels.createGroup(owner, { name: 'Secret owner channel', members: [] });
      const argsCopy: Record<string, unknown> = { ...args };
      let result: unknown;
      if (permission) {
        const error = await f.invoke(method, argsCopy).catch((failure: unknown) => failure);
        expect(error).toMatchObject({ code: 'permission-required', details: { permission } });
        result = error;
      } else result = await f.invoke(method, argsCopy);
      const encoded = JSON.stringify(result);
      for (const secret of [
        f.alice.member.humanId,
        'Alice',
        'Secret owner channel',
        'local-human',
        'other-human',
        'other-grant',
      ])
        expect(encoded).not.toContain(secret);
    },
  );
});
