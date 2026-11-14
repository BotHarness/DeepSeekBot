import { grantToolExecutionDenial } from '../src/workspaces/grant-execution.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import type { Session } from '@deepseek-ai/dsh-session';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { nativeFileToolDenial, nativeExecutionRoot } from '../src/workspaces/grant-native-tools.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { accountMemoryPath, relocateSpaceMemories } from '../src/workspaces/space-memory.js';
import {
  accountSpaceFiles,
  prepareSpaceTransfer,
  recoverSpaceTransfers,
} from '../src/workspaces/space-lifecycle.js';
import { saveAttachmentFile } from '../src/attachments/file-operations.js';

const alice = humanContext('alice');
const bob = humanContext('bob');
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    await core.contentPurge.memberSettled().catch(() => {});
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
function fixture(home = realpathSync(createTempRoot('m6-spaces-'))) {
  const extra: { id: string; path: string; title: string; status(): Promise<'ok'> }[] = [];
  const core = createCore({
    dshHome: home,
    agents: createDshBotAgentAdapter({
      agents: new FakeAgentHost({ kind: 'completed' }),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    }),
    workspaces: () => ({ get: (id) => extra.find((entry) => entry.id === id), list: () => extra }),
  });
  cores.push(core);
  const db = attachOperationalModule(core.operationalDatabase, 'm6-test');
  db.transaction((connection) => {
    for (const human of [alice, bob]) {
      connection
        .prepare("INSERT OR IGNORE INTO humans VALUES (?, ?, 'active', '2026-11-14')")
        .run(human.humanId, human.humanId);
      connection
        .prepare("INSERT OR IGNORE INTO human_roles VALUES (?, 'member')")
        .run(human.humanId);
    }
    connection.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const human of [alice, bob]) core.spaces.ensureAccount(human.humanId);
  const bridge = createBridgeMethodsForHumans(core);
  const workspace = (path: string, id = path) => {
    const entry = { id, path, title: id, status: async () => 'ok' as const };
    extra.push(entry);
    return id;
  };
  const createBot = (human = alice, slug = human.humanId + '-bot') => {
    const created = core.registry.create({ slug, displayName: slug, ownerHumanId: human.humanId });
    if (!created.ok) throw new Error(created.reason);
    return created.record;
  };
  return { core, home, db, bridge, workspace, createBot };
}

describe('M6 spaces and current authority', () => {
  it('creates only the caller account and audience-visible shared spaces, with manager access to shared spaces only', async () => {
    const f = fixture();
    const member = f.core.spaces.create(owner, 'Members', { kind: 'members', humanIds: ['alice'] });
    const role = f.core.spaces.create(owner, 'Role', { kind: 'roles', roleIds: ['admin'] });
    const all = f.core.spaces.create(owner, 'All', { kind: 'everyone' });
    expect(f.core.spaces.list(alice).map((space) => space.spaceId)).toEqual([
      all.spaceId,
      member.spaceId,
      'spaces/alice',
    ]);
    expect(f.core.spaces.list(bob).map((space) => space.spaceId)).toEqual([
      all.spaceId,
      'spaces/bob',
    ]);
    expect(f.core.spaces.list(owner).map((space) => space.spaceId)).toContain(role.spaceId);
    expect(f.core.spaces.list(owner).filter((space) => space.kind === 'account')).toEqual([
      {
        spaceId: 'spaces/local-human',
        name: 'Human',
        kind: 'account',
        ownerHumanId: 'local-human',
        canManage: false,
      },
    ]);
    const manager = f.core.team.roles.create(owner, 'Space manager', ['workspaces.manageShared']);
    f.core.team.roles.set(owner, 'bob', [manager.role.roleId]);
    expect(f.core.spaces.list(bob).filter((space) => space.kind === 'shared')).toHaveLength(3);
    expect(f.core.spaces.list(bob).some((space) => space.spaceId === 'spaces/alice')).toBe(false);
    const changed = await f
      .bridge(alice)
      .spaceCreate({ name: 'Refused', audience: { kind: 'everyone' } });
    expect(changed).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'workspaces.manageShared' } },
    });
    expect(
      f.core.spaces.update(owner, member.spaceId, {
        name: 'Renamed',
        audience: { kind: 'everyone' },
      }),
    ).toMatchObject({ name: 'Renamed' });
    expect(f.core.spaces.list(bob).some((space) => space.name === 'Renamed')).toBe(true);
  });

  it('checks every shared-space mutation and reference in the service', async () => {
    const f = fixture();
    const space = f.core.spaces.create(owner, 'Team', { kind: 'everyone' });
    expect(() => f.core.spaces.create(owner, ' team ', { kind: 'everyone' })).toThrow(
      'space-name-taken',
    );
    expect(() =>
      f.core.spaces.create(owner, 'Other', { kind: 'roles', roleIds: ['missing'] }),
    ).toThrow('role-not-found');
    expect(() =>
      f.core.spaces.create(owner, 'Other', { kind: 'members', humanIds: ['missing'] }),
    ).toThrow('member-not-found');
    for (const human of [alice, bob]) {
      expect(() => f.core.spaces.update(human, space.spaceId, { name: 'Hacked' })).toThrow(
        'permission-required',
      );
      expect(() => f.core.spaces.delete(human, space.spaceId, true)).toThrow('permission-required');
    }
    expect(() => f.core.spaces.update(owner, 'spaces/alice', { name: 'Hacked' })).toThrow(
      'space-not-found',
    );
    expect(() => f.core.spaces.delete(owner, 'spaces/alice', true)).toThrow('space-not-found');
    expect(() => f.core.spaces.delete(owner, space.spaceId, false)).toThrow('confirm-required');
    writeFileSync(join(f.core.spaces.path(space.spaceId), 'retained'), 'keep');
    expect(() => f.core.spaces.delete(owner, space.spaceId, true)).toThrow('space-not-empty');
    const empty = f.core.spaces.create(owner, 'Empty', { kind: 'everyone' });
    expect(f.core.spaces.delete(owner, empty.spaceId, true)).toBeNull();
    expect(() => f.core.spaces.delete(owner, empty.spaceId, true)).toThrow('space-not-found');
    expect(await f.bridge(owner).spaceDelete({ spaceId: space.spaceId })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('rechecks role audience and never revives a deleted shared-root Grant', async () => {
    const f = fixture();
    f.createBot();
    const shared = f.core.spaces.create(owner, 'Role files', {
      kind: 'roles',
      roleIds: ['member'],
    });
    const grant = await f.core.grants.create('alice-bot', shared.spaceId);
    f.core.team.roles.set(owner, 'alice', ['admin']);
    expect(() => f.core.grants.requireActive('alice-bot', grant.id)).toThrow(
      'grant-outside-audience',
    );
    f.core.team.roles.set(owner, 'alice', ['member']);
    expect(f.core.grants.requireActive('alice-bot', grant.id).id).toBe(grant.id);
    f.core.spaces.delete(owner, shared.spaceId, true);
    expect(f.core.spaces.create(owner, 'Role files', { kind: 'everyone' }).spaceId).toBe(
      shared.spaceId,
    );
    expect(() => f.core.grants.requireActive('alice-bot', grant.id)).toThrow('missing or revoked');
  });

  it('authorizes a member Bot request only for its owner, readable Channel and contained Workspace', async () => {
    const f = fixture();
    f.createBot();
    const dm = f.core.channels.getOrCreateDm(alice, 'alice-bot', 'Alice')!;
    await f.core.channels.appendMessage(alice, dm.id, {
      id: 'grant-request',
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: 'alice-bot' },
      body: 'grant',
      grantRequest: true,
    });
    const input = {
      slug: 'alice-bot',
      channelId: dm.id,
      requestMessageId: 'grant-request',
      workspaceId: 'spaces/alice',
      acknowledgeReadWrite: true,
    };
    expect(await f.bridge(bob).grantRequestApprove(input)).toMatchObject({
      ok: false,
      error: { code: 'bot-not-found' },
    });
    expect(
      await f.bridge(alice).grantRequestApprove({ ...input, workspaceId: 'spaces/bob' }),
    ).toMatchObject({ ok: false, error: { code: 'grant-foreign-space' } });
    expect(await f.bridge(alice).grantRequestApprove(input)).toMatchObject({
      ok: true,
      value: { grant: { workspaceId: 'spaces/alice', orchestratorWrite: true } },
    });
  });

  it('uses the same Host Role ID for Channel visibility and shared spaces, refusing deletion until the space releases it', async () => {
    const f = fixture();
    const role = f.core.team.roles.create(owner, 'Finance', ['models.use']).role;
    f.core.team.roles.set(owner, alice.humanId, [role.roleId]);
    const group = f.core.channels.createGroup(owner, { name: 'Finance', members: [] });
    f.core.team.channelAccess.visibilitySet(owner, group.id, {
      kind: 'roles',
      roleIds: [role.roleId],
    });
    const shared = f.core.spaces.create(owner, 'Finance files', {
      kind: 'roles',
      roleIds: [role.roleId],
    });
    expect(f.core.team.channelAccess.canRead(alice, group.id)).toBe(true);
    expect(f.core.team.channelAccess.canRead(bob, group.id)).toBe(false);
    expect(f.core.spaces.list(alice).some((space) => space.spaceId === shared.spaceId)).toBe(true);
    expect(f.core.spaces.list(bob).some((space) => space.spaceId === shared.spaceId)).toBe(false);
    const before = f.core.team.roles.list(owner);
    expect(await f.bridge(owner).roleDelete({ roleId: role.roleId })).toMatchObject({
      ok: false,
      error: { code: 'role-in-use' },
    });
    expect(f.core.team.roles.list(owner)).toEqual(before);
    expect(f.core.team.channelAccess.canRead(alice, group.id)).toBe(true);
    f.core.spaces.update(owner, shared.spaceId, { audience: { kind: 'everyone' } });
    expect(f.core.team.roles.delete(owner, role.roleId)).toBeNull();
    expect(f.core.team.channelAccess.canRead(alice, group.id)).toBe(false);
    expect(f.core.spaces.list(bob).some((space) => space.spaceId === shared.spaceId)).toBe(true);
    const unused = f.core.team.roles.create(owner, 'Unused', []).role;
    expect(f.core.team.roles.delete(owner, unused.roleId)).toBeNull();
  });

  it('grants own account subdirectories and covered shared roots; refuses all other boundaries even to the Owner', async () => {
    const f = fixture();
    f.createBot();
    f.createBot(bob);
    f.createBot(owner, 'host-bot');
    const own = join(f.home, 'spaces/alice/project');
    mkdirSync(own);
    const good = await f.core.grants.create('alice-bot', f.workspace(own));
    expect(f.core.grants.requireActive('alice-bot', good.id).workspacePath).toBe(own);
    const accountGrant = await f.core.grants.create('alice-bot', 'spaces/alice');
    expect(accountGrant.workspacePath).toBe(join(f.home, 'spaces/alice/files'));
    const shared = f.core.spaces.create(owner, 'Alice only', {
      kind: 'members',
      humanIds: ['alice'],
    });
    const grant = await f.core.grants.create('alice-bot', shared.spaceId);
    await expect(f.core.grants.create('bob-bot', shared.spaceId)).rejects.toMatchObject({
      code: 'grant-outside-audience',
      details: { spaceId: shared.spaceId },
    });
    await expect(f.core.grants.create('host-bot', shared.spaceId)).rejects.toMatchObject({
      code: 'grant-outside-audience',
    });
    await expect(f.core.grants.create('host-bot', 'spaces/alice')).rejects.toMatchObject({
      code: 'grant-foreign-space',
    });
    await expect(f.core.grants.create('alice-bot', 'spaces/bob')).rejects.toMatchObject({
      code: 'grant-foreign-space',
      details: { path: join(f.home, 'spaces/bob/files'), spaceId: 'spaces/bob' },
    });
    for (const path of [
      f.core.registry.memoryDirFor('alice-bot')!,
      f.core.registry.memoryDirFor('bob-bot')!,
      join(f.home, 'botharness'),
      f.home,
    ])
      await expect(f.core.grants.create('alice-bot', f.workspace(path))).rejects.toMatchObject({
        code: path === f.home ? 'grant-foreign-space' : 'grant-protected-path',
      });
    f.core.spaces.update(owner, shared.spaceId, {
      audience: { kind: 'members', humanIds: ['bob'] },
    });
    expect(() => f.core.grants.requireActive('alice-bot', grant.id)).toThrow(
      'grant-outside-audience',
    );
    const result = await f
      .bridge(alice)
      .grantCreate({ slug: 'alice-bot', workspaceId: 'spaces/bob' });
    expect(result).toMatchObject({
      ok: false,
      error: { code: 'grant-foreign-space', details: { spaceId: 'spaces/bob' } },
    });
  });
});

