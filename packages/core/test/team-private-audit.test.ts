import { createDevicePairing } from '../src/devices/pairing.js';
import { pairedDeviceHuman } from '../src/team/device-audience.js';
import { createServer } from 'node:http';
import { Context } from '@deepseek-ai/cordis';
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import {
  humanContext,
  OWNER_HUMAN_CONTEXT as owner,
  type HumanContext,
} from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { DUMMY_PASSWORD_HASH } from '../src/team/password.js';
import { TeamService } from '../src/team/service.js';
import { createTeamBridge } from '../src/team/bridge.js';
import { memberPolicy } from '../src/team/policy.js';
import { auditRecordSchema } from '../src/team/private-contract.js';
import type { PrivateObject } from '../src/team/private-contract.js';
import type { ChannelMessageAuthor } from '../src/channels/message-author.js';
import { createTobHostCliOperations } from '../src/tob/cli-host-commands.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot } from './helpers.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const carol = humanContext('carol');
const closes: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
const openedSchema = z.object({
  viewId: z.string(),
  object: z.object({ objectId: z.string() }),
  messages: z.array(z.object({ id: z.string(), body: z.string() })),
});
const logSchema = z.object({ records: z.array(auditRecordSchema), next: z.string().optional() });

async function fixture() {
  let now = Date.parse('2026-11-15T00:00:00Z');
  const core = createCore({ dshHome: createTempRoot('private-audit-') });
  closes.push(async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'team');
  db.transaction((sql) => {
    for (const human of [alice, bob, carol]) {
      sql
        .prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)")
        .run(human.humanId, human.humanId, new Date(now).toISOString());
      sql.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
      sql
        .prepare('INSERT INTO member_credentials VALUES (?, ?, ?, ?, 0)')
        .run(human.humanId, human.humanId, JSON.stringify(DUMMY_PASSWORD_HASH), '[]');
    }
    sql.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const human of [owner, alice, bob, carol]) core.team.spaces.ensureAccount(human.humanId);
  const team = new TeamService(db, core.channels, {
    now: () => now,
    spaces: () => core.team.spaces,
  });
  team.privateAccess.bind({ registry: core.registry, memory: core.memory });
  const auditor = team.roles.create(owner, 'Auditor', ['privateContent.view', 'audit.view']).role;
  team.roles.set(owner, carol.humanId, ['member', auditor.roleId]);
  const bot = core.registry.create({
    slug: 'alice-bot',
    displayName: 'Alice Bot',
    description: 'private profile',
    ownerHumanId: alice.humanId,
  });
  expect(bot.ok).toBe(true);
  expect(
    core.registry.create({ slug: 'bob-bot', displayName: 'Bob Bot', ownerHumanId: bob.humanId }).ok,
  ).toBe(true);
  db.transaction((sql) =>
    sql
      .prepare("UPDATE persona_bots SET visibility_json=? WHERE slug='bob-bot'")
      .run(JSON.stringify({ kind: 'public', audience: { kind: 'everyone' } })),
  );
  const dm = core.channels.getOrCreateDm(alice, 'alice-bot', 'Alice Bot');
  const botDm = core.channels.getOrCreateBotDm(alice, 'alice-bot', 'bob-bot', 'Bot conversation');
  const group = core.channels.createGroup(alice, { name: 'Private group', members: [] });
  const humanDm = core.channels.getOrCreateHumanDm?.(alice, 'dm-humans-a-b', [
    alice.humanId,
    bob.humanId,
  ]);
  if (!dm || !botDm || !humanDm) throw new Error('missing-channel');
  for (const id of [botDm.id, dm.id, group.id, humanDm.id]) {
    for (let index = 0; index < 52; index++)
      await core.channels.appendMessage(alice, id, {
        id: 'message-' + index,
        at: new Date(now + index).toISOString(),
        author:
          id === botDm.id
            ? { kind: 'bot', slug: 'alice-bot' }
            : { kind: 'human', humanId: alice.humanId, displayName: 'alice' },
        body: 'private-' + index,
        ...(id === botDm.id
          ? { botCausation: { rootSourceEventId: 'root', parentSourceEventId: 'parent', hop: 1 } }
          : {}),
      });
  }
  const methods = createBridgeMethodsForHumans({ ...core, team });
  const ctx = new Context();
  ctx.provide('typert');
  ctx.set('typert', {
    local: { get: () => undefined, hasSeen: () => false },
    lookups: { definitions: () => [], get: () => undefined },
    resources: { entries: () => [] },
  });
  const access = new RemoteAccessService(ctx);
  access.registerPolicy('botharness-member', memberPolicy(team));
  const gateway = new TypertGatewayService(ctx, {});
  registerBridge(ctx, methods, undefined, undefined, team);
  const off = team.bindRuntime({
    createPeer: (principal) => new Peer(ctx, { principal }),
    invalidate: () => access.invalidate(),
    urls: () => [],
  });
  closes.push(async () => {
    await off();
    await ctx.fiber.dispose();
  });
  const ownerPeer = new Peer(ctx, { principal: { kind: 'owner' } });
  const invoke = (
    method: string,
    args: Record<string, unknown> = {},
    peer: PeerScope = ownerPeer,
  ) => gateway.invoke({ namespace: 'botharness', method, args, peer });
  const targets = [
    { kind: 'bot', objectId: 'alice-bot' },
    { kind: 'channel', objectId: group.id },
    { kind: 'dm', objectId: dm.id },
    { kind: 'dm', objectId: humanDm.id },
    { kind: 'bot-dm', objectId: botDm.id },
  ];
  const log = () => logSchema.parse(team.privateAccess.log(owner, {}));
  return {
    core,
    team,
    db,
    targets,
    methods,
    invoke,
    log,
    advance: () => {
      now += 30 * 60 * 1000;
    },
  };
}

