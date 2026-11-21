import { fixture } from './group-send-review-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';

it('revoking the initiating Group stops cross-Channel continuation but not a later independent DM', async () => {
  const outcomes: unknown[] = [];
  let groupId = '';
  const core = createCore({
    dshHome: createTempRoot('review-revocation-'),
    agents: {
      async runOrchestrator(run: OrchestratorAgentRun) {
        if (run.inboundChannelId === groupId) {
          core.channels.removeGroupMember(groupId, 'ada');
          for (const channelId of [groupId, 'dm-ada']) {
            try {
              await run.channels.send({ channelId, body: 'Unsolicited fallback' });
            } catch (error) {
              outcomes.push(error);
            }
          }
        } else await run.channels.send({ body: 'Independent DM answered' });
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected assignment');
      },
      async close() {},
    },
  });
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.registry.create({ slug: 'bob', displayName: 'Bob' });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Review',
      members: ['ada', 'bob'],
    });
    groupId = group.id;
    core.runtime.groupSendReview!.configure(groupId, true);
    core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, groupId, {
      id: 'request',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '@Ada Send here',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    });
    core.runtime.admitGroupMessage(groupId, 'request');
    await core.runtime.whenIdle();
    expect(outcomes).toHaveLength(2);
    for (const error of outcomes)
      expect(error).toMatchObject({ code: 'group-reply-source-revoked' });
    expect(core.channels.readMessages('dm-ada')).toHaveLength(0);
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', {
      id: 'new-dm',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'New independent request',
    });
    const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: 'dm-ada',
      messageId: 'new-dm',
      body: 'New independent request',
    });
    if (admission.admitted) await admission.settled;
    expect(
      core.channels.readMessages('dm-ada').some((m) => m.body === 'Independent DM answered'),
    ).toBe(true);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

describe('Group send review through the same direct model tools', () => {
  it('offers the latest context without a prior observation and permits a corrected recheck in a long Group', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      for (let i = 0; i < 40; i++) await human(`history-${i}`, `Earlier message ${i}`);
      await human('latest-correction', 'Correction: meet at 11:00, not 10:00');
      const held = await tool('bot_send_message', { body: 'Confirmed 10:00' });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toHaveLength(20);
      expect(held.changedMessageIds).toContain('latest-correction');
      expect(held.changedMessageIds).not.toContain('history-0');
      expect(held.review!.content).toContain('Correction: meet at 11:00');
      const sent = await tool('bot_send_message', {
        body: 'Confirmed 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Confirmed 11:00');
      expect(
        core.runtime.groupSendReview!.inspect('direct:ada', channelId, held.draftId!),
      ).toMatchObject({
        state: 'committed',
        committed: { messageId: sent.messageId },
        original: { body: '' },
        current: { body: '' },
      });
      const retry = await tool('bot_send_message', {
        body: 'Duplicate 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(retry.status).toBe('refused');
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('holds an obsolete answer without a public message, then commits a revision from actual new content', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Meet at 10:00');
      const read = await tool('channel_read', {});
      await human('correction', 'Correction: meet at 11:00');
      const held = await tool('bot_send_message', {
        body: 'Confirmed 10:00',
        observation_id: read.observationIds[channelId],
      });
      expect(held.status).toBe('held');
      expect(held.changedMessageIds).toContain('correction');
      expect(core.channels.readMessages(channelId).map((m) => m.id)).toEqual(['correction', 'old']);
      expect(held.review?.complete).toBe(true);
      expect(held.review?.observedMessageIds).toEqual(['correction']);
      expect(
        JSON.parse(held.review!.content).messages.map(
          (view: { message: { body: string } }) => view.message.body,
        ),
      ).toEqual(['Correction: meet at 11:00']);
      const sent = await tool('bot_send_message', {
        body: 'Confirmed 11:00',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Confirmed 11:00');
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(1);
    });
  });

  it('rechecks an unchanged body from the held delta without a separate read or a silent basis upgrade', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('question', 'Please answer');
      const read = await tool('channel_read', {});
      await human('aside', 'Coffee is ready');
      const held = await tool('bot_send_message', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      expect(held.review?.complete).toBe(true);
      const sent = await tool('bot_send_message', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(sent.status).toBe('committed');
      expect(core.channels.message(channelId, sent.messageId)?.body).toBe('Answer');
      const stale = await tool('bot_send_message', {
        body: 'Another answer',
        observation_id: read.observationIds[channelId],
      });
      expect(stale.status).toBe('held');
    });
  });

  it('does not let a held delta cover a later correction or another owner', async () => {
    await fixture(async ({ channelId, human, tool }) => {
      await human('question', 'Meet at 10');
      const read = await tool('channel_read', {});
      await human('aside', 'Coffee');
      const held = await tool('bot_send_message', {
        body: 'Meet at 10',
        observation_id: read.observationIds[channelId],
      });
      await human('correction', 'Instead meet at 11');
      const recheck = await tool('bot_send_message', {
        body: 'Meet at 10',
        draft_id: held.draftId,
        observation_id: held.review!.observationId,
      });
      expect(recheck.status).toBe('held');
      expect(recheck.changedMessageIds).toContain('correction');
      const other = await tool(
        'bot_send_message',
        { body: 'Meet at 10', observation_id: held.review!.observationId },
        'bob',
      );
      expect(other.status).toBe('held');
    });
  });

  it('allows an unchanged recheck for unrelated chatter, but bounds repeated changes and preserves Inbox responsibility on drop', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Please answer');
      const read = await tool('channel_read', {});
      await human('aside', 'Unrelated: coffee');
      const held = await tool('bot_send_message', {
        body: 'Answer',
        observation_id: read.observationIds[channelId],
      });
      const fresh = await tool('channel_read', {});
      await human('again', 'Another change');
      const stopped = await tool('bot_send_message', {
        body: 'Answer',
        draft_id: held.draftId,
        observation_id: fresh.observationIds[channelId],
      });
      expect(stopped.status).toBe('held');
      const newest = await tool('channel_read', {});
      await human('third-change', 'One more unrelated change');
      expect(
        (
          await tool('bot_send_message', {
            body: 'Answer',
            draft_id: held.draftId,
            observation_id: newest.observationIds[channelId],
          })
        ).status,
      ).toBe('requires-review');
      expect(
        (await tool('bot_send_message', { body: '', action: 'drop', draft_id: held.draftId }))
          .status,
      ).toBe('dropped');
      const unresolved = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
        db
          .prepare(
            "SELECT COUNT(*) AS count FROM inbox_admissions WHERE bot_slug = 'ada' AND resolution IS NULL",
          )
          .get(),
      );
      expect(Number(unresolved?.count)).toBeGreaterThan(0);
      expect(core.channels.readMessages(channelId).every((m) => m.author.kind !== 'bot')).toBe(
        true,
      );
    });
  });

  it('retains membership checks after a draft has been held', async () => {
    await fixture(async ({ core, channelId, human, tool }) => {
      await human('old', 'Question');
      const held = await tool('bot_send_message', { body: 'Draft' });
      core.channels.removeGroupMember(channelId, 'ada');
      await expect(
        tool('bot_send_message', { body: 'Draft', draft_id: held.draftId }),
      ).rejects.toThrow();
      expect(
        core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
      ).toHaveLength(0);
    });
  });
});