const tools = [
  'read',
  'read_image',
  'write',
  'edit',
  'str_replace_editor',
  'glob',
  'grep',
  'apply_patch',
] as const;
const toolArgs = (tool: string, path: string) =>
  tool === 'apply_patch'
    ? { patch: `*** Begin Patch\n*** Update File: ${path}\n@@\n-old\n+new\n*** End Patch` }
    : tool === 'glob' || tool === 'grep'
      ? { path, pattern: '*' }
      : tool === 'str_replace_editor'
        ? { path, command: 'str_replace' }
        : { file_path: path };

describe('M6 path-addressed tools', () => {
  it.each(tools)(
    'contains %s against direct, symlink, traversal and hard-link escapes',
    async (tool) => {
      const f = fixture();
      f.createBot();
      f.createBot(bob);
      const project = join(f.home, 'spaces/alice/project');
      mkdirSync(project);
      const secret = join(f.home, 'spaces/bob/secret');
      writeFileSync(secret, 'Bob only');
      symlinkSync(
        join(f.home, 'spaces/bob'),
        join(project, 'link'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );
      linkSync(secret, join(project, 'hardlink'));
      symlinkSync(join(f.home, 'spaces/bob/not-created'), join(project, 'dangling'));
      const grant = await f.core.grants.create('alice-bot', f.workspace(project));
      f.core.grants.setOrchestratorWrite('alice-bot', grant.id, true);
      f.core.ownership.claim({
        sessionId: 'alice-session',
        botSlug: 'alice-bot',
        rootRole: 'orchestrator',
        cwdReference: f.core.registry.memoryDirFor('alice-bot')!,
        at: '2026-11-14',
      });
      const session = { id: 'alice-session', header: { cwd: project } } as Session;
      for (const path of [
        secret,
        join(project, 'link/secret'),
        relative(project, secret),
        join(project, 'hardlink'),
        join(project, 'dangling'),
        project + '/link/../bob/secret',
      ]) {
        expect(nativeFileToolDenial(f.core, session, tool, toolArgs(tool, path))).toBe(
          'grant-foreign-space',
        );
        expect(() => nativeExecutionRoot(f.core, session, tool, toolArgs(tool, path))).toThrow(
          'grant-foreign-space',
        );
      }
      f.core.assignmentAccess.set('alice-bot', 'danger-full-access', 'chat');
      const fullSession = {
        id: 'alice-session',
        header: { cwd: f.core.registry.memoryDirFor('alice-bot')! },
      } as Session;
      for (const path of [secret, join(project, 'link/secret'), join(project, 'hardlink')])
        expect(
          grantToolExecutionDenial(
            f.core,
            fullSession,
            { resolve: () => ({ mode: 'danger-full-access' }) } as never,
            { overrideOf: () => 'ask' } as never,
            tool,
            toolArgs(tool, path),
          ),
        ).toBe('grant-foreign-space');
      expect(readFileSync(secret, 'utf8')).toBe('Bob only');
      expect(f.core.currentRoots(session, 'read')).toContain(project);
      if (tool === 'glob' || tool === 'grep')
        expect(nativeFileToolDenial(f.core, session, tool, toolArgs(tool, project))).toBe(
          'grant-foreign-space',
        );
    },
  );

  it('blocks attachment writes, forwarding/import and stale workspace file targets with the same service authority', async () => {
    const f = fixture();
    f.createBot();
    f.createBot(bob);
    const project = join(f.home, 'spaces/alice/project');
    mkdirSync(project);
    const secret = join(f.home, 'spaces/bob/secret');
    writeFileSync(secret, 'Bob only');
    symlinkSync(
      join(f.home, 'spaces/bob'),
      join(project, 'link'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const grant = await f.core.grants.create('alice-bot', f.workspace(project));
    f.core.grants.setOrchestratorWrite('alice-bot', grant.id, true);
    await expect(
      saveAttachmentFile(
        { grantId: grant.id, destinationPath: 'link/new' },
        {
          botSlug: 'alice-bot',
          grants: f.core.grants,
          attachments: f.core.attachments,
          source: () => {
            throw new Error('must-not-read-source');
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'grant-foreign-space' });
    f.db.transaction((connection) =>
      connection
        .prepare('UPDATE workspace_grants SET workspace_path = ? WHERE id = ?')
        .run(join(f.home, 'spaces/bob'), grant.id),
    );
    expect(
      f.bridge(alice).workspaceFileTarget({ slug: 'alice-bot', grantId: grant.id }),
    ).toMatchObject({
      ok: false,
      error: { code: 'grant-foreign-space', details: { spaceId: 'spaces/bob' } },
    });
    const dm = f.core.channels.getOrCreateDm(alice, 'alice-bot', 'Alice')!;
    linkSync(secret, join(project, 'hardlink'));
    for (const path of [
      secret,
      join(project, 'link/secret'),
      join(project, '../../bob/secret'),
      join(project, 'hardlink'),
    ]) {
      await expect(
        f.core.runtime.runDirectBotTool!(
          'alice-bot',
          'channel_attachment_import',
          { channel_id: dm.id, file_path: path },
          new AbortController().signal,
        ),
      ).rejects.toThrow('grant-foreign-space');
    }
    expect(() => f.core.grants.validatePath!('alice-bot', secret)).toThrow('grant-foreign-space');
    expect(existsSync(join(f.home, 'spaces/bob/new'))).toBe(false);
  });
});

describe('M6 Memory migration and offboarding', () => {
  it.each([147, 149])(
    'upgrades generation %s through the required migrations, preserving Channel access and Memory ownership',
    async (generation) => {
      const home = realpathSync(createTempRoot('m6-upgrade-'));
      const prior = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
            (migration) => migration.generation <= generation,
          ),
        ),
      });
      expect(prior.generation).toBe(generation);
      const db = attachOperationalModule(prior, 'm6-old');
      db.transaction((connection) =>
        connection
          .prepare("INSERT INTO humans VALUES ('alice', 'Alice', 'active', '2026-11-14')")
          .run(),
      );
      db.transaction((connection) => {
        connection
          .prepare(`INSERT INTO channel_records(channel_id, record_json, visibility_json, owner_human_id)
        VALUES ('main-role-channel', ?, ?, 'alice')`)
          .run(
            JSON.stringify({
              id: 'main-role-channel',
              type: 'group',
              name: 'Main roles',
              members: [],
              ownerHumanId: 'alice',
              createdAt: '2026-11-14',
            }),
            JSON.stringify({ kind: 'roles', roleIds: ['member'] }),
          );
      });
      const registry = createTestRegistry({
        database: prior,
        rootDir: join(home, 'botharness/bots'),
        initializeMemory: (memoryDir) => {
          mkdirSync(join(memoryDir, '.git'));
          return { ok: true };
        },
      });
      for (const slug of ['old-private', 'old-tob', 'old-retained'])
        expect(registry.create({ slug, displayName: slug, ownerHumanId: 'alice' }).ok).toBe(true);
      db.transaction((connection) =>
        connection.prepare("INSERT INTO tob_identity VALUES ('alice', 'old-tob')").run(),
      );
      const retainedPath = registry.memoryDirFor('old-retained')!;
      db.transaction((connection) =>
        connection.prepare('INSERT INTO persona_bot_deletions VALUES (?, ?)').run(
          'old-retained',
          JSON.stringify({
            slug: 'old-retained',
            displayName: 'Retained',
            acceptedAt: '2026-11-14',
            memoryDir: retainedPath,
            eraseMemory: false,
            phase: 'complete',
            memory: 'retained',
            ownership: memoryOwnership(retainedPath),
          }),
        ),
      );
      const before = memoryOwnership(registry.memoryDirFor('old-private')!);
      writeFileSync(join(before.path, 'kept'), 'preserved');
      prior.close();
      const f = fixture(home);
      expect(f.core.operationalDatabase.generation).toBe(150);
      expect(
        f.db.read((connection) =>
          connection
            .prepare(
              "SELECT owner_human_id, visibility_json FROM channel_records WHERE channel_id = 'main-role-channel'",
            )
            .get(),
        ),
      ).toEqual({
        owner_human_id: 'alice',
        visibility_json: JSON.stringify({ kind: 'roles', roleIds: ['member'] }),
      });
      const target = accountMemoryPath(home, 'alice', 'old-private');
      expect(f.core.registry.memoryDirFor('old-private')).toBe(target);
      expect(readFileSync(join(target, 'kept'), 'utf8')).toBe('preserved');
      expect(memoryOwnership(target)).toEqual({ ...before, path: target });
      expect(
        f.db.read((connection) =>
          connection
            .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
            .get('old-private'),
        ),
      ).toEqual({ body: JSON.stringify({ ...before, path: target }) });
      expect(f.core.registry.memoryDirFor('old-tob')).toBe(
        accountMemoryPath(home, 'alice', 'old-tob'),
      );
      expect(f.core.tob.slug(alice)).toBe('old-tob');
      const retained = f.core.deletions.get('old-retained');
      expect(retained).toMatchObject({
        phase: 'complete',
        memory: 'retained',
        memoryDir: accountMemoryPath(home, 'alice', 'old-retained'),
        ownership: memoryOwnership(accountMemoryPath(home, 'alice', 'old-retained')),
      });
      await f.core.team.deactivate(owner, 'alice');
      expect(f.core.deletions.memberPreview('alice', 'old-retained').eraseAvailable).toBe(true);
      await f.core.team.reactivate(owner, 'alice');
      expect(
        f.db.read((connection) => connection.prepare('PRAGMA foreign_key_check').all()),
      ).toEqual([]);
      expect(existsSync(before.path)).toBe(false);
      expect(f.createBot(alice, 'new-private').memoryDir).toBe(
        accountMemoryPath(home, 'alice', 'new-private'),
      );
    },
  );

  it('recovers a Memory rename interrupted before the ownership transaction and rejects substituted repositories', () => {
    const f = fixture();
    f.createBot();
    const source = f.core.registry.memoryDirFor('alice-bot')!;
    const target = join(f.home, 'spaces/alice/bots/moved/memory');
    const proof = memoryOwnership(source);
    mkdirSync(join(f.home, 'spaces/alice/bots/moved'), { recursive: true });
    f.db.transaction((connection) =>
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?, ?, ?, ?)')
        .run('alice-bot', source, target, JSON.stringify(proof)),
    );
    renameSync(source, target);
    relocateSpaceMemories(f.db, f.home);
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(target);
    expect(memoryOwnership(target)).toEqual({ ...proof, path: target });
    f.db.transaction((connection) =>
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?, ?, ?, ?)')
        .run('alice-bot', target, source, JSON.stringify({ ...proof, inode: -42 })),
    );
    expect(() => relocateSpaceMemories(f.db, f.home)).toThrow('space-memory-ownership-invalid');
    expect(existsSync(target)).toBe(true);
  });

  it('previews and transfers account files and private Bot Memory, retains Tob and shared roots, then purges the account through Content Purge', async () => {
    const f = fixture();
    f.createBot();
    const tob = await f.core.tob.ensure(alice);
    const oldMemory = f.core.registry.memoryDirFor('alice-bot')!;
    writeFileSync(join(oldMemory, 'retained'), 'bot memory');
    writeFileSync(join(f.home, 'spaces/alice/report.txt'), 'member file');
    const shared = f.core.spaces.create(owner, 'Shared', { kind: 'everyone' });
    writeFileSync(join(f.core.spaces.path(shared.spaceId), 'shared.txt'), 'shared file');
    const preview = f.core.team.transferPreview(owner, 'alice');
    expect(preview.space?.files.some((file) => file.path === 'report.txt')).toBe(true);
    expect(preview.bots.map((bot) => bot.slug)).toEqual(['alice-bot']);
    await f.core.team.transfer(owner, 'alice', 'bob');
    const moved = f.core.registry.memoryDirFor('alice-bot')!;
    expect(moved).toBe(accountMemoryPath(f.home, 'bob', 'alice-bot'));
    expect(f.core.registry.get('alice-bot')?.ownerHumanId).toBe('bob');
    expect(readFileSync(join(moved, 'retained'), 'utf8')).toBe('bot memory');
    expect(readFileSync(join(f.home, 'spaces/bob/report.txt'), 'utf8')).toBe('member file');
    expect(f.core.registry.get(tob.botSlug)?.ownerHumanId).toBe('alice');
    expect(f.core.registry.memoryDirFor(tob.botSlug)).toBe(
      accountMemoryPath(f.home, 'alice', tob.botSlug),
    );
    await f.core.team.deactivate(owner, 'alice');
    const purge = f.core.team.purgePreview(owner, 'alice');
    f.db.transaction((connection) =>
      connection
        .prepare("INSERT INTO member_credentials VALUES ('alice', 'alice', '{}', '[]', 0)")
        .run(),
    );
    const current = f.core.team.purgePreview(owner, 'alice');
    expect(purge.counts.bots).toBe(1);
    await f.core.team.purgeConfirm(owner, 'alice', current.token, 'alice');
    expect(existsSync(join(f.home, 'spaces/alice'))).toBe(false);
    expect(existsSync(moved)).toBe(true);
    expect(readFileSync(join(f.core.spaces.path(shared.spaceId), 'shared.txt'), 'utf8')).toBe(
      'shared file',
    );
    expect(f.core.spaces.list(owner).some((space) => space.spaceId === shared.spaceId)).toBe(true);
  });

  it('recovers an interrupted account transfer and refuses destination collisions without losing either file', () => {
    const f = fixture();
    f.createBot();
    writeFileSync(join(f.home, 'spaces/alice/files/report'), 'source');
    writeFileSync(join(f.home, 'spaces/bob/files/report'), 'target');
    expect(() => prepareSpaceTransfer(f.db, f.home, 'alice', 'bob', ['alice-bot'])).toThrow(
      'space-name-taken',
    );
    expect(readFileSync(join(f.home, 'spaces/alice/files/report'), 'utf8')).toBe('source');
    expect(readFileSync(join(f.home, 'spaces/bob/files/report'), 'utf8')).toBe('target');
    const pending = prepareSpaceTransfer(f.db, f.home, 'alice', 'local-human', ['alice-bot']);
    expect(existsSync(join(f.home, 'spaces/local-human/files/report'))).toBe(true);
    recoverSpaceTransfers(f.db);
    expect(readFileSync(join(f.home, 'spaces/alice/files/report'), 'utf8')).toBe('source');
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(
      accountMemoryPath(f.home, 'alice', 'alice-bot'),
    );
    expect(existsSync(accountMemoryPath(f.home, 'alice', 'alice-bot'))).toBe(true);
    expect(
      f.db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
    ).toEqual([]);
    expect(pending).toBeDefined();
  });

  it('keeps space listing and ordinary path checks at a fixed query count as the member directory grows', () => {
    const f = fixture();
    f.createBot();
    f.core.spaces.create(owner, 'Role', { kind: 'roles', roleIds: ['member'] });
    const sample = () => {
      let before = f.core.operationalDatabase.diagnostics().metrics.reads;
      f.core.spaces.list(alice);
      const listing = f.core.operationalDatabase.diagnostics().metrics.reads - before;
      before = f.core.operationalDatabase.diagnostics().metrics.reads;
      f.core.spaces.assertPath('alice-bot', join(f.home, 'spaces/alice/files'));
      return { listing, path: f.core.operationalDatabase.diagnostics().metrics.reads - before };
    };
    const before = sample();
    f.db.transaction((connection) => {
      for (let i = 0; i < 1000; i++)
        connection
          .prepare("INSERT INTO humans VALUES (?, 'Member', 'active', '2026-11-14')")
          .run('member-' + i);
    });
    for (let i = 0; i < 20; i++)
      f.core.spaces.create(owner, 'Role ' + i, { kind: 'roles', roleIds: ['member'] });
    expect(sample()).toEqual(before);
    expect(before.listing).toBeLessThanOrEqual(4);
    expect(before.path).toBeLessThanOrEqual(4);
  });

  it('invalidates a purge preview when account files change, and deletes an account with no Bots', async () => {
    const f = fixture();
    f.db.transaction((connection) =>
      connection
        .prepare("INSERT INTO member_credentials VALUES ('alice', 'alice', '{}', '[]', 0)")
        .run(),
    );
    writeFileSync(join(f.home, 'spaces/alice/a'), 'old');
    await f.core.team.deactivate(owner, 'alice');
    const preview = f.core.team.purgePreview(owner, 'alice');
    writeFileSync(join(f.home, 'spaces/alice/b'), 'new');
    await expect(f.core.team.purgeConfirm(owner, 'alice', preview.token, 'alice')).rejects.toThrow(
      'purge-token-invalid',
    );
    const current = f.core.team.purgePreview(owner, 'alice');
    await f.core.team.purgeConfirm(owner, 'alice', current.token, 'alice');
    expect(accountSpaceFiles(f.home, 'alice')).toEqual([]);
    expect(existsSync(join(f.home, 'spaces/alice'))).toBe(false);
  });
});
