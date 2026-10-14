import { describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

type Script = (run: OrchestratorAgentRun, groupId: string) => Promise<void>;

async function groupScenario(input: {
  bots: { slug: string; displayName: string; member?: boolean; paused?: boolean }[];
  kickoff: string[];
  scripts: Record<string, Script>;
}) {
  const home = createTempRoot('botharness-bot-mention-text-');
  let groupId = '';
  const wakes: { bot: string; message: string }[] = [];
  const errors: string[] = [];
  const core = createCore({
    dshHome: home,
    agents: adapter(async (run) => {
      wakes.push({ bot: run.bot.slug, message: run.message });
      const script = input.scripts[run.bot.slug];
      if (script === undefined) return;
      try {
        await script(run, groupId);
      } catch (error) {
        errors.push(`${run.bot.slug}: ${String(error)}`);
      }
    }),
  });
  try {
    for (const bot of input.bots) {
      core.registry.create({ slug: bot.slug, displayName: bot.displayName });
      if (bot.paused === true) core.registry.setPaused(bot.slug, true);
    }
    const group = core.channels.createGroup({
      name: 'Studio',
      members: input.bots.filter((bot) => bot.member !== false).map((bot) => bot.slug),
    });
    groupId = group.id;
    let body = '';
    const mentions: NonNullable<ChannelMessage['mentions']> = [];
    for (const slug of input.kickoff) {
      const label = input.bots.find((bot) => bot.slug === slug)!.displayName;
      mentions.push({
        botSlug: slug,
        label,
        start: body.length,
        end: body.length + 1 + label.length,
      });
      body += `@${label} `;
    }
    body += '完成后记得 @ 总控汇报';
    await core.channels.appendMessage(group.id, {
      id: 'human-kickoff',
      at: '2026-10-14T00:00:00.000Z',
      author: { kind: 'human' },
      body,
      mentions,
    });
    core.runtime.admitGroupMessage(group.id, 'human-kickoff');
    await core.runtime.whenIdle();
    const timeline = core.channels.readMessages(group.id);
    const admissions = attachOperationalModule(core.operationalDatabase, 'mention-text-test').read(
      (db) =>
        db
          .prepare(
            `SELECT e.message_id, a.bot_slug, a.reason FROM inbox_admissions a
               JOIN source_events e ON e.source_event_id = a.source_event_id
              WHERE e.channel_id = ? ORDER BY e.created_at, a.bot_slug`,
          )
          .all(group.id) as { message_id: string; bot_slug: string; reason: string }[],
    );
    return {
      groupId,
      wakes,
      errors,
      admissions,
      byAuthor: (slug: string) =>
        timeline
          .filter((message) => message.author.kind === 'bot' && message.author.slug === slug)
          .sort((left, right) => (left.channelRevision ?? 0) - (right.channelRevision ?? 0)),
    };
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

const NEXUS = { slug: 'nexus', displayName: '总控 Nexus' };
const ATLAS = { slug: 'atlas', displayName: '叙事 Atlas' };
const AURA = { slug: 'aura', displayName: '美工 Aura' };

function mentionWakes(wakes: { bot: string; message: string }[], bot: string, from: string) {
  return wakes.filter(
    (wake) =>
      wake.bot === bot && wake.message.includes(`direct Group mention from PersonaBot ${from}`),
  );
}

describe('a Bot that writes @Name in a Group message', () => {
  it('turns a leading @DisplayName into a mention badge and wakes that colleague', async () => {
    const result = await groupScenario({
      bots: [NEXUS, ATLAS],
      kickoff: ['atlas'],
      scripts: {
        atlas: async (run, groupId) => {
          await run.channels.send({
            channelId: groupId,
            body: '@总控 Nexus 收到！叙事模块交付后会第一时间汇报。',
          });
        },
      },
    });
    expect(result.errors).toEqual([]);
    const [sent] = result.byAuthor('atlas');
    expect(sent?.body).toBe('@总控 Nexus 收到！叙事模块交付后会第一时间汇报。');
    expect(sent?.mentions).toEqual([{ botSlug: 'nexus', label: '总控 Nexus', start: 0, end: 9 }]);
    expect(mentionWakes(result.wakes, 'nexus', 'atlas')).toHaveLength(1);
    expect(result.admissions).toContainEqual({
      message_id: sent!.id,
      bot_slug: 'nexus',
      reason: 'group-mention',
    });
  });

  it('accepts the invisible word joiner the Bot copies from its own Inbox text', async () => {
    const result = await groupScenario({
      bots: [NEXUS, ATLAS],
      kickoff: ['atlas'],
      scripts: {
        atlas: async (run, groupId) => {
          await run.channels.send({ channelId: groupId, body: '⁠@总控 Nexus 汇报：完成' });
        },
      },
    });
    const [sent] = result.byAuthor('atlas');
    expect(sent?.body).toBe('@总控 Nexus 汇报：完成');
    expect(sent?.mentions?.map((mention) => mention.botSlug)).toEqual(['nexus']);
    expect(mentionWakes(result.wakes, 'nexus', 'atlas')).toHaveLength(1);
  });

  it('moves a mid-sentence @Name to the badge row and keeps the name readable in place', async () => {
    const result = await groupScenario({
      bots: [NEXUS, AURA],
      kickoff: ['aura'],
      scripts: {
        aura: async (run, groupId) => {
          await run.channels.send({ channelId: groupId, body: '设计稿已完成，请@总控 Nexus 验收' });
        },
      },
    });
    const [sent] = result.byAuthor('aura');
    expect(sent?.body).toBe('@总控 Nexus 设计稿已完成，请总控 Nexus 验收');
    expect(sent?.mentions).toEqual([{ botSlug: 'nexus', label: '总控 Nexus', start: 0, end: 9 }]);
    expect(mentionWakes(result.wakes, 'nexus', 'aura')).toHaveLength(1);
  });

  it('matches the name case- and spacing-insensitively and stores the current display name', async () => {
    const result = await groupScenario({
      bots: [
        { slug: 'nexus', displayName: 'Lead Nexus' },
        { slug: 'ray', displayName: 'Ray' },
      ],
      kickoff: ['ray'],
      scripts: {
        ray: async (run, groupId) => {
          await run.channels.send({ channelId: groupId, body: '@lead  nexus done' });
        },
      },
    });
    const [sent] = result.byAuthor('ray');
    expect(sent?.body).toBe('@Lead Nexus done');
    expect(sent?.mentions).toEqual([{ botSlug: 'nexus', label: 'Lead Nexus', start: 0, end: 11 }]);
  });

  it('prefers the longest member name and respects ASCII word boundaries', async () => {
    const result = await groupScenario({
      bots: [
        { slug: 'ray', displayName: 'Ray' },
        { slug: 'raylee', displayName: 'Ray Lee' },
        { slug: 'tess', displayName: 'Tess' },
      ],
      kickoff: ['tess'],
      scripts: {
        tess: async (run, groupId) => {
          await run.channels.send({ channelId: groupId, body: '@Ray Lee please review' });
          await run.channels.send({ channelId: groupId, body: '@Rayman and ops@Ray stay text' });
        },
      },
    });
    const [first, second] = result.byAuthor('tess');
    expect(first?.mentions?.map((mention) => mention.botSlug)).toEqual(['raylee']);
    expect(second?.body).toBe('@Rayman and ops@Ray stay text');
    expect(second?.mentions).toBeUndefined();
    expect(mentionWakes(result.wakes, 'ray', 'tess')).toEqual([]);
  });

  it('leaves its own name, non-members and paused Bots as plain text without waking anyone', async () => {
    const result = await groupScenario({
      bots: [
        ATLAS,
        { slug: 'tess', displayName: '测试 Tess' },
        { slug: 'outsider', displayName: 'Outsider', member: false },
        { slug: 'sleepy', displayName: 'Sleepy', paused: true },
      ],
      kickoff: ['atlas'],
      scripts: {
        atlas: async (run, groupId) => {
          await run.channels.send({
            channelId: groupId,
            body: '@叙事 Atlas 记一下；@Outsider 和 @Sleepy 不在线',
          });
        },
      },
    });
    const [sent] = result.byAuthor('atlas');
    expect(sent?.body).toBe('@叙事 Atlas 记一下；@Outsider 和 @Sleepy 不在线');
    expect(sent?.mentions).toBeUndefined();
    expect(result.wakes.filter((wake) => wake.message.includes('mention from PersonaBot'))).toEqual(
      [],
    );
  });

  it('refuses an @Name shared by two joined Bots and names their IDs for mention_bot_ids', async () => {
    const result = await groupScenario({
      bots: [
        { slug: 'alex-a', displayName: 'Alex' },
        { slug: 'alex-b', displayName: 'Alex' },
        ATLAS,
      ],
      kickoff: ['atlas'],
      scripts: {
        atlas: async (run, groupId) => {
          await run.channels.send({ channelId: groupId, body: '@Alex please check' });
        },
      },
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('alex-a');
    expect(result.errors[0]).toContain('alex-b');
    expect(result.errors[0]).toContain('mention_bot_ids');
    expect(result.byAuthor('atlas')).toEqual([]);
  });

  it('does not double the badge when mention_bot_ids and the body name the same Bot', async () => {
    const result = await groupScenario({
      bots: [NEXUS, ATLAS, AURA],
      kickoff: ['atlas'],
      scripts: {
        atlas: async (run, groupId) => {
          await run.channels.send({
            channelId: groupId,
            body: '@总控 Nexus 汇报，另请 @美工 Aura 配图',
            mentionBotIds: ['nexus'],
          });
        },
      },
    });
    const [sent] = result.byAuthor('atlas');
    expect(sent?.body).toBe('@总控 Nexus @美工 Aura 汇报，另请 美工 Aura 配图');
    expect(sent?.mentions?.map((mention) => mention.botSlug)).toEqual(['nexus', 'aura']);
    expect(mentionWakes(result.wakes, 'nexus', 'atlas')).toHaveLength(1);
    expect(mentionWakes(result.wakes, 'aura', 'atlas')).toHaveLength(1);
  });
});

describe('Bot-to-Bot mention wakes within one Human kickoff', () => {
  it('wakes the coordinator once for each worker that reports back', async () => {
    const report: Script = async (run, groupId) => {
      if (!run.message.includes('from Human')) return;
      await run.channels.send({ channelId: groupId, body: `@总控 Nexus ${run.bot.slug} 已完成` });
    };
    const result = await groupScenario({
      bots: [NEXUS, ATLAS, AURA],
      kickoff: ['atlas', 'aura'],
      scripts: { atlas: report, aura: report },
    });
    expect(result.errors).toEqual([]);
    expect(mentionWakes(result.wakes, 'nexus', 'atlas')).toHaveLength(1);
    expect(mentionWakes(result.wakes, 'nexus', 'aura')).toHaveLength(1);
  });

  it('still wakes a colleague its earlier unmentioned message in the same exchange reached', async () => {
    const result = await groupScenario({
      bots: [NEXUS, ATLAS, AURA],
      kickoff: ['aura'],
      scripts: {
        aura: async (run, groupId) => {
          if (!run.message.includes('from Human')) return;
          await run.channels.send({ channelId: groupId, body: '@叙事 Atlas 配色先给你' });
          await run.channels.send({
            channelId: groupId,
            body: '@叙事 Atlas @总控 Nexus 配色已完成',
          });
        },
      },
    });
    expect(result.errors).toEqual([]);
    const [, report] = result.byAuthor('aura');
    expect(report?.mentions?.map((mention) => mention.botSlug)).toEqual(['atlas', 'nexus']);
    expect(result.admissions).toContainEqual({
      message_id: report!.id,
      bot_slug: 'nexus',
      reason: 'group-mention',
    });
    expect(
      result.admissions.filter(
        (admission) => admission.bot_slug === 'atlas' && admission.reason === 'group-mention',
      ),
    ).toHaveLength(1);
  });

  it('still stops two Bots that keep mentioning each other', async () => {
    const pingPong =
      (other: string): Script =>
      async (run, groupId) => {
        await run.channels.send({ channelId: groupId, body: `@${other} 你先` });
      };
    const result = await groupScenario({
      bots: [
        { slug: 'ping', displayName: 'Ping' },
        { slug: 'pong', displayName: 'Pong' },
      ],
      kickoff: ['ping'],
      scripts: { ping: pingPong('Pong'), pong: pingPong('Ping') },
    });
    expect(result.wakes.map((wake) => wake.bot)).toEqual(['ping', 'pong', 'ping']);
    expect(result.byAuthor('ping')).toHaveLength(2);
    expect(result.byAuthor('pong')).toHaveLength(1);
  });
});