it('serializes two sends with the same observation and treats only the first as fresh', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('question', 'One answer');
    const read = await tool('channel_read', {});
    const outcomes = await Promise.all([
      tool('bot_send_message', { body: 'First', observation_id: read.observationIds[channelId] }),
      tool('bot_send_message', { body: 'Second', observation_id: read.observationIds[channelId] }),
    ]);
    expect(outcomes.map((result) => result.status).sort()).toEqual(['committed', 'held']);
    expect(
      core.channels.readMessages(channelId).filter((m) => m.author.kind === 'bot'),
    ).toHaveLength(1);
  });
});

it('unified messaging preserves Group draft review before committing', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    expect((await tool('channel_action', { action: 'inspect' })).status).toBe('inspected');
    await expect(tool('bot_send_message', { body: 'Do not send', recover: true })).rejects.toThrow(
      'Recovery requires',
    );
    await human('question', 'What is the release date?');
    const read = await tool('channel_read', {});
    await human('correction', 'Use October 21, not October 20.');
    const held = await tool('bot_send_message', {
      body: 'October 20',
      observation_id: read.observationIds[channelId],
      end_turn: true,
    });
    expect(held.status).toBe('held');
    expect(
      core.channels.readMessages(channelId).filter((message) => message.author.kind === 'bot'),
    ).toHaveLength(0);
    const sent = await tool('bot_send_message', {
      body: 'October 21',
      draft_id: held.draftId,
      observation_id: held.review!.observationId,
    });
    expect(sent.status).toBe('committed');
    expect(
      core.channels
        .readMessages(channelId)
        .filter((message) => message.author.kind === 'bot')
        .map((message) => message.body),
    ).toEqual(['October 21']);
  });
});

it('channel actions cannot smuggle a message through extra delivery arguments', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('reaction-target', 'React only');
    await tool('channel_action', {
      action: 'react',
      react_to: 'reaction-target',
      reaction: '👍',
      body: 'must not send',
      attachments: [{ name: 'injected.txt', mime: 'text/plain', size: 1, hash: 'a'.repeat(64) }],
    });
    expect(
      core.channels.readMessages(channelId).filter((message) => message.author.kind === 'bot'),
    ).toHaveLength(0);
  });
});
