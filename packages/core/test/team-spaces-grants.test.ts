import { alice, bob, cores, fixture } from './team-spaces-fixtures.js';
import { describe, expect, it } from 'vitest';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import type { Session } from '@deepseek-ai/dsh-session';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';
import { nativeFileToolDenial } from '../src/workspaces/grant-native-tools.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { accountMemoryPath } from '../src/workspaces/space-memory.js';
import type { SpaceAudience } from '../src/workspaces/spaces.js';
import { relocateTobWorkspaces } from '../src/workspaces/space-lifecycle.js';

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
    expect(nativeFileToolDenial(f.core, session, 'write', { file_path: file })).toMatch(
      /read-only/,
    );
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
