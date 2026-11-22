import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { parseImCommand } from '../src/messaging/im-commands.js';
import { skillInvocationTokens } from '../src/bots/cli-skills.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { SkillCatalog, MAX_SKILL_INVOCATION_CONTENT } from '../src/skills/catalog.js';
import { createTempRoot } from './helpers.js';
import { adapter, skill, registry, liveView } from './skill-invocation-fixtures.js';

describe('Skill Invocation in a Group Channel', () => {
  async function withMultiGroupHarvest(
    delivery: 'digest' | 'pending-context',
    budget: number,
    check: (fixture: {
      core: ReturnType<typeof createCore>;
      run: OrchestratorAgentRun;
      rows: { channelId: string; messageId: string; content: string }[];
    }) => Promise<void>,
  ): Promise<void> {
    let releaseInitial = (): void => undefined;
    let releaseHarvest = (): void => undefined;
    let markInitial = (): void => undefined;
    let markHarvest = (_run: OrchestratorAgentRun): void => undefined;
    const initialStarted = new Promise<void>((resolve) => {
      markInitial = resolve;
    });
    const harvestStarted = new Promise<OrchestratorAgentRun>((resolve) => {
      markHarvest = resolve;
    });
    const initialGate = new Promise<void>((resolve) => {
      releaseInitial = resolve;
    });
    const harvestGate = new Promise<void>((resolve) => {
      releaseHarvest = resolve;
    });
    let calls = 0;
    const core = createCore({
      dshHome: createTempRoot('botharness-multi-group-skill-'),
      agents: adapter(async (run) => {
        if (calls++ === 0) {
          markInitial();
          await initialGate;
        } else {
          markHarvest(run);
          await harvestGate;
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.setPromptSettings('ada', { limits: { 'group-context-chars': budget } });
      const groups = ['A', 'B', 'C'].map((name) =>
        core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name, members: ['ada'] }),
      );
      for (const group of groups)
        core.channels.setGroupWakePolicy(
          group.id,
          'ada',
          { mode: delivery === 'digest' ? 'digest' : 'mentions', count: 1, intervalSeconds: 30 },
          { kind: 'human' },
        );
      const content = 'Immutable Skill snapshot\n' + 'x'.repeat(16_000);
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor: liveView,
      });
      catalog.attach(
        registry([skill('review', 'user-agents', '/host/review/SKILL.md', content)], new Map()),
      );
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      expect(await methods.channelSend({ channelId: dm.id, body: 'Hold this turn' })).toMatchObject(
        { ok: true },
      );
      await initialStarted;
      const rows: { channelId: string; messageId: string; content: string }[] = [];
      for (const group of groups) {
        const sent = await methods.channelSend({
          channelId: group.id,
          body: '/review',
          skillInvocations: [{ name: 'review', owner: { kind: 'host' }, start: 0, end: 7 }],
        });
        if (!sent.ok) throw new Error(sent.error.message);
        rows.push({ channelId: group.id, messageId: sent.value.message.id, content });
        if (delivery === 'pending-context')
          expect(
            await methods.channelSend({
              channelId: group.id,
              body: '@Ada check context',
              mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
            }),
          ).toMatchObject({ ok: true });
      }
      releaseInitial();
      const run = await harvestStarted;
      await check({ core, run, rows });
    } finally {
      releaseInitial();
      releaseHarvest();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  }

  it.each(['digest', 'pending-context'] as const)(
    'recovers a cross-Channel Skill snapshot from the %s pointer through every content page',
    async (delivery) =>
      withMultiGroupHarvest(delivery, 24_000, async ({ run, rows }) => {
        const row = rows[1]!;
        expect(run.inboundChannelId).not.toBe(row.channelId);
        expect(run.message).toContain(
          `channel_id ${row.channelId} and message_id ${row.messageId}`,
        );
        expect(run.message).toContain('content_cursor');
        expect(run.message).toContain('keep both channel_id and message_id');
        expect(() => run.channels.readModel({ messageId: row.messageId })).toThrow(
          'message not found',
        );
        let recovered = '';
        let contentCursor: string | undefined;
        let pages = 0;
        do {
          const chunk = JSON.parse(
            run.channels.readModel({
              channelId: row.channelId,
              messageId: row.messageId,
              ...(contentCursor === undefined ? {} : { contentCursor }),
            }),
          );
          recovered += chunk.content;
          contentCursor = chunk.contentCursor;
          pages++;
        } while (contentCursor !== undefined);
        expect(pages).toBeGreaterThan(1);
        expect(JSON.parse(recovered).message.skillInvocations[0].content).toBe(row.content);
      }),
  );

  it.each(['digest', 'pending-context'] as const)(
    'allows only one oversized row across Channels in a %s harvest and leaves omitted admissions pending',
    async (delivery) =>
      withMultiGroupHarvest(delivery, 2_000, async ({ core, run, rows }) => {
        const rendered = rows.filter((row) => run.message.includes(`- Message ${row.messageId} `));
        expect(rendered).toEqual([rows[0]]);
        expect(run.message.match(/<skill_invocation /gu)).toHaveLength(1);
        const admissions = attachOperationalModule(
          core.operationalDatabase,
          'multi-group-budget',
        ).read((db) =>
          db
            .prepare(
              `SELECT e.message_id, a.attempt_state, a.observed_at FROM inbox_admissions a
         JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = 'ada' AND a.reason = 'group-ordinary' ORDER BY e.rowid`,
            )
            .all(),
        );
        expect(admissions).toEqual(
          rows.map((row, index) => ({
            message_id: row.messageId,
            attempt_state: index === 0 ? 'running' : 'pending',
            observed_at: index === 0 ? expect.any(String) : null,
          })),
        );
      }),
  );
  it.each([
    { delivery: 'digest', budget: 24_000 },
    { delivery: 'pending-context', budget: 24_000 },
    { delivery: 'digest', budget: 2_000 },
    { delivery: 'pending-context', budget: 2_000 },
  ])(
    'delivers an oversized Skill snapshot and later ordinary rows in $delivery with budget $budget',
    async ({ delivery, budget }) => {
      const runs: OrchestratorAgentRun[] = [];
      const core = createCore({
        dshHome: createTempRoot('botharness-group-skill-budget-'),
        agents: adapter(async (run) => {
          runs.push(run);
        }),
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        core.registry.setPromptSettings('ada', { limits: { 'group-context-chars': budget } });
        const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
          name: 'Team',
          members: ['ada'],
        });
        core.channels.setGroupWakePolicy(
          group.id,
          'ada',
          { mode: delivery === 'digest' ? 'digest' : 'mentions', count: 2, intervalSeconds: 30 },
          { kind: 'human' },
        );
        const content = 'Skill snapshot prefix\n' + 'x'.repeat(MAX_SKILL_INVOCATION_CONTENT - 22);
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(
          registry([skill('review', 'user-agents', '/host/review/SKILL.md', content)], new Map()),
        );
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const sent = await methods.channelSend({
          channelId: group.id,
          body: '/review',
          skillInvocations: [{ name: 'review', owner: { kind: 'host' }, start: 0, end: 7 }],
        });
        if (!sent.ok) throw new Error(sent.error.message);
        const later = await methods.channelSend({
          channelId: group.id,
          body: 'Later ordinary row',
        });
        if (!later.ok) throw new Error(later.error.message);
        const ordinaryIds = [sent.value.message.id, later.value.message.id];
        if (delivery === 'pending-context') {
          expect(runs).toEqual([]);
          expect(
            await methods.channelSend({
              channelId: group.id,
              body: '@Ada check context',
              mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
            }),
          ).toMatchObject({ ok: true });
        }
        await core.runtime.whenIdle();
        if (delivery === 'digest' && budget === 2_000) {
          const wake = await methods.channelSend({
            channelId: group.id,
            body: 'Wake remaining digest',
          });
          if (!wake.ok) throw new Error(wake.error.message);
          ordinaryIds.push(wake.value.message.id);
          await core.runtime.whenIdle();
        }
        if (delivery === 'pending-context' && budget === 2_000) {
          expect(
            await methods.channelSend({
              channelId: group.id,
              body: '@Ada check remaining context',
              mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
            }),
          ).toMatchObject({ ok: true });
          await core.runtime.whenIdle();
        }
        expect(runs.length).toBeGreaterThan(0);
        const prompt = runs.map((run) => run.message).join('\n');
        expect(prompt).toContain(
          delivery === 'digest'
            ? '[Bot Inbox: Group digest]'
            : '[Bot Inbox: pending Group context]',
        );
        for (const id of ordinaryIds) expect(prompt.split(`- Message ${id} `)).toHaveLength(2);
        expect(prompt).toMatch(
          /<skill_invocation[^>]*>\nSkill snapshot prefix[\s\S]*Full Skill text is truncated here[\s\S]*channel_read[\s\S]*<\/skill_invocation>/u,
        );
        for (const run of runs) expect(run.message.length).toBeLessThan(24_000);
        expect(prompt).not.toContain(content);
        expect(
          core.channels.message(group.id, sent.value.message.id)?.skillInvocations?.[0]?.content,
        ).toBe(content);
        const admissions = attachOperationalModule(core.operationalDatabase, 'skill-budget').read(
          (db) =>
            db
              .prepare(
                `SELECT e.message_id, a.attempt_state, a.observed_at FROM inbox_admissions a
           JOIN source_events e ON e.source_event_id = a.source_event_id
           WHERE a.bot_slug = 'ada' AND a.reason = 'group-ordinary' ORDER BY e.rowid`,
              )
              .all(),
        );
        expect(admissions).toEqual(
          ordinaryIds.map((message_id) => ({
            message_id,
            attempt_state: 'handled',
            observed_at: expect.any(String),
          })),
        );
        let recovered = '';
        let contentCursor: string | undefined;
        do {
          const chunk = JSON.parse(
            runs[0]!.channels.readModel({
              channelId: group.id,
              messageId: sent.value.message.id,
              ...(contentCursor === undefined ? {} : { contentCursor }),
            }),
          );
          recovered += chunk.content;
          contentCursor = chunk.contentCursor;
        } while (contentCursor !== undefined);
        expect(JSON.parse(recovered).message.skillInvocations[0].content).toBe(content);
      } finally {
        core.externalMessaging.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('includes the full Human Skill snapshot when steering an active Group mention', async () => {
    let markStarted = (): void => undefined;
    let releaseTurn = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseTurn = resolve;
    });
    const steer = vi.fn((_slug: string, _text: string) => true);
    const core = createCore({
      dshHome: createTempRoot('botharness-group-skill-steer-'),
      agents: {
        ...adapter(async () => {
          markStarted();
          await released;
        }),
        steerOrchestrator: steer,
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.sourcePolicy.setImmediateDelivery('ada', 'group-mention', 'steer', { kind: 'human' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada'],
      });
      const content = 'Full steered snapshot\n' + 'x'.repeat(60_000);
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor: liveView,
      });
      catalog.attach(
        registry([skill('review', 'user-agents', '/host/review/SKILL.md', content)], new Map()),
      );
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: '@Ada start',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        }),
      ).toMatchObject({ ok: true });
      await started;
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: '/review @Ada',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 8, end: 12 }],
          skillInvocations: [{ name: 'review', owner: { kind: 'host' }, start: 0, end: 7 }],
        }),
      ).toMatchObject({ ok: true });
      expect(steer).toHaveBeenCalledTimes(1);
      expect(steer).toHaveBeenCalledWith(
        'ada',
        expect.stringContaining('[/review]'),
        expect.any(Function),
      );
      expect(steer.mock.calls[0]?.[1]).toContain(
        `<skill_invocation name="review" owner="host" path="/host/review/SKILL.md">\n${content}\n</skill_invocation>`,
      );
    } finally {
      releaseTurn();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it.each(['mention-b', 'ordinary-b', 'mentions-only', 'pending-context'] as const)(
    'keeps the Skill owner independent from routing: %s',
    async (routing) => {
      const runs: OrchestratorAgentRun[] = [];
      const core = createCore({
        dshHome: createTempRoot('botharness-group-skill-'),
        agents: adapter(async (run) => {
          runs.push(run);
        }),
      });
      try {
        core.registry.create({ slug: 'a', displayName: 'Alice' });
        core.registry.create({ slug: 'b', displayName: 'Bob' });
        const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
          name: 'Team',
          members: ['a', 'b'],
        });
        for (const slug of group.members)
          core.channels.setGroupWakePolicy(
            group.id,
            slug,
            {
              mode: routing === 'ordinary-b' && slug === 'b' ? 'all' : 'mentions',
              count: 5,
              intervalSeconds: 30,
            },
            { kind: 'human' },
          );
        const memory = core.registry.memoryDirFor('a')!;
        const path = join(memory, '.agents/skills/review/SKILL.md');
        const content = 'Use this exact snapshot from Alice.'.repeat(
          routing === 'mention-b' ? 1_600 : 40,
        );
        const definitions = [skill('review', 'project-agents', path, content)];
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(
          registry(
            [skill('pdf', 'user-agents', '/host/pdf/SKILL.md')],
            new Map([
              [memory, definitions],
              [
                core.registry.memoryDirFor('b')!,
                [
                  skill(
                    'notes',
                    'project-agents',
                    join(core.registry.memoryDirFor('b')!, '.agents/skills/notes/SKILL.md'),
                  ),
                ],
              ],
            ]),
          ),
        );
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const listed = await methods.channelSkillCatalog({ channelId: group.id });
        expect(listed).toMatchObject({
          ok: true,
          value: {
            skills: [
              { name: 'review', owner: { kind: 'bot', botSlug: 'a' } },
              { name: 'notes', owner: { kind: 'bot', botSlug: 'b' } },
              { name: 'pdf', owner: { kind: 'host' } },
            ],
          },
        });
        const body = routing === 'mention-b' ? '/review @Bob' : '/review';
        const sent = await methods.channelSend({
          channelId: group.id,
          body,
          ...(routing === 'mention-b'
            ? { mentions: [{ botSlug: 'b', label: 'Bob', start: 8, end: 12 }] }
            : {}),
          skillInvocations: [
            { name: 'review', owner: { kind: 'bot', botSlug: 'a' }, start: 0, end: 7 },
          ],
        });
        expect(sent.ok).toBe(true);
        if (!sent.ok) throw new Error(sent.error.message);
        definitions.splice(0);
        await core.runtime.whenIdle();
        if (routing === 'pending-context') {
          expect(runs).toEqual([]);
          expect(
            await methods.channelSend({
              channelId: group.id,
              body: '@Bob check pending context',
              mentions: [{ botSlug: 'b', label: 'Bob', start: 0, end: 4 }],
            }),
          ).toMatchObject({ ok: true });
          await core.runtime.whenIdle();
        }
        expect(runs.map((run) => run.bot.slug)).toEqual(routing === 'mentions-only' ? [] : ['b']);
        const stored = core.channels.message(group.id, sent.value.message.id)!;
        expect(stored.skillInvocations).toEqual([
          { name: 'review', owner: { kind: 'bot', botSlug: 'a' }, start: 0, end: 7, path, content },
        ]);
        if (routing !== 'mentions-only') {
          expect(runs[0]?.message).toContain('[/review]');
          expect(runs[0]?.message).toContain(
            `<skill_invocation name="review" owner="bot:a" path="${path}">\n${content}\n</skill_invocation>`,
          );
        }
      } finally {
        core.externalMessaging.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it.each(['discord', 'feishu'] as const)(
    'mirrors the persisted Human body through %s as plain /name without snapshot metadata',
    async (platform) => {
      const core = createCore({ dshHome: createTempRoot('botharness-skill-im-') });
      try {
        core.registry.create({ slug: 'a', displayName: 'Alice' });
        const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
          name: 'Team',
          members: ['a'],
        });
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(
          registry(
            [skill('pdf', 'user-agents', '/host/pdf/SKILL.md', 'PRIVATE_SNAPSHOT_CONTENT')],
            new Map(),
          ),
        );
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const sent = await methods.channelSend({
          channelId: group.id,
          body: 'please /pdf now',
          skillInvocations: [{ name: 'pdf', owner: { kind: 'host' }, start: 7, end: 11 }],
        });
        if (!sent.ok) throw new Error(sent.error.message);
        const message = core.channels.message(group.id, sent.value.message.id)!;
        expect(message.skillInvocations?.[0]?.content).toBe('PRIVATE_SNAPSHOT_CONTENT');
        const sendChecked = vi.fn<DshImOutboundService['sendChecked']>(async () => ({
          sent: true,
        }));
        const fingerprint = 'a'.repeat(64);
        const service: DshImOutboundService = {
          contractVersion: 1,
          listBots: async () => [{ botId: 'app', channel: platform }],
          listTargets: async () => [{ targetId: 'team', kind: 'group', route: { chatId: 'team' } }],
          describeBot: async () => ({
            version: 1,
            botId: 'app',
            channel: platform,
            connected: true,
            account: { fingerprint },
            capabilities: ['proactive-text-checked'],
          }),
          sendChecked,
        };
        const provider = createDshImProvider(service, platform)!;
        core.externalMessaging.register(provider);
        const target = (await core.externalMessaging.targets(provider.id, 'app'))[0]!;
        const grant = await core.externalMessaging.authorize({
          botSlug: 'a',
          providerId: provider.id,
          accountRef: 'app',
          targetRef: target.ref,
          fingerprint,
          targetDigest: target.digest,
        });
        const mirrored = await core.externalMessaging.send('a', grant.id, message.id, message.body);
        expect(mirrored.state).toBe('provider-accepted');
        expect(sendChecked).toHaveBeenCalledTimes(1);
        const text = sendChecked.mock.calls[0]?.[2];
        expect(text).toBe('please /pdf now');
        expect(text).not.toMatch(/\[\/pdf\]|<|>|PRIVATE_SNAPSHOT_CONTENT/u);
        expect(sendChecked.mock.calls[0]?.[3].format).toBe('plain');
      } finally {
        core.externalMessaging.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('keeps a same-named bare IM command reserved without turning bare Channel text into a Skill', async () => {
    expect(parseImCommand('/status')).toMatchObject({ name: 'status' });
    expect(skillInvocationTokens('/status', undefined)).toEqual([]);
    const core = createCore({ dshHome: createTempRoot('botharness-skill-command-') });
    try {
      core.registry.create({ slug: 'a', displayName: 'Alice' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['a'],
      });
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor: liveView,
      });
      catalog.attach(
        registry([skill('status', 'user-agents', '/host/status/SKILL.md')], new Map()),
      );
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      expect(await methods.channelSkillCatalog({ channelId: group.id })).toMatchObject({
        ok: true,
        value: { skills: [{ name: 'status' }] },
      });
      expect(await methods.channelSend({ channelId: group.id, body: '/status' })).toMatchObject({
        ok: true,
        value: { message: { body: '/status' } },
      });
      expect(core.channels.readMessages(group.id)[0]?.skillInvocations).toBeUndefined();
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: '/status',
          skillInvocations: [{ name: 'status', owner: { kind: 'host' }, start: 0, end: 7 }],
        }),
      ).toMatchObject({ ok: true, value: { message: { skillInvocations: [{ name: 'status' }] } } });
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
