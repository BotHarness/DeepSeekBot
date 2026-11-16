import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { installNativeTools, executeNativeTool } from '../src/runtime/native-agent-compat.js';
import { grantToolExecutionDenial } from '../src/workspaces/grant-execution.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  chmodSync,
  rmSync,
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
import {
  assertNativeSearchResult,
  installNativeSearchResultGuard,
  nativeFileSpaceDenial,
  nativeFileToolDenial,
  nativeExecutionRoot,
} from '../src/workspaces/grant-native-tools.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { accountMemoryPath, relocateSpaceMemories } from '../src/workspaces/space-memory.js';
import type { SpaceAudience } from '../src/workspaces/spaces.js';
import {
  accountSpaceFiles,
  prepareSpaceTransfer,
  recoverSpaceTransfers,
  relocateTobWorkspaces,
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
  it('relocates grant-only legacy subpaths without granting the account root or widening write access', () => {
    const f = fixture();
    const bot = f.createBot(alice, 'subpath-only');
    const source = join(f.home, 'botharness/tob-workspaces', bot.slug);
    const target = join(f.home, 'spaces/alice/files');
    mkdirSync(join(source, 'reports'), { recursive: true });
    mkdirSync(join(source, 'drafts'), { recursive: true });
    writeFileSync(join(source, 'reports/kept.txt'), 'Report');
    writeFileSync(join(source, 'drafts/private.txt'), 'Draft');
    writeFileSync(join(target, 'unrelated.txt'), 'Private account file');
    f.db.transaction((db) => {
      db.prepare('DELETE FROM workspace_grants WHERE bot_slug = ?').run(bot.slug);
      db.prepare(
        "UPDATE persona_bots SET body = json_set(body, '$.workspaces', json('[]')) WHERE slug = ?",
      ).run(bot.slug);
      for (const [name, write] of [
        ['reports', 0],
        ['drafts', 1],
      ] as const)
        db.prepare(`INSERT INTO workspace_grants (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
          VALUES (?,?,?,?,?,'before',?,?)`).run(
          'legacy-' + name,
          bot.slug,
          'legacy-' + name,
          join(source, name),
          name,
          write,
          write,
        );
    });
    relocateTobWorkspaces(f.db, f.home);
    expect(f.core.registry.get(bot.slug)?.workspaces).toEqual([]);
    expect(
      f.core.grants
        .list(bot.slug)
        .filter((grant) => !grant.revokedAt)
        .toSorted((a, b) => a.workspacePath.localeCompare(b.workspacePath)),
    ).toEqual([
      expect.objectContaining({ workspacePath: join(target, 'drafts'), orchestratorWrite: true }),
      expect.objectContaining({ workspacePath: join(target, 'reports'), orchestratorWrite: false }),
    ]);
    for (const grant of f.core.grants.list(bot.slug).filter((grant) => !grant.revokedAt)) {
      expect(grant.workspacePath).not.toBe(target);
      expect(() => f.core.grants.validatePath?.(bot.slug, grant.workspacePath)).not.toThrow();
    }
    expect(readFileSync(join(target, 'reports/kept.txt'), 'utf8')).toBe('Report');
    expect(readFileSync(join(target, 'drafts/private.txt'), 'utf8')).toBe('Draft');
    expect(readFileSync(join(target, 'unrelated.txt'), 'utf8')).toBe('Private account file');
    const grants = f.core.grants.list(bot.slug);
    relocateTobWorkspaces(f.db, f.home);
    expect(f.core.grants.list(bot.slug)).toEqual(grants);
  });

  it('refuses a legacy grant whose remapped path escapes the account files root', () => {
    const f = fixture();
    const bot = f.createBot(alice, 'unsafe-legacy');
    const source = join(f.home, 'botharness/tob-workspaces', bot.slug);
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, 'kept.txt'), 'Kept');
    f.db.transaction((db) =>
      db
        .prepare(`INSERT INTO workspace_grants
      (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at) VALUES ('unsafe',?,'unsafe',?,'unsafe','before')`)
        .run(bot.slug, source + '/../escape'),
    );
    expect(() => relocateTobWorkspaces(f.db, f.home)).toThrow('grant-protected-path');
    expect(readFileSync(join(source, 'kept.txt'), 'utf8')).toBe('Kept');
    expect(
      f.core.grants.list(bot.slug).find((grant) => grant.id === 'unsafe')?.revokedAt,
    ).toBeUndefined();
  });

  it.each([false, true])(
    'allows Owner-owned Bots to grant native and own account folders with Team enabled=%s',
    async (enabled) => {
      const f = fixture();
      f.db.transaction((db) =>
        db.prepare('UPDATE team_settings SET enabled = ?').run(Number(enabled)),
      );
      f.createBot(owner, 'owner-bot');
      for (const path of [
        createTempRoot('owner-native-'),
        join(f.home, 'spaces', owner.humanId, 'files'),
      ]) {
        const grant = await f.core.grants.create('owner-bot', f.workspace(path));
        expect(f.core.grants.requireActive('owner-bot', grant.id).workspacePath).toBe(
          realpathSync(path),
        );
      }
      await expect(
        f.core.grants.create('owner-bot', f.workspace(join(f.home, 'botharness'))),
      ).rejects.toMatchObject({ code: 'grant-protected-path' });
      await expect(
        f.core.grants.create('owner-bot', f.workspace(join(f.home, 'spaces/bob/files'))),
      ).rejects.toMatchObject({ code: 'grant-foreign-space' });
      const requested = f.workspace(createTempRoot('owner-request-'));
      const dm = f.core.channels.getOrCreateDm(owner, 'owner-bot', 'Owner Bot')!;
      await f.core.channels.appendMessage(owner, dm.id, {
        id: 'owner-grant-request',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'owner-bot' },
        body: 'request',
        grantRequest: true,
      });
      expect(
        await f.bridge(owner).grantRequestApprove({
          slug: 'owner-bot',
          channelId: dm.id,
          requestMessageId: 'owner-grant-request',
          workspaceId: requested,
          acknowledgeReadWrite: true,
        }),
      ).toMatchObject({
        ok: true,
        value: { grant: { workspaceId: requested, orchestratorWrite: true } },
      });
    },
  );

  it('contains Owner and manager Bots to shared audiences, including aliases and retained Grants after restart', async () => {
    const f = fixture();
    f.createBot(owner, 'owner-audience');
    f.createBot(alice, 'alice-manager');
    f.core.team.roles.set(owner, alice.humanId, ['admin']);
    const held = f.core.team.roles.create(owner, 'Owner held', []).role.roleId;
    const unheld = f.core.team.roles.create(owner, 'Owner unheld', []).role.roleId;
    f.db.transaction((db) =>
      db.prepare('INSERT INTO human_roles VALUES (?, ?)').run(owner.humanId, held),
    );
    const audiences: SpaceAudience[] = [
      { kind: 'members', humanIds: [owner.humanId] },
      { kind: 'roles', roleIds: [held] },
      { kind: 'everyone' },
      { kind: 'members', humanIds: [bob.humanId] },
      { kind: 'roles', roleIds: [unheld] },
    ];
    const allowed: string[] = [];
    const refused: { id: string; spaceId: string; path: string }[] = [];
    for (const [index, audience] of audiences.entries()) {
      const space = f.core.spaces.create(owner, 'Audience ' + index, audience);
      const path = join(f.home, space.spaceId, 'files');
      if (index < 3) {
        const grant = await f.core.grants.create('owner-audience', space.spaceId);
        expect(f.core.grants.requireActive('owner-audience', grant.id)).toEqual(grant);
        allowed.push(grant.id);
        continue;
      }
      const denial = { code: 'grant-outside-audience', details: { path, spaceId: space.spaceId } };
      await expect(f.core.grants.create('owner-audience', space.spaceId)).rejects.toMatchObject(
        denial,
      );
      await expect(f.core.grants.create('alice-manager', space.spaceId)).rejects.toMatchObject(
        denial,
      );
      expect(() => f.core.spaces.assertPath('owner-audience', path)).toThrow(
        'grant-outside-audience',
      );
      const source = join(path, 'secret');
      writeFileSync(source, 'outside audience');
      const alias = join(createTempRoot('owner-shared-alias-'), 'alias');
      symlinkSync(path, alias, 'dir');
      await expect(
        f.core.grants.create('owner-audience', f.workspace(alias)),
      ).rejects.toMatchObject(denial);
      const hardlink = join(createTempRoot('owner-shared-hardlink-'), 'secret');
      linkSync(source, hardlink);
      expect(() => f.core.spaces.assertPath('owner-audience', hardlink)).toThrow(
        'grant-outside-audience',
      );
      const id = 'legacy-owner-shared-' + index;
      f.db.transaction((db) =>
        db
          .prepare(`INSERT INTO workspace_grants
        (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
        VALUES (?, 'owner-audience', ?, ?, 'Legacy', '2026-11-15', 1, 1)`)
          .run(id, space.spaceId, path),
      );
      refused.push({ id, spaceId: space.spaceId, path });
    }
    f.core.schedules.close();
    f.core.externalMessaging.close();
    await f.core.runtime.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restarted = fixture(f.home);
    for (const id of allowed)
      expect(restarted.core.grants.requireActive('owner-audience', id).id).toBe(id);
    for (const { id, path, spaceId } of refused) {
      const retained = restarted.core.grants
        .list('owner-audience')
        .find((grant) => grant.id === id);
      expect(retained).toBeDefined();
      expect(retained?.revokedAt).toBeUndefined();
      expect(() => restarted.core.grants.requireActive('owner-audience', id)).toThrowError(
        expect.objectContaining({ code: 'grant-outside-audience', details: { path, spaceId } }),
      );
    }
  });

  it('preserves implicit Owner Memory access inside a shared folder without making it grantable', async () => {
    const f = fixture();
    const shared = f.core.spaces.create(owner, 'Custom Memory container', {
      kind: 'members',
      humanIds: [bob.humanId],
    });
    const slug = 'owner-shared-memory';
    expect(
      f.core.registry.create({
        slug,
        displayName: slug,
        ownerHumanId: owner.humanId,
        memoryLocation: join(f.home, shared.spaceId, 'files'),
      }).ok,
    ).toBe(true);
    const memory = f.core.registry.memoryDirFor(slug)!;
    const proof = memoryOwnership(memory);
    const file = join(memory, 'private.txt');
    writeFileSync(file, 'Owner private Memory');
    linkSync(file, join(createTempRoot('owner-memory-alias-'), 'private.txt'));
    expect(() => f.core.spaces.assertPath(slug, file)).not.toThrow();
    expect(readFileSync(file, 'utf8')).toBe('Owner private Memory');
    expect(memoryOwnership(memory)).toEqual(proof);
    await expect(f.core.grants.create(slug, f.workspace(memory))).rejects.toMatchObject({
      code: 'grant-protected-path',
    });
    await expect(f.core.grants.create(slug, shared.spaceId)).rejects.toMatchObject({
      code: 'grant-protected-path',
    });
  });

  it.each([owner, alice])(
    'refuses restricted shared content hard-linked into %j private Memory',
    (human) => {
      const f = fixture();
      const everyone = f.core.spaces.create(owner, 'Memory container', { kind: 'everyone' });
      const slug = 'memory-link-' + human.humanId;
      expect(
        f.core.registry.create({
          slug,
          displayName: slug,
          ownerHumanId: human.humanId,
          ...(human === owner ? { memoryLocation: join(f.home, everyone.spaceId, 'files') } : {}),
        }).ok,
      ).toBe(true);
      const restricted = f.core.spaces.create(owner, 'Restricted content', {
        kind: 'members',
        humanIds: [bob.humanId],
      });
      const source = join(f.home, restricted.spaceId, 'files/secret');
      writeFileSync(source, 'restricted shared content');
      const linked = join(f.core.registry.memoryDirFor(slug)!, 'smuggled');
      linkSync(source, linked);
      expect(() => f.core.spaces.assertPath(slug, linked)).toThrowError(
        expect.objectContaining({
          code: 'grant-outside-audience',
          details: { path: linked, spaceId: restricted.spaceId },
        }),
      );
    },
  );

  it('provisions one revocable read/write account Grant for a new member Bot, and never restores a revoked default', async () => {
    const f = fixture();
    const creator = f.core.team.roles.create(owner, 'Private creator', ['bots.createPrivate']).role;
    f.core.team.roles.set(owner, alice.humanId, ['member', creator.roleId]);
    const created = await f
      .bridge(alice)
      .create({ displayName: 'Personal', operationKey: 'member-bot-default-1' });
    if (!created.ok) throw new Error(created.error.code);
    const slug = created.value.bot.slug;
    const grants = f.core.grants.list(slug);
    expect(grants).toMatchObject([
      {
        workspaceId: 'spaces/alice',
        workspacePath: join(f.home, 'spaces/alice/files'),
        orchestratorWrite: true,
      },
    ]);
    expect(f.core.registry.memoryDirFor(slug)).toBe(accountMemoryPath(f.home, 'alice', slug));
    const file = join(f.home, 'spaces/alice/files/note.txt');
    writeFileSync(file, 'owned file');
    f.core.ownership.claim({
      sessionId: 'member-default-session',
      botSlug: slug,
      rootRole: 'orchestrator',
      cwdReference: accountMemoryPath(f.home, 'alice', slug),
      at: new Date().toISOString(),
    });
    const session = {
      id: 'member-default-session',
      header: { cwd: accountMemoryPath(f.home, 'alice', slug) },
    } as Session;
    expect(nativeFileToolDenial(f.core, session, 'write', { file_path: file })).toBeUndefined();
    expect(
      await f.bridge(alice).grantWriteSet({ slug, grantId: grants[0]!.id, enabled: false }),
    ).toMatchObject({ ok: true });
    await f.bridge(alice).create({ displayName: 'Personal', operationKey: 'member-bot-default-1' });
    expect(f.core.grants.requireActive(slug, grants[0]!.id).orchestratorWrite).toBe(false);
    expect(nativeFileToolDenial(f.core, session, 'read', { file_path: file })).toBeUndefined();
    expect(nativeFileToolDenial(f.core, session, 'write', { file_path: file })).toMatch(/outside/);
    expect(await f.bridge(alice).grantRevoke({ slug, grantId: grants[0]!.id })).toMatchObject({
      ok: true,
    });
    await f.bridge(alice).create({ displayName: 'Personal', operationKey: 'member-bot-default-1' });
    expect(f.core.grants.list(slug)).toHaveLength(1);
    expect(f.core.grants.list(slug)[0]?.revokedAt).toBeDefined();
    expect(nativeFileToolDenial(f.core, session, 'read', { file_path: file })).toMatch(/outside/);
  });

  it('contains member Grants and Memory creation/moves to the account policy', async () => {
    const f = fixture();
    f.createBot();
    for (const path of [
      createTempRoot('member-outside-'),
      join(f.home, 'spaces/alice'),
      join(f.home, 'spaces/alice/bots'),
    ])
      await expect(f.core.grants.create('alice-bot', f.workspace(path))).rejects.toMatchObject({
        code: 'grant-protected-path',
      });
    const outside = createTempRoot('member-memory-outside-');
    const before = f.core.registry.memoryDirFor('alice-bot');
    expect(
      f.core.registry.create({
        slug: 'escape-memory',
        displayName: 'Escape',
        ownerHumanId: 'alice',
        memoryLocation: outside,
      }),
    ).toMatchObject({ ok: false, reason: 'invalid-memory-dir' });
    expect(() => f.core.registry.setMemoryDir('alice-bot', join(outside, 'alice-bot'))).toThrow(
      'grant-foreign-space',
    );
    expect(
      await f.bridge(alice).memoryMove({ slug: 'alice-bot', location: outside }),
    ).toMatchObject({ ok: false, error: { code: 'grant-foreign-space' } });
    expect(await f.bridge(alice).memoryMove({ slug: 'alice-bot', location: null })).toEqual({
      ok: true,
      value: { memoryDir: before, moved: false },
    });
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(before);
    expect(existsSync(join(outside, 'alice-bot'))).toBe(false);
  });
  it('refuses member approval-card requests outside account files and covered shared spaces', async () => {
    const f = fixture();
    f.createBot();
    const shared = f.core.spaces.create(owner, 'Restricted', {
      kind: 'members',
      humanIds: ['bob'],
    });
    const dm = f.core.channels.getOrCreateDm(alice, 'alice-bot', 'Alice')!;
    const paths = [
      { path: createTempRoot('member-request-outside-'), code: 'grant-protected-path' },
      { path: join(f.home, 'spaces/bob/files'), code: 'grant-foreign-space' },
      { path: join(f.home, shared.spaceId, 'files'), code: 'grant-outside-audience' },
    ];
    for (const [index, entry] of paths.entries()) {
      const id = 'request-' + index;
      await f.core.channels.appendMessage(alice, dm.id, {
        id,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'alice-bot' },
        body: 'request',
        grantRequest: true,
      });
      expect(
        await f.bridge(alice).grantRequestApprove({
          slug: 'alice-bot',
          channelId: dm.id,
          requestMessageId: id,
          workspaceId: f.workspace(entry.path),
          acknowledgeReadWrite: true,
        }),
      ).toMatchObject({ ok: false, error: { code: entry.code } });
      expect(f.core.channels.grantRequestResolution?.(dm.id, id)).toBeUndefined();
    }
    expect(f.core.grants.list('alice-bot')).toHaveLength(1);
  });
  it('publishes the member Bot and its default Grant atomically and retries after provisioning failure', () => {
    const f = fixture();
    f.db.transaction((db) =>
      db.exec(
        "CREATE TRIGGER fail_provision BEFORE INSERT ON workspace_grants BEGIN SELECT RAISE(ABORT, 'provisioning-failed'); END",
      ),
    );
    expect(() => f.createBot(alice, 'retry-bot')).toThrow();
    expect(f.core.registry.get('retry-bot')).toBeUndefined();
    expect(f.core.grants.list('retry-bot')).toEqual([]);
    expect(existsSync(accountMemoryPath(f.home, 'alice', 'retry-bot'))).toBe(false);
    f.db.transaction((db) => db.exec('DROP TRIGGER fail_provision'));
    f.createBot(alice, 'retry-bot');
    expect(f.core.grants.list('retry-bot')).toMatchObject([
      { workspaceId: 'spaces/alice', orchestratorWrite: true },
    ]);
    expect(f.core.deletions.preview('retry-bot').eraseAvailable).toBe(true);
  });
  it('provisions imported member Bots and safely retries an import whose Grant could not be created', async () => {
    const f = fixture();
    const input = {
      slug: 'import-member',
      displayName: 'Import',
      ownerHumanId: 'alice',
      files: [{ path: 'SOUL.md', data: Buffer.from('persona') }],
    };
    f.db.transaction((db) =>
      db.exec(
        "CREATE TRIGGER fail_provision BEFORE INSERT ON workspace_grants BEGIN SELECT RAISE(ABORT, 'provisioning-failed'); END",
      ),
    );
    expect(await f.core.registry.createFromFiles(input)).toMatchObject({ ok: false });
    expect(f.core.registry.get(input.slug)).toBeUndefined();
    expect(existsSync(accountMemoryPath(f.home, 'alice', input.slug))).toBe(false);
    f.db.transaction((db) => db.exec('DROP TRIGGER fail_provision'));
    expect(await f.core.registry.createFromFiles(input)).toMatchObject({ ok: true });
    expect(f.core.grants.list(input.slug)).toMatchObject([
      { workspaceId: 'spaces/alice', orchestratorWrite: true },
    ]);
    expect(f.core.deletions.preview(input.slug).eraseAvailable).toBe(true);
  });

  it.each([false, true])(
    'keeps native Workspaces available to the Owner with Team mode enabled=%s',
    async (enabled) => {
      const f = fixture();
      f.db.transaction((db) =>
        db.prepare('UPDATE team_settings SET enabled = ?').run(Number(enabled)),
      );
      const nativePath = createTempRoot('m6-native-project-');
      f.workspace(nativePath, 'native-workspace');
      const options = await f.bridge(owner).workspaceOptions({});
      expect(options).toMatchObject({
        ok: true,
        value: {
          workspaces: expect.arrayContaining([
            { id: 'native-workspace', path: nativePath, title: 'native-workspace' },
          ]),
        },
      });
      if (!options.ok) throw new Error(options.error.code);
      expect(options.value.workspaces.some((entry) => entry.id === 'spaces/' + owner.humanId)).toBe(
        true,
      );
      expect(options.value.workspaces.some((entry) => entry.id === 'spaces/bob')).toBe(false);
      f.createBot(owner, 'owner-bot');
      const grant = await f.core.grants.create('owner-bot', 'native-workspace');
      expect(f.core.grants.requireActive('owner-bot', grant.id).workspacePath).toBe(nativePath);
      await expect(
        f.core.grants.create('owner-bot', f.workspace(join(f.home, 'botharness'), 'host-data')),
      ).rejects.toMatchObject({ code: 'grant-protected-path' });
      await expect(
        f.core.grants.create('owner-bot', f.workspace(f.home, 'host-directory')),
      ).rejects.toMatchObject({ code: 'grant-foreign-space' });
      if (enabled) {
        expect(await f.bridge(alice).workspaceOptions({})).toMatchObject({
          ok: true,
          value: {
            workspaces: [
              { id: 'spaces/alice', path: join(f.home, 'spaces/alice/files'), title: 'alice' },
            ],
          },
        });
      }
    },
  );

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

  it('grants member files and requires covered shared roots for every Bot owner', async () => {
    const f = fixture();
    f.createBot();
    f.createBot(bob);
    f.createBot(owner, 'host-bot');
    const own = join(f.home, 'spaces/alice/files/project');
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
      details: { spaceId: shared.spaceId },
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
    ? { input: `*** Begin Patch\n*** Update File: ${path}\n@@\n-old\n+new\n*** End Patch` }
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
      const project = join(f.home, 'spaces/alice/files/project');
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
      expect(() => f.core.assignmentAccess.set('alice-bot', 'danger-full-access', 'chat')).toThrow(
        'permission-required',
      );
      const fullSession = {
        id: 'alice-session',
        header: { cwd: f.core.registry.memoryDirFor('alice-bot')! },
      } as Session;
      for (const path of [
        secret,
        join(project, 'link/secret'),
        join(project, 'hardlink'),
        join(project, 'dangling'),
        project + '/link/../bob/secret',
      ])
        expect(
          grantToolExecutionDenial(
            f.core,
            fullSession,
            { resolve: () => ({ mode: 'danger-full-access' }) } as never,
            { overrideOf: () => 'ask' } as never,
            tool,
            toolArgs(tool, path),
          ),
        ).toBe('permission-required');
      expect(readFileSync(secret, 'utf8')).toBe('Bob only');
      expect(f.core.currentRoots(session, 'read')).toContain(project);
      if (tool === 'glob' || tool === 'grep')
        expect(
          nativeFileToolDenial(f.core, session, tool, toolArgs(tool, project)),
        ).toBeUndefined();
    },
  );

  it('blocks attachment writes, forwarding/import and stale workspace file targets with the same service authority', async () => {
    const f = fixture();
    f.createBot();
    f.createBot(bob);
    const project = join(f.home, 'spaces/alice/files/project');
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
      project + '/' + relative(project, secret),
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
  it('clears a member default Memory override without losing account-space ownership', () => {
    const f = fixture();
    f.createBot(alice);
    const path = accountMemoryPath(f.home, 'alice', 'alice-bot');
    const proof = memoryOwnership(path);
    const result = f.core.registry.setMemoryDir('alice-bot', path);
    expect(result.ok).toBe(true);
    expect(f.core.registry.get('alice-bot')?.memoryDir).toBeUndefined();
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(path);
    expect(f.core.deletions.preview('alice-bot')).toMatchObject({
      memoryDir: path,
      eraseAvailable: true,
    });
    expect(memoryOwnership(path)).toEqual(proof);
  });

  it.each([147, 149, 150, 151, 152])(
    'upgrades generation %s through the required migrations, preserving Channel access and Memory ownership',
    async (generation) => {
      const home = realpathSync(createTempRoot('m6-upgrade-'));
      const prior = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
            (migration) => migration.generation <= Math.min(generation, 150),
          ),
        ),
      });
      expect(prior.generation).toBe(Math.min(generation, 150));
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
      expect(registry.create({ slug: 'old-owner', displayName: 'Owner' }).ok).toBe(true);
      const ownerMemory = registry.memoryDirFor('old-owner')!;
      const ownerProof = memoryOwnership(ownerMemory);
      const ownerNative = realpathSync(createTempRoot('m6-upgrade-owner-native-'));
      db.transaction((connection) =>
        connection
          .prepare(`INSERT INTO workspace_grants
        (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
        VALUES ('old-owner-native','old-owner','old-owner-native',?,'Native','2026-11-15',1,1)`)
          .run(ownerNative),
      );
      for (const slug of ['old-private', 'old-tob', 'old-retained', 'old-erasing'])
        expect(
          registry.create({
            slug,
            displayName: slug,
            ownerHumanId: 'alice',
            ...(slug === 'old-tob' && generation !== 150
              ? { workspaces: [join(home, 'botharness/tob-workspaces/old-tob')] }
              : {}),
          }).ok,
        ).toBe(true);
      const legacyWorkspace = join(home, 'botharness/tob-workspaces/old-tob');
      mkdirSync(join(legacyWorkspace, 'notes'), { recursive: true });
      writeFileSync(join(legacyWorkspace, 'notes/kept.txt'), 'Tob file');
      writeFileSync(join(legacyWorkspace, 'report.txt'), 'Tob report');
      symlinkSync('report.txt', join(legacyWorkspace, 'report-link'));
      symlinkSync('not-yet-created', join(legacyWorkspace, 'dangling-link'));
      symlinkSync(join(home, 'spaces/bob/files'), join(legacyWorkspace, 'foreign-link'), 'dir');
      symlinkSync(join(home, 'botharness'), join(legacyWorkspace, 'protected-link'), 'dir');
      const erasingPath = registry.memoryDirFor('old-erasing')!;
      db.transaction((connection) => {
        connection
          .prepare(
            `INSERT INTO workspace_grants (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision) VALUES ('old-tob-grant','old-tob','old-native-tob',?,'Tob','2026-11-15',1,1)`,
          )
          .run(legacyWorkspace);
        connection.prepare('INSERT INTO persona_bot_deletions VALUES (?,?)').run(
          'old-erasing',
          JSON.stringify({
            slug: 'old-erasing',
            displayName: 'Erasing',
            acceptedAt: '2026-11-15',
            memoryDir: erasingPath,
            eraseMemory: true,
            phase: 'cleanup',
            memory: 'pending',
            cleanupAccepted: true,
            ownership: memoryOwnership(erasingPath),
          }),
        );
      });
      rmSync(join(erasingPath, '.git'), { recursive: true });
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
      if (generation > 150) {
        const staged = mountOperationalDatabase({
          dshHome: home,
          schemaPlan: defineSchemaPlan(
            BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= generation),
          ),
        });
        expect(staged.generation).toBe(generation);
        staged.close();
      }
      const f = fixture(home);
      expect(f.core.operationalDatabase.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      f.workspace(ownerNative, 'old-owner-native');
      expect(f.core.grants.requireActive('old-owner', 'old-owner-native').workspacePath).toBe(
        ownerNative,
      );
      expect(f.core.registry.memoryDirFor('old-owner')).toBe(ownerMemory);
      expect(memoryOwnership(ownerMemory)).toEqual(ownerProof);
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
      expect(f.core.tob.slug(alice)).toBeUndefined();
      expect(f.core.tob.isTob('old-tob')).toBe(false);
      expect(await f.bridge(alice).tobHome({})).toEqual({ ok: true, value: { available: false } });
      expect(readFileSync(join(home, 'spaces/alice/files/notes/kept.txt'), 'utf8')).toBe(
        'Tob file',
      );
      const migrated = join(home, 'spaces/alice/files');
      expect(lstatSync(join(migrated, 'report-link')).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(migrated, 'report-link'))).toBe('report.txt');
      expect(readFileSync(join(migrated, 'report-link'), 'utf8')).toBe('Tob report');
      expect(lstatSync(join(migrated, 'dangling-link')).isSymbolicLink()).toBe(true);
      for (const [name, code] of [
        ['foreign-link', 'grant-foreign-space'],
        ['protected-link', 'grant-protected-path'],
      ])
        expect(() => f.core.grants.validatePath?.('old-tob', join(migrated, name!))).toThrowError(
          expect.objectContaining({ code }),
        );
      expect(f.core.registry.get('old-tob')?.workspaces).toEqual(
        generation === 150 ? [] : [join(home, 'spaces/alice/files')],
      );
      expect(f.core.grants.list('old-tob')).toContainEqual(
        expect.objectContaining({ id: 'old-tob-grant', revokedAt: expect.any(String) }),
      );
      expect(f.core.grants.list('old-tob')).toContainEqual(
        expect.objectContaining({
          workspaceId: 'spaces/alice',
          workspacePath: join(home, 'spaces/alice/files'),
          orchestratorWrite: true,
        }),
      );
      expect(existsSync(legacyWorkspace)).toBe(false);
      const reads = f.core.operationalDatabase.diagnostics().metrics.reads;
      relocateTobWorkspaces(f.db, home);
      expect(f.core.operationalDatabase.diagnostics().metrics.reads - reads).toBe(2);
      expect(f.db.read((db) => db.prepare('SELECT * FROM workspace_file_transfers').all())).toEqual(
        [],
      );
      expect(existsSync(erasingPath)).toBe(true);
      expect(await f.core.deletions.retry('old-erasing')).toMatchObject({
        memory: 'erased',
        phase: 'complete',
      });
      expect(existsSync(erasingPath)).toBe(false);

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

  it('transfers account files and former member Tob Memory, retains Owner Tob and shared roots, then purges the empty account', async () => {
    const f = fixture();
    f.createBot();
    const formerTob = f.createBot(alice, 'former-tob');
    const tob = await f.core.tob.ensure(owner);
    const ownerMemory = f.core.registry.memoryDirFor(tob.botSlug);
    const formerMemory = f.core.registry.memoryDirFor(formerTob.slug)!;
    writeFileSync(join(formerMemory, 'kept'), 'former Tob Memory');
    expect(await f.bridge(alice).tobHome({})).toEqual({ ok: true, value: { available: false } });
    const oldMemory = f.core.registry.memoryDirFor('alice-bot')!;
    writeFileSync(join(oldMemory, 'retained'), 'bot memory');
    writeFileSync(join(f.home, 'spaces/alice/report.txt'), 'member file');
    const shared = f.core.spaces.create(owner, 'Shared', { kind: 'everyone' });
    writeFileSync(join(f.core.spaces.path(shared.spaceId), 'shared.txt'), 'shared file');
    const preview = f.core.team.transferPreview(owner, 'alice');
    expect(preview.space?.files.some((file) => file.path === 'report.txt')).toBe(true);
    expect(preview.bots.map((bot) => bot.slug)).toEqual(['alice-bot', 'former-tob']);
    await f.core.team.transfer(owner, 'alice', 'bob');
    const moved = f.core.registry.memoryDirFor('alice-bot')!;
    expect(moved).toBe(accountMemoryPath(f.home, 'bob', 'alice-bot'));
    expect(f.core.registry.get('alice-bot')?.ownerHumanId).toBe('bob');
    expect(readFileSync(join(moved, 'retained'), 'utf8')).toBe('bot memory');
    expect(readFileSync(join(f.home, 'spaces/bob/report.txt'), 'utf8')).toBe('member file');
    expect(f.core.registry.get(tob.botSlug)?.ownerHumanId).toBe(owner.humanId);
    expect(f.core.registry.memoryDirFor(tob.botSlug)).toBe(ownerMemory);
    expect(f.core.registry.get(formerTob.slug)?.ownerHumanId).toBe('bob');
    const transferredTobMemory = accountMemoryPath(f.home, 'bob', formerTob.slug);
    expect(f.core.registry.memoryDirFor(formerTob.slug)).toBe(transferredTobMemory);
    expect(readFileSync(join(transferredTobMemory, 'kept'), 'utf8')).toBe('former Tob Memory');
    await f.core.team.deactivate(owner, 'alice');
    const purge = f.core.team.purgePreview(owner, 'alice');
    f.db.transaction((connection) =>
      connection
        .prepare("INSERT INTO member_credentials VALUES ('alice', 'alice', '{}', '[]', 0)")
        .run(),
    );
    const current = f.core.team.purgePreview(owner, 'alice');
    expect(purge.counts.bots).toBe(0);
    await f.core.team.purgeConfirm(owner, 'alice', current.token, 'alice');
    expect(existsSync(join(f.home, 'spaces/alice'))).toBe(false);
    expect(existsSync(moved)).toBe(true);
    expect(readFileSync(join(transferredTobMemory, 'kept'), 'utf8')).toBe('former Tob Memory');
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

  it('rejects an unsafe native search value before post-execute spill and canonical publication', async () => {
    const f = fixture();
    f.createBot();
    f.createBot(bob);
    const cwd = join(f.home, 'spaces/alice/files');
    const secret = join(f.home, 'spaces/bob/files/secret');
    writeFileSync(secret, 'PRIVATE_MEMORY_SECRET');
    const path = join(cwd, 'hardlink');
    linkSync(secret, path);
    f.core.ownership.claim({
      sessionId: 'pipeline-search',
      botSlug: 'alice-bot',
      rootRole: 'orchestrator',
      at: '2026-11-15',
    });
    const ctx = new Context();
    const provider = ctx.plugin({
      apply(c: Context) {
        c.provide('systemPrompt', { tools: () => () => undefined, section: () => () => undefined });
      },
    });
    await provider.await();
    const runtime = ctx.plugin(ToolRuntime, {});
    await runtime.await();
    await installNativeTools(ctx);
    const spilled = vi.fn();
    const published: unknown[] = [];
    ctx.tools.register(
      defineTool({
        name: 'grep',
        description: 'test native search',
        parameters: {},
        output: {
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              matches: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: { path: { type: 'string' }, line: { type: 'string' } },
                },
              },
            },
          },
          render: () => [{ type: 'text', text: 'PRIVATE_MEMORY_SECRET' }],
        },
        execute: async () => ({ matches: [{ path, line: 'PRIVATE_MEMORY_SECRET' }] }),
      }),
    );
    ctx.on('tools/post-execute', async (_exec, _result, next) => {
      spilled();
      return next();
    });
    ctx.on('tools/result', (_event, result) => {
      published.push(result);
    });
    installNativeSearchResultGuard(ctx, f.core, () => false);
    const agent = { session: { id: 'pipeline-search', header: { cwd } }, ctx } as unknown as Agent;
    try {
      const result = await executeNativeTool(ctx, {
        agent,
        name: 'grep',
        callId: ToolCallId('search'),
        arguments: {},
        signal: new AbortController().signal,
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result)).not.toContain('PRIVATE_MEMORY_SECRET');
      expect(spilled).not.toHaveBeenCalled();
      expect(JSON.stringify(published)).not.toContain('PRIVATE_MEMORY_SECRET');
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('validates every search result before publication without synchronously scanning the project', async () => {
    const f = fixture();
    f.createBot();
    f.createBot(bob);
    const cwd = join(f.home, 'spaces/alice/files');
    const own = join(cwd, 'own');
    writeFileSync(own, 'safe');
    const secret = join(f.home, 'spaces/bob/files/secret');
    writeFileSync(secret, 'secret');
    linkSync(secret, join(cwd, 'hard-secret'));
    f.core.ownership.claim({
      sessionId: 'search',
      botSlug: 'alice-bot',
      rootRole: 'orchestrator',
      at: '2026-11-15',
    });
    const session = { id: 'search', header: { cwd } } as Session;
    const scan = vi.spyOn(f.core.spaces, 'assertTree');
    for (const name of ['glob', 'grep']) {
      expect(nativeFileToolDenial(f.core, session, name, { path: cwd })).toBeUndefined();
      const value =
        name === 'glob'
          ? { paths: [own] }
          : { matches: [{ path: own, lineNumber: 1, line: 'safe' }] };
      await expect(
        assertNativeSearchResult(
          f.core,
          session,
          name,
          { isError: false, value, content: [] },
          new AbortController().signal,
        ),
      ).resolves.toBeUndefined();
      for (const path of [secret, join(cwd, 'hard-secret')]) {
        const unsafe =
          name === 'glob'
            ? { paths: [own, path] }
            : {
                matches: [
                  { path: own, lineNumber: 1, line: 'safe' },
                  { path, lineNumber: 1, line: 'secret' },
                ],
              };
        await expect(
          assertNativeSearchResult(
            f.core,
            session,
            name,
            { isError: false, value: unsafe, content: [] },
            new AbortController().signal,
          ),
        ).rejects.toThrow('grant-foreign-space');
      }
    }
    expect(scan).not.toHaveBeenCalled();
  });

  it('plans a custom Memory under account files exactly once and recovers every move', () => {
    const f = fixture();
    f.createBot();
    const old = f.core.registry.memoryDirFor('alice-bot')!;
    const custom = join(f.home, 'spaces/alice/files/custom');
    renameSync(old, custom);
    f.db.transaction((db) => {
      db.prepare(
        "UPDATE persona_bots SET body = json_set(body, '$.memoryDir', ?) WHERE slug = 'alice-bot'",
      ).run(custom);
      db.prepare("UPDATE persona_bot_memory_ownership SET body = ? WHERE slug = 'alice-bot'").run(
        JSON.stringify(memoryOwnership(custom)),
      );
    });
    writeFileSync(join(f.home, 'spaces/alice/files/report'), 'file');
    const transfer = prepareSpaceTransfer(f.db, f.home, 'alice', 'bob', ['alice-bot']);
    expect(existsSync(accountMemoryPath(f.home, 'bob', 'alice-bot'))).toBe(true);
    expect(existsSync(join(f.home, 'spaces/bob/files/custom'))).toBe(false);
    recoverSpaceTransfers(f.db);
    expect(existsSync(custom)).toBe(true);
    expect(readFileSync(join(f.home, 'spaces/alice/files/report'), 'utf8')).toBe('file');
    expect(transfer).toBeDefined();
  });

  it('omits registered protected roots from Owner pickers while retaining native folders in either mode', async () => {
    const f = fixture();
    f.createBot(owner, 'owner-picker');
    const allowed = f.workspace(createTempRoot('safe-picker-'), 'safe-native');
    f.workspace(join(f.home, 'botharness'), 'host-data-native');
    f.workspace(join(f.home, 'spaces/bob/files'), 'foreign-native');
    f.workspace(f.core.registry.memoryDirFor('owner-picker')!, 'memory-native');
    for (const enabled of [false, true]) {
      f.db.transaction((db) =>
        db.prepare('UPDATE team_settings SET enabled=?').run(Number(enabled)),
      );
      const response = await f.bridge(owner).workspaceOptions({});
      expect(response.ok).toBe(true);
      if (response.ok) {
        expect(response.value.workspaces.map((workspace) => workspace.id)).toContain(allowed);
        expect(response.value.workspaces.map((workspace) => workspace.id)).not.toEqual(
          expect.arrayContaining(['host-data-native']),
        );
        expect(response.value.workspaces.map((workspace) => workspace.id)).not.toEqual(
          expect.arrayContaining(['foreign-native']),
        );
        expect(response.value.workspaces.map((workspace) => workspace.id)).not.toEqual(
          expect.arrayContaining(['memory-native']),
        );
      }
    }
  });

  it.each(['plain', '🌟'])(
    'revokes external-ID grants before a shared slug is reused under %s paths',
    async (name) => {
      const home = join(createTempRoot('m6-revoke-'), name);
      mkdirSync(home);
      const f = fixture(home);
      f.createBot();
      const space = f.core.spaces.create(owner, 'Reused', { kind: 'everyone' });
      const path = join(f.home, space.spaceId, 'files');
      const grant = await f.core.grants.create('alice-bot', f.workspace(path, 'external-shared'));
      f.core.spaces.delete(owner, space.spaceId, true);
      expect(f.core.spaces.create(owner, 'Reused', { kind: 'everyone' }).spaceId).toBe(
        space.spaceId,
      );
      expect(() => f.core.grants.requireActive('alice-bot', grant.id)).toThrow();
      expect(
        f.core.grants.list('alice-bot').find((g) => g.id === grant.id)?.revokedAt,
      ).toBeDefined();
    },
  );

  it('resolves intermediate dangling symlinks before .. and refuses the actual foreign target', () => {
    const f = fixture();
    f.createBot();
    const files = join(f.home, 'spaces/alice/files');
    const safe = join(files, 'safe');
    mkdirSync(safe);
    mkdirSync(join(f.home, 'spaces/bob/subdir'));
    symlinkSync(join(f.home, 'spaces/bob/subdir'), join(safe, 'pivot'));
    symlinkSync('safe/pivot/../new', join(files, 'link'));
    expect(() => f.core.spaces.assertPath('alice-bot', join(files, 'link'))).toThrow(
      'grant-foreign-space',
    );
  });

  it.each([alice, owner])(
    'refuses a $humanId Bot hard link to a protected Host symlink target',
    (human) => {
      const f = fixture();
      const slug = human.humanId + '-bot';
      f.createBot(human, slug);
      const external = createTempRoot('protected-external-');
      const secret = join(external, 'secret');
      writeFileSync(secret, 'secret');
      symlinkSync(external, join(f.home, 'botharness/protected-alias'));
      const link = join(f.home, 'spaces', human.humanId, 'files/alias');
      linkSync(secret, link);
      expect(() => f.core.spaces.assertPath(slug, link)).toThrow('grant-protected-path');
      symlinkSync(external, join(external, 'cycle'));
      expect(() => f.core.spaces.assertPath(slug, link)).toThrow('grant-protected-path');
    },
  );

  it('isolates inaccessible custom Memory while keeping the affected Bot fail-closed', () => {
    const f = fixture();
    f.createBot();
    const custom = createTempRoot('unavailable-memory-');
    const bot = f.core.registry.create({
      slug: 'offline-owner',
      displayName: 'Offline',
      memoryLocation: custom,
    });
    expect(bot.ok).toBe(true);
    const memory = f.core.registry.memoryDirFor('offline-owner')!;
    chmodSync(custom, 0);
    try {
      const file = join(f.home, 'spaces/alice/files/note');
      writeFileSync(file, 'readable');
      expect(() => f.core.spaces.assertPath('alice-bot', file)).not.toThrow();
      expect(() => f.core.spaces.assertPath('offline-owner', memory)).toThrow(
        'grant-protected-path',
      );
    } finally {
      chmodSync(custom, 0o700);
    }
  });

  it.each([false, true])(
    'preserves former Owner legacy Memory and erasure proof after ownership transfer, explicit=%s',
    async (explicit) => {
      const f = fixture();
      f.createBot(owner, 'former-owner');
      const path = f.core.registry.memoryDirFor('former-owner')!;
      if (!explicit)
        f.db.transaction((db) =>
          db
            .prepare(
              "UPDATE persona_bots SET body = json_remove(body, '$.memoryDir') WHERE slug = 'former-owner'",
            )
            .run(),
        );
      const proof = memoryOwnership(path);
      await f.core.team.setOwnerPassword(owner, 'owner-transfer-password');
      const member = await f.core.team.createMember(owner, 'next-owner', 'Next');
      const next = humanContext(member.member.humanId);
      await f.core.team.changePassword(next, member.initialPassword, 'next-password-1', false);
      await f.core.team.transferOwner(owner, next.humanId, 'owner-transfer-password');
      expect(f.core.registry.memoryDirFor('former-owner')).toBe(path);
      expect(memoryOwnership(path)).toEqual(proof);
      expect(f.core.deletions.preview('former-owner').eraseAvailable).toBe(true);
      expect(() => f.core.spaces.assertPath('former-owner', join(path, 'SOUL.md'))).not.toThrow();
      await f.core.team.transfer(next, owner.humanId, 'bob');
      const moved = accountMemoryPath(f.home, 'bob', 'former-owner');
      expect(f.core.registry.memoryDirFor('former-owner')).toBe(moved);
      expect(memoryOwnership(moved)).toEqual({ ...proof, path: moved });
      expect(existsSync(path)).toBe(false);
    },
  );

  it('accepts the native apply_patch input and returns normal attachment denials from both file guards', () => {
    const f = fixture();
    f.createBot();
    f.core.ownership.claim({
      sessionId: 'patch-session',
      botSlug: 'alice-bot',
      rootRole: 'orchestrator',
      at: '2026-11-15',
    });
    const session = {
      id: 'patch-session',
      header: { cwd: f.core.registry.memoryDirFor('alice-bot') },
    } as Session;
    const path = join(f.home, 'spaces/alice/files/file');
    for (const header of ['Add File', 'Update File', 'Delete File', 'Move to'])
      expect(
        nativeFileToolDenial(f.core, session, 'apply_patch', {
          input: `*** Begin Patch\n*** ${header}: ${path}\n*** End Patch`,
        }),
      ).toBeUndefined();
    vi.spyOn(f.core.runtime, 'originalAttachmentRoot').mockImplementation(() => {
      throw new Error('Original attachment requires explicit edit-original access');
    });
    expect(nativeFileToolDenial(f.core, session, 'write', { file_path: path })).toBe(
      'Original attachment requires explicit edit-original access',
    );
    expect(nativeFileSpaceDenial(f.core, session, 'write', { file_path: path })).toBe(
      'Original attachment requires explicit edit-original access',
    );
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
    expect(current.counts.files).toBe(2);
    await f.core.team.purgeConfirm(owner, 'alice', current.token, 'alice');
    expect(accountSpaceFiles(f.home, 'alice')).toEqual([]);
    expect(existsSync(join(f.home, 'spaces/alice'))).toBe(false);
  });
});
