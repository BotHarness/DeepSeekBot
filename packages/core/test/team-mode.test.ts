import { createServer, IncomingMessage } from 'node:http';
import { Socket } from 'node:net';
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
import { TeamService, TeamError } from '../src/team/service.js';
import { ARGON2_PARAMS, hashPassword, verifyPassword } from '../src/team/password.js';
import { SignInRateLimit } from '../src/team/rate-limit.js';
import { memberPolicy, MEMBER_GLOBAL_METHODS, MEMBER_CHANNEL_METHODS } from '../src/team/policy.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
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
});

function teamFixture() {
  const root = createTempRoot('team-mode-');
  const registry = createTestRegistry({ rootDir: root });
  const db = registryDatabase(root);
  const database = attachOperationalModule(db, 'team');
  const channels = createSqliteChannelStore({ database, rootDir: join(root, 'channels') });
  let placements: Array<{ sourceEventId: string; channelId: string; messageId: string }> = [];
  const live = createChannelLiveHub(channels, undefined, () => placements);
  const team = new TeamService(database, channels, {
    now: () => Date.parse('2026-11-14T00:00:00Z'),
  });
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
    urls: () => ['https://host.test/botharness-device/team/'],
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
    lookups: { definitions: () => [] },
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

async function enabledFixture() {
  const fixture = teamFixture();
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
    expect(() => f.team.members(humanContext(created.member.humanId))).toThrow('forbidden');
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
    const streams = new Set(['followRoster', 'followChannel']);
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
    for (const method of ['channelGet', 'channelSendStatus'])
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
  return { origin, signIn };
}

describe('member HTTP carrier', { timeout: 60_000 }, () => {
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
    const shell = await fetch(`${http.origin}${TEAM_PATH}/`, { headers: { cookie } });
    expect(await shell.text()).toContain('__DSH_TRANSPORT__');
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
    expect(await after.text()).toContain('id="sign-in"');
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
});
