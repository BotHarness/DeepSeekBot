import { createServer } from 'node:http';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import type { PeerScope } from '@deepseek-ai/dsh-typert-protocol';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { RemoteAccessService } from '@deepseek-ai/dsh-api-remote-access';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { DUMMY_PASSWORD_HASH } from '../src/team/password.js';
import { memberPolicy } from '../src/team/policy.js';
import { guardHumanBridge } from '../src/team/bridge-access.js';
import {
  botAdminActionSchema,
  botMetadata,
  administrativeResult,
} from '../src/team/bot-administration.js';
import { auditRecordSchema } from '../src/team/private-contract.js';
import { PrivateAudit } from '../src/team/audit.js';
import {
  createTobBotProfileOperations,
  TOB_BOT_PROFILE_CAPABILITIES,
} from '../src/tob/cli-bot-profile-operations.js';
import {
  authorizeTobBotTargets,
  authorizeTobHostCli,
  createTobHostCliOperations,
} from '../src/tob/cli-host-commands.js';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createPersonaBotDeletions } from '../src/bots/deletion.js';
import { createTempRoot } from './helpers.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const SECRET = 'private-persona-secret';
const closes: Array<() => unknown | Promise<unknown>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
const auditPage = z.object({ records: z.array(auditRecordSchema) });

