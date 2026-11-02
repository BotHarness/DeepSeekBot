import { describe, expect, it } from 'vitest';

import { MAX_BOT_HOPS } from '../src/channels/channel.js';
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

describe('Bot Group mention tracer', () => {
  it('commits one Bot message, wakes two recipients independently, and keeps the Group reply causal', async () => {
    const home = createTempRoot('botharness-bot-group-');
    let groupId = '';
    const runs: string[] = [];
    let sentId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug + ':' + run.inboundChannelId);
        if (run.bot.slug === 'ada') {
          const first = await run.channels.send({
            channelId: groupId,
            body: '请分别确认',
            mentionBotIds: ['bea', 'cee'],
            deliveryKey: 'one-tool-call',
          });
          const retry = await run.channels.send({
            channelId: groupId,
            body: '请分别确认',
            mentionBotIds: ['bea', 'cee'],
            deliveryKey: 'one-tool-call',
          });
          expect(retry.id).toBe(first.id);
          sentId = first.id;
          return;
        }
        expect(run.message).toContain('Group mention from PersonaBot ada');
        expect(run.message).toContain(groupId);
        if (run.bot.slug === 'cee') throw new Error('Cee unavailable');
        await run.channels.send({ body: 'Bea 已确认', deliveryKey: 'bea-reply' });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Alex' });
      core.registry.create({ slug: 'cee', displayName: 'Alex' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea', 'cee'] });
      groupId = group.id;
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-start',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '请在 Team 群里请两位同事确认',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-start',
        body: '请在 Team 群里请两位同事确认',
      });
      await core.runtime.whenIdle();
      expect(runs.sort()).toEqual(['ada:' + dm.id, 'bea:' + group.id, 'cee:' + group.id]);
      const messages = core.channels.readMessages(group.id);
      const sent = messages.find((message) => message.id === sentId)!;
      const reply = messages.find(
        (message) => message.author.kind === 'bot' && message.author.slug === 'bea',
      )!;
      expect(sent.body).toBe('@Alex @Alex 请分别确认');
      expect(sent.mentions).toEqual([
        { botSlug: 'bea', label: 'Alex', start: 0, end: 5 },
        { botSlug: 'cee', label: 'Alex', start: 6, end: 11 },
      ]);
      expect(sent.deliveries).toEqual([
        { botSlug: 'bea', state: 'handled' },
        { botSlug: 'cee', state: 'retryable' },
      ]);
      expect(reply.body).toBe('Bea 已确认');
      expect(reply.botCausation?.rootSourceEventId).toBe(sent.botCausation?.rootSourceEventId);
      expect(reply.botCausation?.hop).toBe(2);
      const facts = attachOperationalModule(core.operationalDatabase, 'bot-group-test').read(
        (db) => {
          const source = db
            .prepare(
              'SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?',
            )
            .all(group.id, sentId);
          const placements = db
            .prepare(
              'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .all(group.id, sentId);
          const admissions = db
            .prepare(
              'SELECT bot_slug, reason, attempt_state FROM inbox_admissions WHERE source_event_id = (SELECT source_event_id FROM source_events WHERE channel_id = ? AND message_id = ?) ORDER BY bot_slug',
            )
            .all(group.id, sentId);
          return { source, placements, admissions };
        },
      );
      expect(facts.source).toHaveLength(1);
      expect(facts.placements).toHaveLength(1);
      expect(facts.admissions).toEqual([
        { bot_slug: 'bea', reason: 'group-mention', attempt_state: 'handled' },
        { bot_slug: 'cee', reason: 'group-mention', attempt_state: 'retryable' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('rejects unauthorized targets and sender while deduplicating repeated recipients and retries', async () => {
    const home = createTempRoot('botharness-bot-group-boundary-');
    const errors: string[] = [];
    let groupId = '';
    let sentId = '';
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug === 'bea') return;
        if (run.bot.slug === 'cee') {
          try {
            await run.channels.send({
              channelId: groupId,
              body: 'forged sender',
              mentionBotIds: ['bea'],
            });
          } catch (error) {
            errors.push(String(error));
          }
          return;
        }
        for (const target of ['ada', 'cee', 'missing']) {
          try {
            await run.channels.send({
              channelId: groupId,
              body: 'invalid',
              mentionBotIds: [target],
            });
          } catch (error) {
            errors.push(String(error));
          }
        }
        const first = await run.channels.send({
          channelId: groupId,
          body: 'check once',
          mentionBotIds: ['bea', 'bea'],
          deliveryKey: 'dedup-call',
        });
        const retry = await run.channels.send({
          channelId: groupId,
          body: 'check once',
          mentionBotIds: ['bea', 'bea'],
          deliveryKey: 'dedup-call',
        });
        expect(retry.id).toBe(first.id);
        sentId = first.id;
      }),
    });
    try {
      for (const slug of ['ada', 'bea', 'cee'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      groupId = group.id;
      for (const slug of ['ada', 'cee']) {
        const dm = core.channels.getOrCreateDm(slug, slug)!;
        const id = 'start-' + slug;
        await core.channels.appendMessage(dm.id, {
          id,
          at: '2026-09-25T00:00:00.000Z',
          author: { kind: 'human' },
          body: 'test',
        });
        core.runtime.admitDmMessage({ channelId: dm.id, messageId: id, body: 'test' });
      }
      await core.runtime.whenIdle();
      expect(errors).toHaveLength(4);
      expect(errors.some((error) => error.includes('not a member'))).toBe(true);
      const sent = core.channels.message(group.id, sentId)!;
      expect(sent.mentions).toEqual([{ botSlug: 'bea', label: 'BEA', start: 0, end: 4 }]);
      expect(sent.deliveries).toEqual([{ botSlug: 'bea', state: 'handled' }]);
      expect(
        core.channels.readMessages(group.id).filter((message) => message.id === sentId),
      ).toHaveLength(1);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a keyed Group send retryable when append fails before commit', async () => {
    const home = createTempRoot('botharness-bot-group-keyed-retry-');
    let groupId = '';
    let attempts = 0;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') return;
        attempts++;
        await run.channels.send({
          channelId: groupId,
          body: 'Retryable Group handoff',
          mentionBotIds: ['bea'],
          deliveryKey: 'stable-group-send',
        });
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
      groupId = group.id;
      const humanDm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const originalAppend = core.channels.appendMessageOnce.bind(core.channels);
      let failOnce = true;
      core.channels.appendMessageOnce = (channelId, message) => {
        if (channelId === groupId && failOnce) {
          failOnce = false;
          return Promise.reject(new Error('precommit Group append failure'));
        }
        return originalAppend(channelId, message);
      };
      await core.channels.appendMessage(humanDm.id, {
        id: 'human-group-retry',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Ask Bea in the Group',
      });
      core.runtime.admitDmMessage({
        channelId: humanDm.id,
        messageId: 'human-group-retry',
        body: 'Ask Bea in the Group',
      });
      await core.runtime.whenIdle();
      expect(attempts).toBe(1);
      expect(
        attachOperationalModule(core.operationalDatabase, 'bot-group-retry-test').read((db) =>
          db
            .prepare(
              "SELECT attempt_state FROM source_events WHERE message_id = 'human-group-retry'",
            )
            .get(),
        ),
      ).toEqual({ attempt_state: 'retryable' });
      expect(core.channels.readMessages(group.id)).toEqual([]);

      core.runtime.admitDmMessage({
        channelId: humanDm.id,
        messageId: 'human-group-retry',
        body: 'Ask Bea in the Group',
      });
      await core.runtime.whenIdle();
      expect(attempts).toBe(2);
      const messages = core.channels.readMessages(group.id);
      expect(messages).toHaveLength(1);
      expect(messages[0]).toMatchObject({
        body: '@Bea Retryable Group handoff',
        deliveries: [{ botSlug: 'bea', state: 'handled' }],
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('recovers pending Group admissions after restart, wakes every round and suppresses over-limit bot hops', async () => {
    const home = createTempRoot('botharness-bot-group-restart-');
    const first = createCore({ dshHome: home });
    first.registry.create({ slug: 'ada', displayName: 'Ada' });
    first.registry.create({ slug: 'bea', displayName: 'Bea' });
    const group = first.channels.createGroup({ name: 'Recovery', members: ['ada', 'bea'] });
    const root = 'original-root';
    const base = {
      at: '2026-09-25T00:00:00.000Z',
      author: { kind: 'bot' as const, slug: 'ada' },
      body: '@Bea resume',
      mentions: [{ botSlug: 'bea', label: 'Bea', start: 0, end: 4 }],
    };
    expect(
      (
        await first.channels.appendMessageOnce(group.id, {
          ...base,
          id: 'bot-pending',
          botCausation: { rootSourceEventId: root, parentSourceEventId: 'parent', hop: 1 },
        })
      ).status,
    ).toBe('appended');
    await first.runtime.close();
    first.operationalDatabase.close();
    const runs: string[] = [];
    const resumed = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.bot.slug);
      }),
    });
    try {
      await resumed.runtime.whenIdle();
      expect(runs).toEqual(['bea']);
      expect(resumed.channels.message(group.id, 'bot-pending')?.deliveries).toEqual([
        { botSlug: 'bea', state: 'handled' },
      ]);
      await resumed.channels.appendMessageOnce(group.id, {
        ...base,
        id: 'bot-repeat',
        botCausation: { rootSourceEventId: root, parentSourceEventId: 'parent-2', hop: 2 },
      });
      await resumed.channels.appendMessageOnce(group.id, {
        ...base,
        id: 'bot-over-limit',
        botCausation: {
          rootSourceEventId: 'other-root',
          parentSourceEventId: 'parent-3',
          hop: MAX_BOT_HOPS + 1,
        },
      });
      resumed.runtime.admitGroupMessage(group.id, 'bot-repeat');
      resumed.runtime.admitGroupMessage(group.id, 'bot-over-limit');
      await resumed.runtime.whenIdle();
      expect(runs).toEqual(['bea', 'bea']);
      expect(resumed.channels.message(group.id, 'bot-repeat')?.deliveries).toEqual([
        { botSlug: 'bea', state: 'handled' },
      ]);
      expect(resumed.channels.message(group.id, 'bot-over-limit')?.deliveries).toBeUndefined();
      await expect(
        resumed.channels.appendMessageOnce(group.id, {
          ...base,
          id: 'bot-forged',
          author: { kind: 'bot', slug: 'outsider' },
          botCausation: { rootSourceEventId: root, parentSourceEventId: 'parent-4', hop: 1 },
        }),
      ).rejects.toThrow('joined Bot');
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});
