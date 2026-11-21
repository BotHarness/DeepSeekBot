import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { SkillCatalog, MAX_SKILL_INVOCATION_CONTENT } from '../src/skills/catalog.js';
import { createTempRoot } from './helpers.js';
import { adapter, skill, registry, liveView } from './skill-invocation-fixtures.js';

describe('Skill Invocation in a Human DM', () => {
  it.each(['host', 'bot'] as const)(
    'refuses an oversized %s Skill before storing or delivering a message',
    async (kind) => {
      const runs = vi.fn(async (_run: OrchestratorAgentRun) => {});
      const core = createCore({
        dshHome: createTempRoot('botharness-skill-too-large-'),
        agents: adapter(runs),
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const memory = core.registry.memoryDirFor('ada')!;
        const definition = skill(
          'pdf',
          kind === 'host' ? 'user-agents' : 'project-agents',
          join(memory, '.agents/skills/pdf/SKILL.md'),
          'x'.repeat(MAX_SKILL_INVOCATION_CONTENT + 1),
        );
        const catalog = new SkillCatalog({ memoryDirFor: () => memory, viewFor: liveView });
        catalog.attach(
          registry(kind === 'host' ? [definition] : [], new Map([[memory, [definition]]])),
        );
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
        const before = core.channels.readMessages(dm.id);
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        expect(
          await methods.channelSend({
            channelId: dm.id,
            body: '/pdf',
            skillInvocations: [
              {
                name: 'pdf',
                owner: kind === 'host' ? { kind } : { kind, botSlug: 'ada' },
                start: 0,
                end: 4,
              },
            ],
          }),
        ).toMatchObject({
          ok: false,
          error: { code: 'skill-too-large', message: expect.stringMatching(/Skill \/pdf.*64000/u) },
        });
        await core.runtime.whenIdle();
        expect(core.channels.readMessages(dm.id)).toEqual(before);
        expect(runs).not.toHaveBeenCalled();
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it.each(['dm', 'group'] as const)(
    'keeps selected Skill spans and defangs mentions in a %s prompt',
    async (type) => {
      const runs: string[] = [];
      const core = createCore({
        dshHome: createTempRoot('botharness-skill-mention-spans-'),
        agents: adapter(async (run) => {
          runs.push(run.message);
        }),
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        core.registry.create({ slug: 'bob', displayName: 'Bob' });
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(registry([skill('pdf', 'user-agents', '/host/pdf/SKILL.md')], new Map()));
        const channel =
          type === 'dm'
            ? core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!
            : core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
                name: 'Team',
                members: ['ada', 'bob'],
              });
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const cases: [string, string][] = [
          ['/pdf, next @Bob and /pdf', '[/pdf], next \u2060@Bob and /pdf'],
          ['@Bob /pdf, next /pdf', '\u2060@Bob [/pdf], next /pdf'],
          ['/pdf @Bob /pdf, next /pdf', '[/pdf] \u2060@Bob [/pdf], next /pdf'],
        ];
        for (const [body, expected] of cases) {
          const mentionStart = body.indexOf('@Bob');
          const starts = [body.indexOf('/pdf')];
          if (body.startsWith('/pdf @')) starts.push(body.indexOf('/pdf', 4));
          const sent = await methods.channelSend({
            channelId: channel.id,
            body,
            mentions: [
              { botSlug: 'bob', label: 'Bob', start: mentionStart, end: mentionStart + 4 },
            ],
            skillInvocations: starts.map((start) => ({
              name: 'pdf',
              owner: { kind: 'host' },
              start,
              end: start + 4,
            })),
          });
          expect(sent.ok).toBe(true);
          if (!sent.ok) throw new Error(sent.error.message);
          if (type === 'group') core.runtime.admitGroupMessage(channel.id, sent.value.message.id);
          else
            core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
              channelId: channel.id,
              messageId: sent.value.message.id,
              body,
            });
          await core.runtime.whenIdle();
          const delivered = runs.filter((run) =>
            run.includes(`Message ID: ${sent.value.message.id}`),
          );
          expect(delivered.length).toBeGreaterThan(0);
          for (const prompt of delivered) {
            expect(prompt).toContain(expected);
            expect(prompt).toContain('<skill_invocation name="pdf"');
          }
        }
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('shifts Skill snapshots after expanding All Bots and preserves earlier tokens', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-skill-all-bots-'),
      agents: adapter(async () => {}),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob Builder' });
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor: liveView,
      });
      catalog.attach(registry([skill('pdf', 'user-agents', '/host/pdf/SKILL.md')], new Map()));
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Skills',
        members: ['ada', 'bob'],
      });
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      const preview = core.channels.previewAllBotMention(group.id);
      for (const body of ['@All Bots /pdf', '/pdf @All Bots /pdf']) {
        const start = body.indexOf('@All Bots');
        const tokens = [...body.matchAll(/\/pdf/gu)].map((match) => ({
          name: 'pdf',
          owner: { kind: 'host' },
          start: match.index,
          end: match.index + 4,
        }));
        const sent = await methods.channelSend({
          channelId: group.id,
          body,
          allBotMention: { start, end: start + 9, label: 'All Bots', preview },
          skillInvocations: tokens,
        });
        expect(sent.ok).toBe(true);
        if (!sent.ok) throw new Error(sent.error.message);
        const stored = core.channels.message(group.id, sent.value.message.id)!;
        expect(stored.body).toBe(body.replace('@All Bots', '@Ada @Bob Builder'));
        expect(stored.skillInvocations).toHaveLength(tokens.length);
        for (const token of stored.skillInvocations ?? []) {
          expect(stored.body.slice(token.start, token.end)).toBe('/pdf');
          expect(token).toMatchObject({ content: 'Body of pdf', path: '/host/pdf/SKILL.md' });
        }
        if (body.startsWith('/pdf')) expect(stored.skillInvocations?.[0]?.start).toBe(0);
      }
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps Group Skill catalog and sends within each Human readable active Bots', async () => {
    const alice = humanContext('alice');
    const bob = humanContext('bob');
    const core = createCore({
      dshHome: createTempRoot('botharness-skill-team-'),
      agents: adapter(async () => {}),
    });
    try {
      const database = attachOperationalModule(core.operationalDatabase, 'team');
      database.transaction((db) => {
        for (const human of [alice, bob]) {
          db.prepare("INSERT INTO humans VALUES (?, ?, 'active', ?)").run(
            human.humanId,
            human.humanId,
            new Date().toISOString(),
          );
          db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(human.humanId);
        }
        db.prepare('UPDATE team_settings SET enabled = 1').run();
      });
      for (const human of [OWNER_HUMAN_CONTEXT, alice, bob]) {
        core.team.spaces.ensureAccount(human.humanId);
        core.registry.create({
          slug: human === OWNER_HUMAN_CONTEXT ? 'owner-bot' : human.humanId + '-bot',
          displayName: human.humanId,
          ownerHumanId: human.humanId,
        });
      }
      const viewFor = vi.fn(liveView);
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor,
      });
      catalog.attach(
        registry(
          [skill('host', 'user-agents', '/host/SKILL.md')],
          new Map(
            ['alice-bot', 'bob-bot', 'owner-bot'].map((slug) => {
              const memory = core.registry.memoryDirFor(slug)!;
              return [
                memory,
                [skill('pdf', 'project-agents', join(memory, '.agents/skills/pdf/SKILL.md'))],
              ];
            }),
          ),
        ),
      );
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Shared Skills',
        members: ['alice-bot', 'owner-bot', 'bob-bot'],
      });
      core.team.channelAccess.visibilitySet(OWNER_HUMAN_CONTEXT, group.id, { kind: 'public' });
      const methods = (human: typeof alice) =>
        createBridgeMethods(human, { ...core, skills: catalog });
      const send = (human: typeof alice, botSlug: string) =>
        methods(human).channelSend({
          channelId: group.id,
          body: '/pdf',
          skillInvocations: [{ name: 'pdf', owner: { kind: 'bot', botSlug }, start: 0, end: 4 }],
        });
      for (const [human, slug] of [
        [OWNER_HUMAN_CONTEXT, 'owner-bot'],
        [alice, 'alice-bot'],
        [bob, 'bob-bot'],
      ] as const) {
        expect(await methods(human).channelSkillCatalog({ channelId: group.id })).toMatchObject({
          ok: true,
          value: {
            skills: [
              { name: 'pdf', owner: { kind: 'bot', botSlug: slug } },
              { name: 'host', owner: { kind: 'host' } },
            ],
          },
        });
        expect(await send(human, slug)).toMatchObject({
          ok: true,
          value: { message: { skillInvocations: [{ content: 'Body of pdf' }] } },
        });
      }
      const before = core.channels.readMessages(group.id);
      viewFor.mockClear();
      const hidden = await send(bob, 'alice-bot');
      expect(hidden).toEqual({
        ok: false,
        error: { code: 'skill-unavailable', message: 'Skill /pdf is no longer available' },
      });
      expect(await send(bob, 'missing-bot')).toEqual(hidden);
      expect(await send(OWNER_HUMAN_CONTEXT, 'alice-bot')).toEqual(hidden);
      expect(viewFor).not.toHaveBeenCalled();
      expect(core.channels.readMessages(group.id)).toEqual(before);
      expect(
        await methods(bob).channelSend({
          channelId: group.id,
          body: '/host',
          skillInvocations: [{ name: 'host', owner: { kind: 'host' }, start: 0, end: 5 }],
        }),
      ).toMatchObject({ ok: true });
      expect(viewFor.mock.calls.map(([slug]) => slug)).toEqual(['bob-bot']);
      core.registry.setPaused('alice-bot', true);
      viewFor.mockClear();
      expect(await methods(alice).channelSkillCatalog({ channelId: group.id })).toEqual({
        ok: true,
        value: { skills: [] },
      });
      const pausedBefore = core.channels.readMessages(group.id);
      expect(await send(alice, 'alice-bot')).toEqual(hidden);
      expect(
        await methods(alice).channelSend({
          channelId: group.id,
          body: '/host',
          skillInvocations: [{ name: 'host', owner: { kind: 'host' }, start: 0, end: 5 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
      expect(viewFor).not.toHaveBeenCalled();
      expect(core.channels.readMessages(group.id)).toEqual(pausedBefore);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('uses the DM Bot and first eligible Group Bot when resolving Host Skills', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-skill-viewer-'),
      agents: adapter(async () => {}),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      core.registry.setPaused('ada', true);
      const viewFor = vi.fn(liveView);
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor,
      });
      const memory = core.registry.memoryDirFor('ada')!;
      catalog.attach(
        registry(
          [skill('host', 'user-agents', '/host/SKILL.md')],
          new Map([
            [memory, [skill('pdf', 'project-agents', join(memory, '.agents/skills/pdf/SKILL.md'))]],
          ]),
        ),
      );
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada', 'bob'],
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob')!;
      expect(await methods.channelSkillCatalog({ channelId: group.id })).toMatchObject({
        ok: true,
        value: { skills: [{ name: 'host', owner: { kind: 'host' } }] },
      });
      viewFor.mockClear();
      const before = core.channels.readMessages(group.id);
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: '/pdf',
          skillInvocations: [
            { name: 'pdf', owner: { kind: 'bot', botSlug: 'ada' }, start: 0, end: 4 },
          ],
        }),
      ).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
      expect(core.channels.readMessages(group.id)).toEqual(before);
      expect(viewFor).not.toHaveBeenCalled();
      for (const channelId of [group.id, dm.id]) {
        expect(
          await methods.channelSend({
            channelId,
            body: '/host',
            skillInvocations: [{ name: 'host', owner: { kind: 'host' }, start: 0, end: 5 }],
          }),
        ).toMatchObject({ ok: true });
      }
      expect(viewFor.mock.calls.map(([slug]) => slug)).toEqual(['bob', 'bob']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('snapshots the picked Skill and delivers it without a bare /name', async () => {
    const home = createTempRoot('botharness-skill-invocation-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      const memory = core.registry.memoryDirFor('ada')!;
      const skillPath = join(memory, '.agents/skills/summarize-pr/SKILL.md');
      const project = new Map([
        [
          memory,
          [skill('summarize-pr', 'project-agents', skillPath, 'Summarize the PR in 3 bullets.')],
        ],
      ]);
      const catalog = new SkillCatalog({
        viewFor: liveView,
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
      });
      catalog.attach(registry([skill('pdf', 'user-agents', '/home/pdf/SKILL.md')], project));
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });

      expect(await methods.channelSkillCatalog({ channelId: dm.id })).toMatchObject({
        ok: true,
        value: {
          skills: [
            { name: 'summarize-pr', owner: { kind: 'bot', botSlug: 'ada' }, path: skillPath },
            { name: 'pdf', owner: { kind: 'host' } },
          ],
        },
      });

      const body = 'please /summarize-pr #42';
      const start = body.indexOf('/');
      const sent = await methods.channelSend({
        channelId: dm.id,
        body,
        skillInvocations: [
          {
            name: 'summarize-pr',
            owner: { kind: 'bot', botSlug: 'ada' },
            start,
            end: start + '/summarize-pr'.length,
          },
        ],
      });
      expect(sent.ok).toBe(true);
      const message = sent.ok ? sent.value.message : undefined;
      expect(message?.skillInvocations).toEqual([
        {
          name: 'summarize-pr',
          owner: { kind: 'bot', botSlug: 'ada' },
          start,
          end: start + 13,
          path: skillPath,
          content: 'Summarize the PR in 3 bullets.',
        },
      ]);

      project.set(memory, []);
      expect(core.channels.message(dm.id, message!.id)?.skillInvocations?.[0]?.content).toBe(
        'Summarize the PR in 3 bullets.',
      );

      if (runs.length === 0)
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: message!.id,
          body,
        });
      await core.runtime.whenIdle();
      const delivered = runs.find((run) => run.includes('<skill_invocation'));
      expect(delivered).toContain('please [/summarize-pr] #42');
      expect(delivered).toContain(
        `<skill_invocation name="summarize-pr" owner="bot:ada" path="${skillPath}">\nSummarize the PR in 3 bullets.\n</skill_invocation>`,
      );
      expect(delivered).not.toMatch(/(^|\s)\/summarize-pr(?=\s|$)/mu);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('refuses tokens that do not match the body, other Bots and Skills that are gone', async () => {
    const home = createTempRoot('botharness-skill-invocation-refuse-');
    const core = createCore({ dshHome: home, agents: adapter(async () => {}) });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      const catalog = new SkillCatalog({
        viewFor: liveView,
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
      });
      catalog.attach(registry([skill('pdf', 'user-agents', '/home/pdf/SKILL.md')], new Map()));
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      const send = (body: string, token: Record<string, unknown>) =>
        methods.channelSend({ channelId: dm.id, body, skillInvocations: [token] });

      expect(
        await send('/pdf', { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 3 }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await send('/pdf now', {
          name: 'pdf',
          owner: { kind: 'bot', botSlug: 'bob' },
          start: 0,
          end: 4,
        }),
      ).toMatchObject({ ok: false });
      expect(
        await send('/gone now', { name: 'gone', owner: { kind: 'host' }, start: 0, end: 5 }),
      ).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
      expect(
        await send('/pdf now', { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 4 }),
      ).toMatchObject({
        ok: true,
        value: { message: { skillInvocations: [{ name: 'pdf', content: 'Body of pdf' }] } },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