async function fixture() {
  const home = createTempRoot('private-admin-');
  const core = createCore({ dshHome: home });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  closes.push(close);
  const db = attachOperationalModule(core.operationalDatabase, 'team');
  db.transaction((sql) => {
    for (const human of [alice, bob]) {
      sql
        .prepare("INSERT INTO humans VALUES (?, ?, 'active', 'now')")
        .run(human.humanId, human.humanId);
      sql.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
    }
    for (const human of [owner, alice, bob])
      sql
        .prepare('INSERT INTO member_credentials VALUES (?, ?, ?, ?, 0)')
        .run(
          human.humanId,
          human === owner ? 'owner' : human.humanId,
          JSON.stringify(DUMMY_PASSWORD_HASH),
          '[]',
        );
    sql.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const human of [owner, alice, bob]) core.team.spaces.ensureAccount(human.humanId);
  const team = core.team;
  team.privateAccess.bind({ registry: core.registry, memory: core.memory });
  const created = core.registry.create({
    slug: 'alice-bot',
    displayName: 'Alice Bot',
    ownerHumanId: alice.humanId,
    description: SECRET,
    roles: [SECRET],
    workspaces: ['/private/workspace-secret'],
  });
  if (!created.ok) throw new Error('create-refused');
  core.registry.create({
    slug: 'owner-bot',
    displayName: 'Owner Bot',
    ownerHumanId: owner.humanId,
  });
  const memory = core.registry.memoryDirFor('alice-bot');
  if (!memory) throw new Error('memory-missing');
  writeFileSync(join(memory, 'secret.md'), SECRET);
  const dm = core.channels.getOrCreateDm(alice, 'alice-bot');
  if (!dm) throw new Error('dm-missing');
  await core.channels.appendMessage(alice, dm.id, {
    id: 'private-message',
    author: { kind: 'human', humanId: alice.humanId },
    at: 'now',
    body: SECRET,
  });
  const deletions = createPersonaBotDeletions({
    database: core.operationalDatabase,
    registry: core.registry,
    dependencies: () => ({
      sessions: ['private-session'],
      workspaces: ['/private/workspace-secret'],
      grants: [],
      identities: [],
      channels: [dm.id],
    }),
    allWorkspacePaths: () => [],
    stop: async () => {},
  });
  const deps = { ...core, team, deletions };
  const methods = createBridgeMethodsForHumans(deps);
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
  const peer = new Peer(ctx, { principal: { kind: 'owner' } });
  const invoke = (method: string, args: Record<string, unknown>, caller: PeerScope = peer) =>
    gateway.invoke({ namespace: 'botharness', method, args, peer: caller });
  const records = () => auditPage.parse(team.privateAccess.log(owner, {})).records;
  const metadata = () =>
    botMetadata(owner, core.registry.getHistorical('alice-bot') ?? created.record);
  return { core, team, db, deps, methods, invoke, records, metadata, home, memory, close };
}

async function cli(f: Awaited<ReturnType<typeof fixture>>) {
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response.writeHead(302, { 'set-cookie': 'authority=owner', location: '/' }).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const input = z
      .object({
        method: z.string(),
        args: z.record(z.string(), z.unknown()).optional(),
        payload: z.object({ args: z.record(z.string(), z.unknown()) }).optional(),
        username: z.string().optional(),
        rpcId: z.unknown().optional(),
      })
      .parse(JSON.parse(Buffer.concat(chunks).toString()));
    try {
      const result =
        input.username === undefined
          ? await f.invoke(input.method.replace('botharness/', ''), input.payload?.args ?? {})
          : await f.team.asMember(input.username, (peer) => {
              f.team.assertCall(peer.principal, input.method);
              return f.invoke(input.method, input.args ?? {}, peer);
            });
      response.end(
        JSON.stringify(
          input.username === undefined
            ? { type: 'server-response', rpcId: input.rpcId, result: { ok: true, value: result } }
            : { ok: true, value: result },
        ),
      );
    } catch (error) {
      const parsed = z.object({ code: z.string().optional() }).parse(error);
      const failure = { code: parsed.code ?? 'internal', message: parsed.code ?? 'internal' };
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
  if (!address || typeof address === 'string') throw new Error('no-port');
  return async (args: string[], stdin = '') => {
    const lines: string[] = [];
    const status = await runBotCreateCli(args, {
      env: {
        DEEPSEEKBOT_HOST: `http://127.0.0.1:${address.port}`,
        DEEPSEEKBOT_HOST_TOKEN: 'test-token',
      },
      stdout: (line) => lines.push(line),
      stderr: () => {},
      readStdin: async () => stdin,
    });
    expect(lines).toHaveLength(1);
    return { status, output: JSON.parse(lines[0] ?? '{}') };
  };
}

const reads = [
  ['get', ['bots', 'show', 'alice-bot']],
  ['modelPlan', ['model-plan', 'alice-bot']],
  ['deletionPreview', ['bot-delete-preview', 'alice-bot']],
  ['deletionMemoryFolder', ['bot-delete-memory-folder', 'alice-bot']],
] satisfies Array<[string, string[]]>;
it.each(reads)(
  'returns only safe administrative metadata for %s through Client RPC and CLI --as owner',
  async (method, args) => {
    const f = await fixture();
    const memory = vi.spyOn(f.core.memory, 'readAccepted');
    const result = await f.invoke(method, { slug: 'alice-bot' });
    expect(result).toMatchObject({ metadataOnly: true, bot: f.metadata() });
    if (method !== 'deletionPreview')
      expect(result).toEqual({ metadataOnly: true, bot: f.metadata() });
    expect(JSON.stringify(result)).not.toContain(SECRET);
    expect(JSON.stringify(result)).not.toContain(f.memory);
    expect(JSON.stringify(result)).not.toContain('private-session');
    const run = await cli(f);
    const output = await run(['--as', 'owner', ...args]);
    expect(output.status).toBe(0);
    expect(output.output).toMatchObject({ metadataOnly: true, bot: f.metadata() });
    expect(JSON.stringify(output.output)).not.toContain(SECRET);
    expect(memory).not.toHaveBeenCalled();
    expect(f.records()).toHaveLength(0);
  },
);

it('keeps administration listing and its query from exposing private profile fields', async () => {
  const f = await fixture();
  const listed = await f.invoke('list', { administration: true });
  const bots = z.object({ bots: z.array(z.unknown()) }).parse(listed).bots;
  expect(bots).toContainEqual(f.metadata());
  expect(JSON.stringify(listed)).not.toContain(SECRET);
  expect(
    f.methods({ humanId: owner.humanId, caller: 'bot' }).list({ administration: true }),
  ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  expect(
    JSON.stringify(await f.invoke('list', { administration: true, query: SECRET })),
  ).not.toContain('alice-bot');
  const run = await cli(f);
  expect(
    JSON.stringify((await run(['--as', 'owner', 'bots', 'list', '--administration'])).output),
  ).not.toContain(SECRET);
});

it('exposes content only through the audited view without unlocking legacy reads', async () => {
  const f = await fixture();
  const opened = await f.invoke('privateContentOpen', { kind: 'bot', objectId: 'alice-bot' });
  expect(JSON.stringify(opened)).toContain(SECRET);
  expect(await f.invoke('get', { slug: 'alice-bot' })).toEqual({
    metadataOnly: true,
    bot: f.metadata(),
  });
  expect(f.records()).toHaveLength(1);
  expect(f.team.privateAccess.verify(owner)).toEqual({ ok: true });
});

it.each(
  botAdminActionSchema.options.filter(
    (action) =>
      action !== 'transfer' && action !== 'memberPurgeConfirm' && action !== 'botVisibilitySet',
  ),
)('audits %s before delegation and strips every private result field', async (action) => {
  const f = await fixture();
  const delegate = vi.fn(() => {
    expect(f.records()).toHaveLength(1);
    return {
      ok: true,
      value: {
        bot: { description: SECRET },
        preview: {
          slug: 'alice-bot',
          displayName: 'Alice Bot',
          token: 'token',
          eraseAvailable: true,
        },
        deletion: {
          slug: 'alice-bot',
          displayName: 'Alice Bot',
          acceptedAt: 'now',
          eraseMemory: false,
          phase: 'complete',
          memory: 'retained',
          memoryDir: f.memory,
        },
      },
    };
  });
  const admin = new Proxy(f.methods(owner), {
    get: (target, key) => (key === action ? delegate : Reflect.get(target, key)),
  });
  const guarded = guardHumanBridge(owner, f.deps, f.methods(owner), () => admin);
  const operation: unknown = Reflect.get(guarded, action);
  if (typeof operation !== 'function') throw new Error('missing-operation');
  const result: unknown = await Reflect.apply(operation, guarded, [{ slug: 'alice-bot' }]);
  expect(delegate).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ ok: true, value: { metadataOnly: true, bot: f.metadata() } });
  expect(JSON.stringify(result)).not.toContain(SECRET);
  expect(JSON.stringify(result)).not.toContain(f.memory);
  expect(f.records()[0]).toMatchObject({ kind: 'bot', objectId: 'alice-bot', action });
  expect(f.team.privateAccess.verify(owner)).toEqual({ ok: true });
});

it('keeps real pause/update/resume allowed, metadata-only and exactly once audited through bridge and CLI', async () => {
  const f = await fixture();
  const run = await cli(f);
  expect(await f.invoke('pause', { slug: 'alice-bot' })).toMatchObject({
    metadataOnly: true,
    bot: { paused: true },
  });
  expect((await run(['--as', 'owner', 'resume', 'alice-bot'])).status).toBe(0);
  const updated = await f.invoke('update', {
    slug: 'alice-bot',
    patch: { displayName: 'Renamed' },
  });
  expect(updated).toMatchObject({ metadataOnly: true, bot: { displayName: 'Renamed' } });
  expect(JSON.stringify(updated)).not.toContain(SECRET);
  expect(f.records().map((record) => record.action)).toEqual(['pause', 'resume', 'update']);
});

it('keeps deletion confirmations and retries usable without revealing Memory paths', async () => {
  const f = await fixture();
  const preview = z
    .object({ preview: z.object({ token: z.string() }) })
    .parse(await f.invoke('deletionPreview', { slug: 'alice-bot' }));
  const result = await f.invoke('deletionConfirm', {
    slug: 'alice-bot',
    token: preview.preview.token,
    eraseMemory: false,
  });
  expect(result).toMatchObject({
    metadataOnly: true,
    deletion: { phase: 'complete', memory: 'retained' },
  });
  expect(JSON.stringify(result)).not.toContain(f.memory);
  expect(f.records().map((record) => record.action)).toEqual(['deletionConfirm']);
});

it('audits each transferred private Bot with its original owner and denies Bot-origin transfer', async () => {
  const f = await fixture();
  const run = await cli(f);
  expect((await run(['--as', 'owner', 'members', 'transfer', 'alice', '--to', 'bob'])).status).toBe(
    0,
  );
  expect(f.core.registry.get('alice-bot')?.ownerHumanId).toBe('bob');
  expect(f.records()).toMatchObject([
    { kind: 'bot', action: 'transfer', ownerHumanIds: ['alice'] },
  ]);
  await expect(
    f.team.transfer({ humanId: owner.humanId, caller: 'bot' }, 'bob', 'alice'),
  ).rejects.toMatchObject({ code: 'permission-required' });
});

it.each([
  ...reads.map(([name]) => name),
  ...botAdminActionSchema.options.filter(
    (action) =>
      action !== 'transfer' && action !== 'memberPurgeConfirm' && action !== 'botVisibilitySet',
  ),
])('denies Bot-origin %s without audit or effects', async (method) => {
  const f = await fixture();
  const table = f.methods({ humanId: owner.humanId, caller: 'bot' });
  const operation: unknown = Reflect.get(table, method);
  if (typeof operation !== 'function') throw new Error('missing-operation');
  expect(await Reflect.apply(operation, table, [{ slug: 'alice-bot' }])).toMatchObject({
    ok: false,
  });
  expect(f.records()).toHaveLength(0);
  expect(f.core.registry.get('alice-bot')?.paused).not.toBe(true);
});

it('denies direct Owner Tob profile reads and writes, including after ownership changes during approval', async () => {
  const f = await fixture();
  const ops = createTobBotProfileOperations({
    registry: f.core.registry,
    bridge: () => f.methods(owner),
    isProtectedBot: () => false,
  });
  for (const entry of TOB_BOT_PROFILE_CAPABILITIES)
    await expect(async () => ops(entry.command, { slug: 'alice-bot' })).rejects.toMatchObject({
      code: 'permission-required',
    });
  const prepared = await ops('show', { slug: 'owner-bot' });
  if (!prepared) throw new Error('missing-operation');
  f.db.transaction((db) =>
    db
      .prepare(
        "UPDATE persona_bots SET owner_human_id = 'alice', body = json_set(body, '$.ownerHumanId', 'alice') WHERE slug = 'owner-bot'",
      )
      .run(),
  );
  await expect(async () => prepared.run(() => {})).rejects.toMatchObject({
    code: 'permission-required',
  });
});

it('rechecks scoped generic Tob CLI authorization at execution and refuses impersonation options', async () => {
  const run = vi.fn();
  let allowed = true;
  const prepare = createTobHostCliOperations({
    run,
    authorize: () => {
      if (!allowed) throw new Error('private-refused');
    },
  });
  const pending = await prepare('cli', { argv: ['show', 'alice-bot'] });
  if (!pending) throw new Error('missing-operation');
  allowed = false;
  await expect(async () => pending.run(() => {})).rejects.toThrow('private-refused');
  expect(run).not.toHaveBeenCalled();
  for (const argv of [
    ['show', 'alice-bot', '--as', 'owner'],
    ['list', '--administration'],
  ])
    await expect(async () => prepare('cli', { argv })).rejects.toMatchObject({
      code: 'cli-command-refused',
    });
});

it('fails closed before an administrative effect if audit persistence is damaged', async () => {
  const f = await fixture();
  await f.invoke('pause', { slug: 'alice-bot' });
  f.db.transaction((db) => db.prepare('DELETE FROM private_access_audit').run());
  expect(await f.methods(owner).resume({ slug: 'alice-bot' })).toMatchObject({
    ok: false,
    error: { code: 'audit-integrity-failed' },
  });
  expect(f.core.registry.get('alice-bot')?.paused).toBe(true);
});

it('verifies legacy records without action and detects direct action tampering', async () => {
  const f = await fixture();
  const old = {
    auditId: 'legacy',
    at: 'now',
    viewerHumanId: owner.humanId,
    viewerName: 'Owner',
    kind: 'bot',
    objectId: 'alice-bot',
    objectName: 'Alice Bot',
    ownerHumanIds: ['alice'],
    prevHash: '',
  };
  const hash = createHash('sha256').update(JSON.stringify(old)).digest('hex');
  f.db.transaction((db) => {
    db.prepare('INSERT INTO private_access_audit VALUES (1, ?, ?)').run(
      'legacy',
      JSON.stringify({ ...old, hash }),
    );
    db.prepare('UPDATE private_audit_head SET seq = 1, audit_id = ?, hash = ?').run('legacy', hash);
  });
  const audit = new PrivateAudit(f.db);
  expect(audit.verify()).toEqual({ ok: true });
  await f.invoke('pause', { slug: 'alice-bot' });
  expect(audit.verify()).toEqual({ ok: true });
  f.db.transaction((db) =>
    db
      .prepare(
        "UPDATE private_access_audit SET record_json = json_set(record_json, '$.action', 'resume') WHERE seq = 2",
      )
      .run(),
  );
  expect(audit.verify()).toMatchObject({ ok: false });
});

it.each([
  ['show', 'alice-bot'],
  ['bots', 'show', 'alice-bot'],
  ['pause', '--confirm', 'alice-bot'],
  ['model-plan', 'alice-bot'],
  ['bot-avatar-set', 'dm-alice-bot'],
  ['members', 'transfer', 'alice', '--to', 'bob'],
  ['members', '--compact', 'transfer', 'alice', '--to', 'owner'],
  ['members', '--name', 'ignored', 'transfer', 'alice', '--to=owner'],
  ['members', '--compact', 'purge', 'alice', '--confirm'],
  ['members', '--to', 'owner', 'purge', 'alice', '--confirm'],
  ['members', '--', 'purge', 'alice'],
])(
  'refuses generic Owner Tob delegation of %j to foreign private Bot administration',
  async (...argv) => {
    const f = await fixture();
    expect(() =>
      authorizeTobHostCli(argv, {
        registry: f.core.registry,
        channels: f.core.channels,
        human: owner,
      }),
    ).toThrow(expect.objectContaining({ code: 'permission-required' }));
  },
);

it('keeps the offline CLI from reading or mutating another member Bot outside an audited Host', async () => {
  const f = await fixture();
  const metadata = f.metadata();
  await f.close();
  for (const args of [
    ['bots', 'show', 'alice-bot'],
    ['model-plan', 'alice-bot'],
    ['memory-file', 'alice-bot', '--path', 'secret.md'],
    ['pause', 'alice-bot'],
  ]) {
    const lines: string[] = [];
    const status = await runBotCreateCli([...args, '--home', f.home], {
      env: {},
      stdout: (line) => lines.push(line),
      stderr: () => {},
    });
    expect(JSON.stringify(lines)).not.toContain(SECRET);
    expect(JSON.stringify(lines)).not.toContain(f.memory);
    if (args[1] === 'show') {
      expect(status).toBe(0);
      expect(JSON.parse(lines[0] ?? '{}')).toEqual({ metadataOnly: true, bot: metadata });
    } else expect(status).not.toBe(0);
  }
  const database = new DatabaseSync(join(f.home, 'botharness', 'botharness.db'), {
    readOnly: true,
  });
  try {
    expect(
      database
        .prepare(
          "SELECT json_extract(body, '$.paused') AS paused FROM persona_bots WHERE slug = 'alice-bot'",
        )
        .get()?.paused,
    ).not.toBe(1);
  } finally {
    database.close();
  }
});

it('keeps own Bot reads and mutations unchanged without cross-member audit entries', async () => {
  const f = await fixture();
  f.core.channels.getOrCreateDm(owner, 'owner-bot');
  const run = await cli(f);
  const direct = await run(['memory-snapshot', 'owner-bot']);
  const carrier = await run(['--as', 'owner', 'memory-snapshot', 'owner-bot']);
  expect(direct.status).toBe(0);
  expect(carrier.status).toBe(0);
  expect(carrier.output).toEqual(direct.output);
  expect(await f.invoke('get', { slug: 'owner-bot' })).toHaveProperty('profileFingerprint');
  expect(await f.invoke('pause', { slug: 'owner-bot' })).not.toHaveProperty('metadataOnly');
  expect(f.records()).toHaveLength(0);
});

it('supports safe deletion through CLI --as owner and records its action once', async () => {
  const f = await fixture();
  const run = await cli(f);
  const preview = await run(['--as', 'owner', 'bot-delete-preview', 'alice-bot']);
  const token = z.object({ preview: z.object({ token: z.string() }) }).parse(preview.output)
    .preview.token;
  const deleted = await run(
    ['--as', 'owner', 'bot-delete-confirm', 'alice-bot', '--confirm', '--confirmation-stdin'],
    JSON.stringify({ token }),
  );
  expect(deleted.status).toBe(0);
  expect(deleted.output).toMatchObject({ metadataOnly: true, deletion: { phase: 'complete' } });
  expect(JSON.stringify(deleted.output)).not.toContain(f.memory);
  expect(f.records().map((record) => record.action)).toEqual(['deletionConfirm']);
});

it.each([
  ['botPrompt', { slug: 'alice-bot' }, ['bot-prompt', 'alice-bot']],
  ['botSystemPrompt', { slug: 'alice-bot' }, ['bot-system-prompt', 'alice-bot']],
  [
    'memoryFile',
    { channelId: 'dm-alice-bot', path: 'secret.md' },
    ['memory-file', 'alice-bot', '--path', 'secret.md'],
  ],
  ['memorySnapshot', { channelId: 'dm-alice-bot' }, ['memory-snapshot', 'alice-bot']],
  ['channelMessages', { channelId: 'dm-alice-bot' }, ['channel-messages', 'dm-alice-bot']],
] satisfies Array<[string, Record<string, unknown>, string[]]>)(
  'keeps existing sensitive path %s refused instead of routing through administration',
  async (method, args, argv) => {
    const f = await fixture();
    const operation: unknown = Reflect.get(f.methods(owner), method);
    if (typeof operation !== 'function') throw new Error('missing-operation');
    expect(await Reflect.apply(operation, f.methods(owner), [args])).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    const run = await cli(f);
    const denied = await run(['--as', 'owner', ...argv]);
    expect(denied.status).not.toBe(0);
    expect(denied.output).toMatchObject({
      error: { code: method === 'channelMessages' ? 'remote-access/denied' : 'bot-not-found' },
    });
    expect(JSON.stringify(denied.output)).not.toContain(SECRET);
    expect(f.records()).toHaveLength(0);
  },
);

it.each([
  'slug',
  'botSlug',
  'botId',
  'channelId',
  'sourceBotSlug',
  'targetBotSlug',
  'sourceChannelId',
  'targetChannelId',
  'members',
])('denies private content selectors at the Tob dispatch boundary: %s', async (field) => {
  const f = await fixture();
  const value = field.toLowerCase().includes('channel') ? 'dm-alice-bot' : 'alice-bot';
  for (const id of [value, ` ${value} `])
    expect(() =>
      authorizeTobBotTargets(
        { [field]: field === 'members' ? ['owner-bot', id] : id },
        { registry: f.core.registry, channels: f.core.channels, human: owner },
      ),
    ).toThrow(expect.objectContaining({ code: 'permission-required' }));
});

it('denies Bot-origin member purge before permissions or private deletion', async () => {
  const f = await fixture();
  await expect(
    f.team.purgeConfirm({ humanId: owner.humanId, caller: 'bot' }, 'alice', 'token', 'alice'),
  ).rejects.toMatchObject({ code: 'permission-required' });
  expect(f.core.registry.get('alice-bot')).toBeDefined();
  expect(f.records()).toHaveLength(0);
});

it.each([
  ['model-not-allowed', { route: 'provider/denied' }],
  ['permission-required', { permission: 'models.manage' }],
  ['invalid-input', undefined],
])('preserves only safe refusal details for administrative %s', async (code, details) => {
  const f = await fixture();
  const bot = f.core.registry.get('alice-bot');
  if (!bot) throw new Error('bot-missing');
  const result = administrativeResult(owner, bot, 'modelPlanSet', {
    ok: false,
    error: { code, message: SECRET, details: { ...details, private: SECRET } },
  });
  expect(result).toEqual({
    ok: false,
    error: { code, message: code, ...(details ? { details } : {}) },
  });
  expect(JSON.stringify(result)).not.toContain(SECRET);
});

it('allows parsed member reads and rechecks every group-create member after approval', async () => {
  const f = await fixture();
  const deps = { registry: f.core.registry, channels: f.core.channels, human: owner };
  expect(() => authorizeTobHostCli(['members', '--name', 'transfer', 'list'], deps)).not.toThrow();
  const args = { name: 'Group', members: ['owner-bot'] };
  expect(() => authorizeTobBotTargets(args, deps)).not.toThrow();
  const reads = vi.spyOn(f.core.registry, 'getHistorical');
  expect(() =>
    authorizeTobBotTargets({ members: Array.from({ length: 101 }, () => 'owner-bot') }, deps),
  ).toThrow(expect.objectContaining({ code: 'invalid-request' }));
  expect(reads).not.toHaveBeenCalled();
  f.db.transaction((db) =>
    db
      .prepare(
        "UPDATE persona_bots SET owner_human_id = 'alice', body = json_set(body, '$.ownerHumanId', 'alice') WHERE slug = 'owner-bot'",
      )
      .run(),
  );
  expect(() => authorizeTobBotTargets(args, deps)).toThrow(
    expect.objectContaining({ code: 'permission-required' }),
  );
});
