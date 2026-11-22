import { alice, bob, fixture } from './team-spaces-fixtures.js';
import { Context } from '@deepseek-ai/cordis';
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { installNativeTools, executeNativeTool } from '../src/runtime/native-agent-compat.js';
import { grantToolExecutionDenial } from '../src/workspaces/grant-execution.js';
import { describe, expect, it, vi } from 'vitest';
import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  chmodSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import type { Session } from '@deepseek-ai/dsh-session';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { createTempRoot } from './helpers.js';
import {
  assertNativeSearchResult,
  installNativeSearchResultGuard,
  nativeFileSpaceDenial,
  nativeFileToolDenial,
  nativeExecutionRoot,
} from '../src/workspaces/grant-native-tools.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { accountMemoryPath } from '../src/workspaces/space-memory.js';
import { saveAttachmentFile } from '../src/attachments/file-operations.js';

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
});