async function cliHost(f: Awaited<ReturnType<typeof fixture>>) {
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(302, { 'set-cookie': 'authority=owner; HttpOnly', location: '/' }).end();
      return;
    }
    if (request.headers.cookie !== 'authority=owner') {
      response.writeHead(401).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = z
      .object({
        method: z.string(),
        args: z.record(z.string(), z.unknown()).optional(),
        payload: z.object({ args: z.record(z.string(), z.unknown()) }).optional(),
        rpcId: z.unknown().optional(),
        username: z.string().optional(),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString()));
    try {
      const value =
        input.username === undefined
          ? await f.invoke(input.method.replace('botharness/', ''), input.payload?.args ?? {})
          : await f.team.asMember(input.username, (peer) =>
              f.invoke(input.method, input.args ?? {}, peer),
            );
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify(
          input.username === undefined
            ? { type: 'server-response', rpcId: input.rpcId, result: { ok: true, value } }
            : { ok: true, value },
        ),
      );
    } catch (error) {
      const failure = z
        .object({ code: z.string(), message: z.string(), details: z.unknown().optional() })
        .parse(error);
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify(
          input.username === undefined
            ? { type: 'server-response', rpcId: input.rpcId, result: { ok: false, error: failure } }
            : { ok: false, error: failure },
        ),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closes.push(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing-port');
  return async (argv: string[]) => {
    const output: string[] = [];
    const status = await runBotCreateCli(argv, {
      env: {
        DEEPSEEKBOT_HOST: `http://127.0.0.1:${address.port}`,
        DEEPSEEKBOT_HOST_TOKEN: 'test-secret',
      },
      stdout: (line) => output.push(line),
      stderr: () => {},
    });
    expect(output).toHaveLength(1);
    expect(output[0]).not.toContain('test-secret');
    return { status, output: JSON.parse(output[0] ?? '{}') };
  };
}

describe('M11 private-content audit', () => {
  it('lists ordered current owner display names without member-management permission, content or audit records', async () => {
    const f = await fixture();
    const viewer = f.team.roles.create(owner, 'Picker viewer', ['privateContent.view']).role;
    f.team.roles.set(owner, carol.humanId, ['member', viewer.roleId]);
    f.db.transaction((db) => {
      db.prepare("UPDATE humans SET display_name = 'Zoe Display' WHERE human_id = 'alice'").run();
      db.prepare("UPDATE humans SET display_name = 'Aaron Display' WHERE human_id = 'bob'").run();
    });
    expect(f.team.roles.permissions(carol)).not.toContain('members.manage');
    const run = await cliHost(f);
    const output = await run(['--as', 'carol', 'private', 'list']);
    expect(output.status).toBe(0);
    const rows = z
      .array(
        z
          .object({
            objectId: z.string(),
            ownerHumanIds: z.array(z.string()),
            ownerNames: z.array(z.string()),
          })
          .passthrough(),
      )
      .parse(output.output);
    const names = new Map([
      ['alice', 'Zoe Display'],
      ['bob', 'Aaron Display'],
    ]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        ['objectId', 'kind', 'name', 'ownerHumanIds', 'ownerNames'].sort(),
      );
      expect(row.ownerNames).toEqual(row.ownerHumanIds.map((id) => names.get(id)));
    }
    expect(rows.find((row) => row.ownerHumanIds.length === 2)).toMatchObject({
      ownerHumanIds: ['alice', 'bob'],
      ownerNames: ['Zoe Display', 'Aaron Display'],
    });
    f.db.transaction((db) =>
      db
        .prepare("UPDATE humans SET display_name = 'Updated Display' WHERE human_id = 'alice'")
        .run(),
    );
    expect(f.team.privateAccess.objects(carol, { kind: 'bot', humanId: 'alice' })).toMatchObject([
      { ownerHumanIds: ['alice'], ownerNames: ['Updated Display'] },
    ]);
    expect(JSON.stringify(rows)).not.toContain('private profile');
    expect(JSON.stringify(rows)).not.toContain('private-51');
    expect(f.log().records).toHaveLength(0);
  });

  it('retains the Bot–Bot DM participant after an interrupted peer Bot deletion', async () => {
    const f = await fixture();
    expect(f.core.registry.create({ slug: 'owner-private', displayName: 'Owner private' }).ok).toBe(
      true,
    );
    const dm = f.core.channels.getOrCreateBotDm(alice, 'alice-bot', 'owner-private', 'Retained DM');
    if (!dm) throw new Error('missing-dm');
    f.db.transaction((db) =>
      db.prepare('INSERT INTO persona_bot_deletions VALUES (?, ?)').run(
        'owner-private',
        JSON.stringify({
          slug: 'owner-private',
          displayName: 'Owner private',
          acceptedAt: 'now',
          eraseMemory: false,
          phase: 'incomplete',
          memory: 'retained',
          memoryDir: f.core.registry.memoryDirFor('owner-private'),
        }),
      ),
    );
    expect(f.core.registry.get('owner-private')).toBeUndefined();
    expect(f.core.registry.getHistorical('owner-private')?.ownerHumanId).toBe(owner.humanId);
    expect(f.team.privateAccess.objects(carol, {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ objectId: dm.id })]),
    );
    f.team.roles.set(
      owner,
      alice.humanId,
      f.team.roles
        .list(owner)
        .filter((role) => role.name === 'Auditor')
        .map((role) => role.roleId),
    );
    expect(() => f.team.privateAccess.open(alice, { kind: 'bot-dm', objectId: dm.id })).toThrow(
      expect.objectContaining({ code: 'own-content' }),
    );
    expect(f.team.privateAccess.open(carol, { kind: 'bot-dm', objectId: dm.id })).toMatchObject({
      object: { ownerHumanIds: [alice.humanId] },
    });
    expect(f.log().records).toHaveLength(1);
  });

  it('audits failed provider loads without retaining a view slot', async () => {
    const f = await fixture();
    const snapshot = vi.spyOn(f.core.memory, 'snapshot').mockImplementation(() => {
      throw new Error('provider-load-failed');
    });
    for (let n = 0; n < 129; n++)
      expect(() => f.team.privateAccess.open(owner, f.targets[0])).toThrow('provider-load-failed');
    snapshot.mockRestore();
    const opened = f.team.privateAccess.open(owner, f.targets[0]);
    expect(opened.viewId).toBeTruthy();
    expect(
      f.team.privateAccess.page(owner, { viewId: opened.viewId, before: 'missing-message' })
        .messages,
    ).toEqual([]);
    expect(f.team.privateAccess.log(owner, { limit: 200 }).records).toHaveLength(130);
    expect(f.team.privateAccess.verify(owner)).toEqual({ ok: true });
  });

  it('lists metadata only, filters ownership and kind, and emits the Team notice without recording a read', async () => {
    const f = await fixture();
    const rows = await f.invoke('privateObjects', { humanId: alice.humanId });
    expect(rows).toEqual(
      expect.arrayContaining(f.targets.map((target) => expect.objectContaining(target))),
    );
    expect(JSON.stringify(rows)).not.toContain('private profile');
    expect(JSON.stringify(rows)).not.toContain('private-51');
    expect(await f.invoke('privateObjects', { humanId: alice.humanId, kind: 'bot' })).toHaveLength(
      1,
    );
    expect(f.team.privateAccess.objects(carol, {})).toHaveLength(6);
    expect(f.log().records).toHaveLength(0);
    expect(f.team.mode(alice).privateAccessNotice).toBe(true);
    f.db.transaction((db) => db.prepare('UPDATE team_settings SET enabled = 0').run());
    expect(f.team.mode(owner).privateAccessNotice).toBeUndefined();
  });

  it.each([0, 1, 2, 3, 4])(
    'opens private target %i through Client RPC exactly once and pages without another record',
    async (index) => {
      const f = await fixture();
      const target = f.targets[index];
      if (!target) throw new Error('missing-target');
      const opened = openedSchema.parse(
        await f.invoke('privateContentOpen', { ...target, reason: 'support' }),
      );
      expect(opened.messages).toHaveLength(50);
      const before = opened.messages.at(-1)?.id;
      expect(await f.invoke('privateContentPage', { viewId: opened.viewId, before })).toMatchObject(
        {
          messages: expect.arrayContaining(
            [
              { id: 'message-1', body: 'private-1' },
              { id: 'message-0', body: 'private-0' },
            ].map((message) => expect.objectContaining(message)),
          ),
        },
      );
      expect(f.log().records).toHaveLength(1);
      expect(f.log().records[0]).toMatchObject({
        ...target,
        reason: 'support',
        viewerHumanId: owner.humanId,
      });
      expect(await f.invoke('auditVerify')).toEqual({ ok: true });
      if (target.kind === 'bot') {
        const result = await f.invoke('privateContentOpen', target);
        expect(result).toHaveProperty('memoryFiles');
        expect(result).toHaveProperty('object.profile.description', 'private profile');
        expect(f.log().records).toHaveLength(2);
      }
    },
  );

  it('refuses own content on every kind without recording, even for holders', async () => {
    const f = await fixture();
    f.team.roles.set(owner, alice.humanId, [
      f.team.roles.create(owner, 'Private viewer', ['privateContent.view']).role.roleId,
    ]);
    for (const target of f.targets)
      expect(await f.methods(alice).privateContentOpen(target)).toMatchObject({
        ok: false,
        error: { code: 'own-content' },
      });
    expect(f.log().records).toHaveLength(0);
  });

  it('enforces every service permission, refuses members the log, and rejects invalid inputs and objects', async () => {
    const f = await fixture();
    for (const method of [
      'privateObjects',
      'privateContentOpen',
      'privateContentPage',
      'auditLog',
      'auditVerify',
    ] as const) {
      expect(await f.methods(alice)[method]({})).toMatchObject({
        ok: false,
        error: {
          code: 'permission-required',
          details: {
            permission: method.startsWith('audit') ? 'audit.view' : 'privateContent.view',
          },
        },
      });
    }
    expect(
      await f.methods(owner).privateContentOpen({ kind: 'channel', objectId: 'missing' }),
    ).toMatchObject({ ok: false, error: { code: 'object-not-found' } });
    expect(
      await f.methods(owner).privateContentOpen({ kind: 'invalid', objectId: 'missing' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await f.methods(owner).auditLog({ limit: 201 })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await f.methods(owner).auditLog({ after: 'missing' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(
      await f.methods(owner).privateContentOpen({ ...f.targets[0], reason: 'x'.repeat(1025) }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(f.log().records).toHaveLength(0);
  });

  it.each([
    'privateObjects',
    'privateContentOpen',
    'privateContentPage',
    'auditLog',
    'auditVerify',
  ] as const)(
    'refuses Bot caller %s with Owner or holder identity in the service and cached bridge',
    async (method) => {
      const f = await fixture();
      for (const human of [owner, carol]) {
        const caller: HumanContext = { humanId: human.humanId, caller: 'bot' };
        const direct = createTeamBridge(caller, f.team);
        expect(await direct[method](f.targets[0])).toMatchObject({
          ok: false,
          error: { code: 'permission-required' },
        });
        expect(await f.methods(caller)[method](f.targets[0])).toMatchObject({
          ok: false,
          error: { code: 'permission-required' },
        });
      }
      expect(f.log().records).toHaveLength(0);
    },
  );

  it('binds pages to the viewer, rechecks current permissions, expires at 30 minutes and bounds views', async () => {
    const f = await fixture();
    const opened = openedSchema.parse(await f.invoke('privateContentOpen', f.targets[1]));
    expect(() =>
      f.team.privateAccess.page(carol, { viewId: opened.viewId, before: 'message-2' }),
    ).toThrow(expect.objectContaining({ code: 'object-not-found' }));
    const ownView = openedSchema.parse(f.team.privateAccess.open(carol, f.targets[1]));
    f.team.roles.set(owner, carol.humanId, ['member']);
    expect(() =>
      f.team.privateAccess.page(carol, { viewId: ownView.viewId, before: 'message-2' }),
    ).toThrow(expect.objectContaining({ code: 'permission-required' }));
    f.advance();
    expect(
      await f.methods(owner).privateContentPage({ viewId: opened.viewId, before: 'message-2' }),
    ).toMatchObject({ ok: false, error: { code: 'object-not-found' } });
    for (let index = 0; index < 128; index++) f.team.privateAccess.open(owner, f.targets[1]);
    expect(() => f.team.privateAccess.open(owner, f.targets[1])).toThrow(
      expect.objectContaining({ code: 'private-views-full' }),
    );
  });

  it.each(['edit', 'delete-first', 'delete-middle', 'delete-last', 'delete-all'])(
    'detects direct database %s including tail deletion',
    async (operation) => {
      const f = await fixture();
      for (let index = 0; index < 3; index++) await f.invoke('privateContentOpen', f.targets[1]);
      expect(await f.invoke('auditVerify')).toEqual({ ok: true });
      f.db.transaction((db) => {
        if (operation === 'edit')
          db.prepare(
            "UPDATE private_access_audit SET record_json = json_set(record_json, '$.reason', 'edited') WHERE seq = 2",
          ).run();
        else if (operation === 'delete-all') db.prepare('DELETE FROM private_access_audit').run();
        else
          db.prepare('DELETE FROM private_access_audit WHERE seq = ?').run(
            operation === 'delete-first' ? 1 : operation === 'delete-middle' ? 2 : 3,
          );
      });
      expect(await f.invoke('auditVerify')).toMatchObject({
        ok: false,
        brokenAt: expect.any(String),
      });
      if (operation === 'delete-last' || operation === 'delete-all')
        expect(await f.methods(owner).privateContentOpen(f.targets[1])).toMatchObject({
          ok: false,
          error: { code: 'audit-integrity-failed' },
        });
    },
  );

  it('pages audit records in append order and retains evidence after Human deletion', async () => {
    const f = await fixture();
    for (let index = 0; index < 3; index++) f.team.privateAccess.open(carol, f.targets[1]);
    const first = logSchema.parse(await f.invoke('auditLog', { limit: 2 }));
    expect(first.records).toHaveLength(2);
    const second = logSchema.parse(await f.invoke('auditLog', { after: first.next }));
    expect(second.records).toHaveLength(1);
    expect(second.next).toBeUndefined();
    f.db.transaction((db) => {
      db.prepare('DELETE FROM member_credentials WHERE human_id = ?').run(carol.humanId);
      db.prepare('DELETE FROM human_roles WHERE human_id = ?').run(carol.humanId);
      db.prepare('DELETE FROM humans WHERE human_id = ?').run(carol.humanId);
    });
    expect(f.log().records).toHaveLength(3);
    expect(f.log().records[0]?.viewerName).toBe('carol');
    expect(await f.invoke('auditVerify')).toEqual({ ok: true });
  });

  it.each([
    ['audit', 'list'],
    ['audit', 'verify'],
    ['private', 'list'],
    ['private', 'open', 'bot', 'alice-bot'],
    ['private', 'page', 'id', '--before', 'message'],
  ])('refuses Owner Tob tool command %j before approval or runner', async (...argv) => {
    const run = vi.fn();
    const prepare = createTobHostCliOperations({ run });
    expect(() => prepare('cli', { argv })).toThrow(
      expect.objectContaining({ code: 'cli-command-refused' }),
    );
    expect(run).not.toHaveBeenCalled();
  });

  it('uses bounded indexed message pages without listing the Host roster or Channels on open/page', async () => {
    const f = await fixture();
    const bots = vi.spyOn(f.core.registry, 'list');
    const channels = vi.spyOn(f.core.channels, 'list');
    const reads = vi.spyOn(f.core.channels, 'readMessages');
    const opened = openedSchema.parse(await f.invoke('privateContentOpen', f.targets[1]));
    await f.invoke('privateContentPage', { viewId: opened.viewId, before: 'message-2' });
    expect(bots).not.toHaveBeenCalled();
    expect(channels).not.toHaveBeenCalled();
    expect(reads.mock.calls.every((call) => call[1]?.limit === 50)).toBe(true);
  });

  it('projects only current or retained Bot names on message and reply authors across private pages', async () => {
    const f = await fixture();
    const channel = f.core.channels.createGroup(alice, {
      name: 'Private replies',
      members: ['alice-bot'],
    });
    const botAuthor = { kind: 'bot', slug: 'alice-bot' } satisfies ChannelMessageAuthor;
    const humanAuthor = {
      kind: 'human',
      humanId: alice.humanId,
      displayName: 'alice',
    } satisfies ChannelMessageAuthor;
    const append = (id: string, author: ChannelMessageAuthor, replyTo?: string) =>
      f.core.channels.appendMessage(alice, channel.id, {
        id,
        author,
        body: id,
        at: '2026-11-15T00:01:00Z',
        ...(replyTo ? { replyTo } : {}),
      });
    await append('target', botAuthor);
    await append('reply', humanAuthor, 'target');
    for (let index = 0; index < 51; index++) await append('filler-' + index, botAuthor);
    await append('new-reply', botAuthor, 'target');
    f.core.registry.update('alice-bot', { displayName: 'Diary' });
    const current = vi.spyOn(f.core.registry, 'get');
    const historical = vi.spyOn(f.core.registry, 'getHistorical');
    const target = { kind: 'channel', objectId: channel.id } satisfies Pick<
      PrivateObject,
      'kind' | 'objectId'
    >;
    const opened = f.team.privateAccess.open(owner, target);
    expect(opened.messages).toHaveLength(50);
    for (const message of opened.messages)
      expect(message.author).toEqual({ ...botAuthor, displayName: 'Diary' });
    expect(
      opened.messages.find((message) => message.id === 'new-reply')?.replyToPreview?.author,
    ).toEqual({ ...botAuthor, displayName: 'Diary' });
    expect(current).toHaveBeenCalledOnce();
    expect(historical).not.toHaveBeenCalled();
    const before = opened.messages.at(-1)?.id;
    if (!before) throw new Error('missing-page-cursor');
    f.core.registry.update('alice-bot', { displayName: 'Renamed Diary' });
    const page = () => f.team.privateAccess.page(owner, { viewId: opened.viewId, before });
    const assertPage = () => {
      const messages = page().messages;
      expect(messages).toHaveLength(4);
      expect(messages.find((message) => message.id === 'target')?.author).toEqual({
        ...botAuthor,
        displayName: 'Renamed Diary',
      });
      const reply = messages.find((message) => message.id === 'reply');
      expect(reply?.author).toEqual(humanAuthor);
      expect(reply?.replyToPreview?.author).toEqual({
        ...botAuthor,
        displayName: 'Renamed Diary',
      });
      expect(reply?.replyToPreview?.body).toBe('target');
    };
    current.mockClear();
    assertPage();
    expect(current).toHaveBeenCalledOnce();
    const preview = f.core.deletions.preview('alice-bot');
    await f.core.deletions.confirm('alice-bot', preview.token, false);
    expect(f.core.registry.get('alice-bot')).toBeUndefined();
    current.mockClear();
    historical.mockClear();
    assertPage();
    expect(current).toHaveBeenCalledOnce();
    expect(historical).toHaveBeenCalledOnce();
    expect(
      f.core.channels
        .readMessages(channel.id, { before })
        .find((message) => message.id === 'target')?.author,
    ).toEqual(botAuthor);
    expect(f.log().records).toHaveLength(1);
  });
  it.each([undefined, 'carol'])(
    'records exactly once per CLI open as %s and routes all commands with that identity',
    async (as) => {
      const f = await fixture();
      const run = await cliHost(f);
      const prefix = as === undefined ? [] : ['--as', as];
      const listed = await run([
        ...prefix,
        'private',
        'list',
        '--member',
        'alice',
        '--kind',
        'bot',
      ]);
      expect(listed.status).toBe(0);
      expect(listed.output).toMatchObject([{ objectId: 'alice-bot' }]);
      for (const target of f.targets) {
        const result = await run([
          ...prefix,
          'private',
          'open',
          target.kind,
          target.objectId,
          '--reason',
          'CLI support',
        ]);
        expect(result.status).toBe(0);
        const opened = openedSchema.parse(result.output);
        const page = await run([
          ...prefix,
          'private',
          'page',
          opened.viewId,
          '--before',
          'message-2',
        ]);
        expect(page.status).toBe(0);
      }
      expect(f.log().records).toHaveLength(5);
      expect(
        f.log().records.every((record) => record.viewerHumanId === (as ?? owner.humanId)),
      ).toBe(true);
      const first = await run([...prefix, 'audit', 'list', '--limit', '2']);
      expect(first.status).toBe(0);
      const records = logSchema.parse(first.output);
      expect(records.records).toHaveLength(2);
      const next = await run([...prefix, 'audit', 'list', '--after', records.next ?? '']);
      expect(logSchema.parse(next.output).records).toHaveLength(3);
      expect((await run([...prefix, 'audit', 'verify'])).output).toMatchObject({ ok: true });
    },
  );

  it('refuses CLI members all audit/private commands, invalid arguments and missing objects without writes', async () => {
    const f = await fixture();
    const run = await cliHost(f);
    for (const args of [
      ['private', 'list'],
      ['private', 'open', 'bot', 'alice-bot'],
      ['private', 'page', 'missing', '--before', 'message-2'],
      ['audit', 'list'],
      ['audit', 'verify'],
    ]) {
      expect((await run(['--as', 'bob', ...args])).output).toMatchObject({
        error: { code: 'permission-required' },
      });
    }
    for (const args of [
      ['audit', 'list', '--limit', '0'],
      ['private', 'open', 'bad-kind', 'id'],
      ['private', 'list', '--kind', 'bad-kind'],
    ]) {
      expect((await run(args)).status).not.toBe(0);
    }
    expect((await run(['private', 'open', 'bot', 'missing'])).output).toMatchObject({
      error: { code: 'object-not-found' },
    });
    expect(f.log().records).toHaveLength(0);
  });
  it('protects the Owner and higher-permission targets from non-Owner viewers', async () => {
    const f = await fixture();
    f.core.registry.create({
      slug: 'owner-bot',
      displayName: 'Owner Bot',
      ownerHumanId: owner.humanId,
    });
    expect(() => f.team.privateAccess.open(carol, { kind: 'bot', objectId: 'owner-bot' })).toThrow(
      expect.objectContaining({ code: 'permission-required' }),
    );
    f.team.roles.set(owner, alice.humanId, ['admin']);
    expect(() => f.team.privateAccess.open(carol, f.targets[0])).toThrow(
      expect.objectContaining({ code: 'permission-required' }),
    );
    expect(f.team.privateAccess.objects(carol, {})).not.toContainEqual(
      expect.objectContaining({ objectId: 'alice-bot' }),
    );
    expect(f.log().records).toHaveLength(0);
    expect(f.team.privateAccess.open(owner, f.targets[0])).toHaveProperty('viewId');
  });

  it('returns own-content through CLI without auditing the owner of the object', async () => {
    const f = await fixture();
    f.team.roles.set(owner, alice.humanId, [
      'member',
      f.team.roles.create(owner, 'Self viewer', ['privateContent.view']).role.roleId,
    ]);
    const run = await cliHost(f);
    for (const target of f.targets)
      expect(
        (await run(['--as', 'alice', 'private', 'open', target.kind, target.objectId])).output,
      ).toMatchObject({ error: { code: 'own-content' } });
    expect(f.log().records).toHaveLength(0);
  });

  it('revokes private/audit access on every existing browser and paired device immediately', async () => {
    const f = await fixture();
    const created = await f.team.createMember(owner, 'device-viewer', 'Viewer');
    const human = humanContext(created.member.humanId);
    const role = f.team.roles.create(owner, 'Device auditors', [
      'privateContent.view',
      'audit.view',
    ]).role;
    f.team.roles.set(owner, human.humanId, ['member', role.roleId]);
    f.db.transaction((db) =>
      db
        .prepare('UPDATE member_credentials SET must_change = 0 WHERE human_id = ?')
        .run(human.humanId),
    );
    const browsers = await Promise.all(
      ['one', 'two'].map((ip) => f.team.signIn('device-viewer', created.initialPassword, ip)),
    );
    const pairing = createDevicePairing({
      database: f.db,
      hostName: 'Audit',
      ownerHumanId: () => human.humanId,
    });
    f.team.bindPairing(pairing);
    const device = pairing.redeem({ offer: pairing.createOffer().offer });
    if (!device.ok) throw new Error('pairing-failed');
    const closeStream = vi.fn();
    pairing.attachStream(device.device.id, closeStream);
    const pairedHuman = pairedDeviceHuman(f.db, device.device.id);
    if (!pairedHuman) throw new Error('missing-paired-human');
    const cached = f.methods(pairedHuman);
    const view = openedSchema.parse(
      await f.invoke('privateContentOpen', f.targets[1], browsers[0]?.peer),
    );
    expect(await cached.auditLog({})).toMatchObject({ ok: true });
    f.team.roles.update(owner, role.roleId, { permissions: [] });
    await f.team.accessSettled();
    expect(closeStream).toHaveBeenCalledOnce();
    for (const browser of browsers) {
      expect(browser.peer.signal.aborted).toBe(true);
      await expect(f.invoke('privateObjects', {}, browser.peer)).rejects.toBeDefined();
      await expect(
        f.invoke('privateContentOpen', f.targets[1], browser.peer),
      ).rejects.toBeDefined();
      await expect(
        f.invoke('privateContentPage', { viewId: view.viewId, before: 'message-2' }, browser.peer),
      ).rejects.toBeDefined();
      await expect(f.invoke('auditLog', {}, browser.peer)).rejects.toBeDefined();
      await expect(f.invoke('auditVerify', {}, browser.peer)).rejects.toBeDefined();
    }
    for (const method of [
      'privateObjects',
      'privateContentOpen',
      'privateContentPage',
      'auditLog',
      'auditVerify',
    ] as const)
      expect(await cached[method]({})).toMatchObject({
        ok: false,
        error: { code: 'permission-required' },
      });
    expect(f.log().records).toHaveLength(1);
  });
});
