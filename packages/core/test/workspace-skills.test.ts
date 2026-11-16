import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import type { SkillRegistryDefinition } from '../src/skills/catalog.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { runSkillCommand, skillInvocationTokens } from '../src/bots/cli-skills.js';
import { isSkillInvocationToken } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { SkillCatalog, MAX_SKILL_INVOCATION_CONTENT } from '../src/skills/catalog.js';
import { parseSkillOwnerKey, skillOwnerKey } from '../src/skills/entries.js';
import { watchSkillCatalog } from '../src/skills/refresh.js';
import { readWorkspaceSkills } from '../src/skills/workspace.js';
import { createTempRoot } from './helpers.js';

const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function put(
  root: string,
  name = 'review',
  body = 'Review this project',
  parent = '.agents',
  policy = '',
) {
  const path = join(root, parent, 'skills', name, 'SKILL.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\ndescription: Project ${name}\n${policy}---\n${body}\n`);
  return path;
}

function fixture() {
  const project = createTempRoot('botharness-s5-project-');
  const workspace = {
    id: 'project-id',
    title: 'Project folder',
    path: project,
    status: async () => 'ok' as const,
  };
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  const core = createCore({
    dshHome: createTempRoot('botharness-s5-home-'),
    agents,
    workspaces: () => ({
      get: (id) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    }),
  });
  closes.push(async () => {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bob', displayName: 'Bob' });
  const catalog = new SkillCatalog({
    memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
    grantsFor: (slug) =>
      core.grants.list(slug).flatMap((grant) => {
        try {
          return [core.grants.requireActive(slug, grant.id)];
        } catch {
          return [];
        }
      }),
  });
  const nativeList = vi.fn(async () => []);
  catalog.attach({ list: nativeList, get: async () => undefined });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
  const owner = { kind: 'workspace', workspaceId: workspace.id, name: workspace.title } as const;
  return { project, workspace, core, catalog, methods, owner, runs, nativeList };
}

describe('Workspace Grant Project Skills', () => {
  it('uses stable Workspace identity in owner keys, validation and CLI tokens', () => {
    const owner = {
      kind: 'workspace',
      workspaceId: 'stable-id',
      name: 'Renamable folder',
    } as const;
    expect(skillOwnerKey(owner)).toBe('workspace:stable-id');
    expect(parseSkillOwnerKey('workspace:stable-id')).toEqual({ ...owner, name: 'stable-id' });
    for (const key of ['workspace:', 'workspace:bad\nvalue', 'workspace:with space'])
      expect(parseSkillOwnerKey(key)).toBeUndefined();
    expect(parseSkillOwnerKey('bot:ada')).toEqual({ kind: 'bot', botSlug: 'ada' });
    expect(parseSkillOwnerKey('host')).toEqual({ kind: 'host' });
    const [token] = skillInvocationTokens('/review', ['workspace:stable-id/review']);
    expect(token?.owner).toMatchObject({ kind: 'workspace', workspaceId: 'stable-id' });
    expect(isSkillInvocationToken(token, '/review')).toBe(true);
    expect(
      isSkillInvocationToken(
        { ...token, owner: { kind: 'workspace', workspaceId: '', name: 'Invalid' } },
        '/review',
      ),
    ).toBe(false);
    expect(
      isSkillInvocationToken(
        { ...token, owner: { kind: 'workspace', workspaceId: 'valid' } },
        '/review',
      ),
    ).toBe(false);
  });

  it('reads only the granted subfolder, dedupes across Bots and caches unchanged Workspace reads', async () => {
    const f = fixture();
    mkdirSync(join(f.project, '.git'));
    put(f.project, 'parent');
    const child = join(f.project, 'packages/child');
    mkdirSync(child, { recursive: true });
    f.workspace.path = child;
    put(child, 'local');
    put(child, 'legacy', 'Legacy body', '.dsh');
    put(child, 'hidden', 'Hidden', '.agents', 'user-invocable: false\n');
    put(child, 'model-disabled', 'Human only', '.agents', 'disable-model-invocation: true\n');
    await f.core.grants.create('ada', f.workspace.id);
    await f.core.grants.create('bob', f.workspace.id);
    const entries = await f.catalog.list(['ada', 'bob', 'ada']);
    expect(entries.map((entry) => entry.name)).toEqual(['legacy', 'local', 'model-disabled']);
    expect(entries.every((entry) => skillOwnerKey(entry.owner) === 'workspace:project-id')).toBe(
      true,
    );
    const nativeReads = f.nativeList.mock.calls.length;
    put(child, 'uncached');
    expect(await f.catalog.list(['ada', 'bob'])).toEqual(entries);
    expect(f.nativeList).toHaveBeenCalledTimes(nativeReads);
    f.catalog.invalidateWorkspace(f.workspace.id);
    expect((await f.catalog.list(['ada', 'bob'])).map((entry) => entry.name)).toContain('uncached');
    expect(await f.catalog.list(['ungranted'])).toEqual([]);
  });

  it('matches DSH frontmatter, flat Markdown, duplicate precedence and symlink containment', async () => {
    const root = createTempRoot();
    put(root, 'same', 'agents');
    put(root, 'same', 'dsh', '.dsh');
    const invalid = put(root, 'invalid');
    writeFileSync(invalid, '---\nname: invalid\ndescription: [\n---\ninvalid');
    put(root, 'legacy-policy', 'invalid', '.agents', 'userInvocable: true\n');
    put(root, 'invalid-policy', 'invalid', '.agents', 'user-invocable: maybe\n');
    put(root, 'disabled', 'Hidden', '.agents', 'user-invocable: OFF\n');
    const flat = join(root, '.agents/skills/flat.md');
    writeFileSync(flat, '---\r\nname: flat\r\ndescription: Flat\r\n---\r\n  Flat body \r\n');
    const outside = createTempRoot();
    const outsidePath = put(outside, 'escape');
    symlinkSync(dirname(outsidePath), join(root, '.agents/skills/escape'));
    const skills = await readWorkspaceSkills(root);
    expect(skills.map((skill) => skill.name)).toEqual(['same', 'disabled', 'flat']);
    expect(skills.find((skill) => skill.name === 'same')?.content).toBe('dsh');
    expect(skills.find((skill) => skill.name === 'disabled')?.invocation.userInvocable).toBe(false);
    expect(skills.find((skill) => skill.name === 'flat')?.content).toBe('Flat body');
    const dshRequire = createRequire(
      createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),
    );
    const { FileSystemSkillProvider } = await import(
      pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-skill-filesystem')).href
    );
    const provider: {
      list(options: object): Promise<readonly unknown[]>;
      get(candidate: unknown, options: object): Promise<SkillRegistryDefinition>;
      dispose(): Promise<void>;
    } = new FileSystemSkillProvider(
      { get: () => undefined, logger: { warn: vi.fn() } },
      { signal: new AbortController().signal, invalidate: () => {} },
      {
        includeDefaultRoots: false,
        dshHome: root,
        agentsHome: root,
        watch: false,
        customSkillDirs: [join(root, '.dsh/skills'), join(root, '.agents/skills')],
      },
    );
    try {
      const native = new Map<string, SkillRegistryDefinition>();
      for (const candidate of await provider.list({})) {
        const skill = await provider.get(candidate, {});
        if (!native.has(skill.name)) native.set(skill.name, skill);
      }
      for (const skill of skills)
        expect(native.get(skill.name)).toMatchObject({
          name: skill.name,
          description: skill.description,
          content: skill.content,
          path: skill.path,
          invocation: skill.invocation,
        });
      for (const name of ['invalid', 'legacy-policy', 'invalid-policy'])
        expect(native.has(name)).toBe(false);
    } finally {
      await provider.dispose();
    }
    rmSync(join(root, '.agents'), { recursive: true });
    symlinkSync(join(outside, '.agents'), join(root, '.agents'));
    expect((await readWorkspaceSkills(root)).map((skill) => skill.name)).toEqual(['same']);
  });

  it('snapshots for a mentioned non-granted Bot without routing to the Workspace owner and replays intent after a rename or revoke', async () => {
    const f = fixture();
    const path = put(f.project);
    const grant = await f.core.grants.create('ada', f.workspace.id);
    const group = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Skills',
      members: ['ada', 'bob'],
    });
    for (const slug of group.members)
      f.core.channels.setGroupWakePolicy(
        group.id,
        slug,
        { mode: 'mentions', count: 5, intervalSeconds: 30 },
        { kind: 'human' },
      );
    const request = {
      channelId: group.id,
      messageId: 'human-42360000-0000-4000-8000-000000000001',
      body: '/review @Bob',
      mentions: [{ botSlug: 'bob', label: 'Bob', start: 8, end: 12 }],
      skillInvocations: [
        { name: 'review', owner: { ...f.owner, name: 'Untrusted label' }, start: 0, end: 7 },
      ],
    };
    const sent = await f.methods.channelSend(request);
    if (!sent.ok) throw new Error(sent.error.message);
    expect(sent).toMatchObject({
      ok: true,
      value: {
        message: {
          skillInvocations: [
            { name: 'review', owner: f.owner, path, content: 'Review this project' },
          ],
        },
      },
    });
    const stored = sent.value.message;
    expect(
      await f.core.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, group.id, {
        ...stored,
        skillInvocations: stored.skillInvocations!.map((skill) => ({
          ...skill,
          owner: { ...f.owner, name: 'Renamed after send' },
          content: 'Changed after send',
        })),
      }),
    ).toMatchObject({
      status: 'existing',
      message: { skillInvocations: [{ owner: f.owner, content: 'Review this project' }] },
    });
    expect(
      await f.core.channels.appendMessageOnce(OWNER_HUMAN_CONTEXT, group.id, {
        ...stored,
        skillInvocations: stored.skillInvocations!.map((skill) => ({
          ...skill,
          owner: { ...f.owner, workspaceId: 'different-id' },
        })),
      }),
    ).toMatchObject({ status: 'conflict' });
    await f.core.runtime.whenIdle();
    expect(f.runs.map((run) => run.bot.slug)).toEqual(['bob']);
    expect(f.runs[0]?.message).toContain(
      `<skill_invocation name="review" owner="workspace:project-id" path="${path}">\nReview this project\n</skill_invocation>`,
    );
    f.core.grants.revoke('ada', grant.id);
    rmSync(path);
    expect(
      await f.methods.channelSend({
        ...request,
        skillInvocations: [
          { ...request.skillInvocations[0], owner: { ...f.owner, name: 'Renamed' } },
        ],
      }),
    ).toMatchObject({
      ok: true,
      value: {
        message: {
          id: stored.id,
          body: stored.body,
          mentions: stored.mentions,
          skillInvocations: stored.skillInvocations,
        },
      },
    });
    const rejected = await f.methods.channelSend({
      ...request,
      messageId: 'human-42360000-0000-4000-8000-000000000002',
    });
    expect(rejected).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
    expect(
      f.core.channels.readMessages(group.id).filter((message) => message.author.kind === 'human'),
    ).toHaveLength(1);
  });

  it('refuses ungranted, paused, foreign-DM, hidden and oversized Skills with the existing codes', async () => {
    const f = fixture();
    const ada = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const bob = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob')!;
    put(f.project);
    const send = (channelId = ada.id) =>
      f.methods.channelSend({
        channelId,
        body: '/review',
        skillInvocations: [{ name: 'review', owner: f.owner, start: 0, end: 7 }],
      });
    expect(await send()).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
    await f.core.grants.create('ada', f.workspace.id);
    expect(await send(bob.id)).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
    put(f.project, 'review', 'Hidden', '.agents', 'user-invocable: false\n');
    expect(await send()).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
    put(f.project, 'review', 'x'.repeat(MAX_SKILL_INVOCATION_CONTENT));
    expect(await send()).toMatchObject({ ok: true });
    put(f.project, 'review', 'x'.repeat(MAX_SKILL_INVOCATION_CONTENT + 1));
    expect(await send()).toMatchObject({ ok: false, error: { code: 'skill-too-large' } });
    f.core.registry.setPaused('ada', true);
    expect(await f.methods.channelSkillCatalog({ channelId: ada.id })).toMatchObject({
      ok: true,
      value: { skills: [] },
    });
    const group = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Paused owner',
      members: ['ada', 'bob'],
    });
    expect(await send(group.id)).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
  });

  it.each(['.agents', '.dsh'])(
    'refreshes %s add/modify/delete and Grant create/revoke through affected Channel events',
    async (parent) => {
      const f = fixture();
      const ada = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const bob = f.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob')!;
      const changes = vi.fn<(slugs: string[]) => void>();
      const refresh = watchSkillCatalog({
        catalog: f.catalog,
        bots: () =>
          f.core.registry
            .list()
            .map((bot) => ({ slug: bot.slug, memoryDir: f.core.registry.memoryDirFor(bot.slug)! })),
        changed: (botSlugs) => {
          changes(botSlugs);
          f.core.live.publishSkillCatalogChanged({
            botSlugs,
            channelIds: f.core.channels
              .list()
              .filter((channel) => channel.members.some((slug) => botSlugs.includes(slug)))
              .map((channel) => channel.id),
          });
        },
        diagnostic: () => {},
      });
      const off = f.core.operationalDatabase.subscribe(({ topics }) => {
        if (topics.includes('workspace-grants')) refresh.reconcile();
      });
      closes.push(async () => {
        off();
        refresh.close();
      });
      await f.catalog.list(['ada', 'bob']);
      const reader = f.core.live
        .open(
          OWNER_HUMAN_CONTEXT,
          new Request('http://localhost/api/botharness/stream?scope=roster'),
        )
        .body!.getReader();
      closes.push(async () => {
        await reader.cancel();
      });
      await reader.read();
      const grant = await f.core.grants.create('ada', f.workspace.id);
      expect(changes).toHaveBeenLastCalledWith(['ada']);
      const frame = new TextDecoder().decode((await reader.read()).value);
      expect(frame).toContain('event: skills/catalog-changed');
      expect(frame).toContain(ada.id);
      expect(frame).not.toContain(bob.id);
      for (const body of ['first', 'changed', undefined]) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        changes.mockClear();
        if (body === undefined) rmSync(join(f.project, parent, 'skills/review/SKILL.md'));
        else put(f.project, 'review', body, parent);
        await vi.waitFor(
          () => expect(changes, `${parent}:${body ?? 'delete'}`).toHaveBeenCalledWith(['ada']),
          { timeout: 3000 },
        );
        const entries = (await f.catalog.list(['ada'])).filter(
          (entry) => entry.owner.kind === 'workspace',
        );
        expect(entries).toHaveLength(body === undefined ? 0 : 1);
        if (body !== undefined)
          expect(await f.catalog.resolve('review', f.owner, 'ada')).toMatchObject({
            content: body,
          });
      }
      put(f.project, 'review', 'restored', parent);
      f.catalog.invalidateWorkspace(f.workspace.id);
      expect(await f.catalog.list(['ada'])).toHaveLength(1);
      const moved = createTempRoot('botharness-s5-moved-');
      put(moved, 'review', 'relocated', parent);
      f.workspace.path = moved;
      f.workspace.title = 'Renamed folder';
      attachOperationalModule(f.core.operationalDatabase, 'workspace-grants').transaction(
        (db) => {
          db.prepare(
            'UPDATE workspace_grants SET workspace_path = ?, workspace_title = ? WHERE id = ?',
          ).run(moved, f.workspace.title, grant.id);
        },
        ['workspace-grants'],
      );
      expect(await f.catalog.list(['ada'])).toMatchObject([
        {
          owner: { ...f.owner, name: 'Renamed folder' },
          path: join(moved, parent, 'skills/review/SKILL.md'),
        },
      ]);
      changes.mockClear();
      put(moved, 'review', 'after move', parent);
      await vi.waitFor(() => expect(changes).toHaveBeenCalledWith(['ada']), { timeout: 3000 });
      expect(await f.catalog.resolve('review', f.owner, 'ada')).toMatchObject({
        content: 'after move',
        owner: { ...f.owner, name: 'Renamed folder' },
      });
      f.core.grants.revoke('ada', grant.id);
      expect(changes).toHaveBeenLastCalledWith(['ada']);
      expect(await f.catalog.list(['ada'])).toEqual([]);
      const bobGrant = await f.core.grants.create('bob', f.workspace.id);
      expect(await f.catalog.list(['ada', 'bob'])).toHaveLength(1);
      expect(changes).toHaveBeenLastCalledWith(['bob']);
      const newAdaGrant = await f.core.grants.create('ada', f.workspace.id);
      expect(await f.catalog.list(['ada', 'bob'])).toHaveLength(1);
      f.core.grants.revoke('ada', newAdaGrant.id);
      expect(await f.catalog.list(['ada', 'bob'])).toHaveLength(1);
      f.core.grants.revoke('bob', bobGrant.id);
      expect(await f.catalog.list(['ada', 'bob'])).toEqual([]);
    },
  );

  it('keeps Team mode Workspace Skills within sender-readable active conversation Bots', async () => {
    const f = fixture();
    f.workspace.path = join(
      f.core.team.spaces.ensureAccount(OWNER_HUMAN_CONTEXT.humanId),
      'files',
      'project',
    );
    mkdirSync(f.workspace.path, { recursive: true });
    put(f.workspace.path);
    await f.core.grants.create('ada', f.workspace.id);
    const alice = humanContext('alice');
    const database = attachOperationalModule(f.core.operationalDatabase, 'team');
    database.transaction((db) => {
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)").run(
        alice.humanId,
        'Alice',
        new Date().toISOString(),
      );
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(alice.humanId);
      db.prepare('UPDATE team_settings SET enabled = 1').run();
    });
    f.core.team.spaces.ensureAccount(alice.humanId);
    f.core.registry.create({
      slug: 'alice-bot',
      displayName: 'Alice',
      ownerHumanId: alice.humanId,
    });
    const group = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Shared',
      members: ['ada', 'alice-bot'],
    });
    f.core.team.channelAccess.visibilitySet(OWNER_HUMAN_CONTEXT, group.id, { kind: 'public' });
    f.core.team.channelAccess.join(alice, group.id);
    const aliceRoot = join(f.core.team.spaces.ensureAccount(alice.humanId), 'files');
    put(aliceRoot, 'alice-review');
    await f.core.grants.create('alice-bot', 'spaces/alice');
    const member = createBridgeMethods(alice, { ...f.core, skills: f.catalog });
    expect(await f.methods.channelSkillCatalog({ channelId: group.id })).toMatchObject({
      ok: true,
      value: { skills: [{ name: 'review', owner: f.owner }] },
    });
    expect(await member.channelSkillCatalog({ channelId: group.id })).toMatchObject({
      ok: true,
      value: {
        skills: [
          { name: 'alice-review', owner: { kind: 'workspace', workspaceId: 'spaces/alice' } },
        ],
      },
    });
    expect(
      await member.channelSend({
        channelId: group.id,
        body: '/review',
        skillInvocations: [{ name: 'review', owner: f.owner, start: 0, end: 7 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
    expect(
      await member.channelSend({
        channelId: group.id,
        body: '/alice-review',
        skillInvocations: skillInvocationTokens('/alice-review', [
          'workspace:spaces/alice/alice-review',
        ]),
      }),
    ).toMatchObject({ ok: true });
  });

  it('ranks CLI entries by Workspace display name and stable id', async () => {
    const owner = { kind: 'workspace', workspaceId: 'stable-id', name: 'Project folder' } as const;
    const rpc = vi.fn(async (method: string) =>
      method === 'channelSkillCatalog'
        ? { skills: [{ name: 'review', description: 'Review', owner }] }
        : { bots: [] },
    );
    for (const query of ['project', 'stable-id'])
      expect(
        await runSkillCommand('skills-list', [], { bot: 'ada', query }, async () => rpc),
      ).toMatchObject({ skills: [{ owner }] });
  });
});
