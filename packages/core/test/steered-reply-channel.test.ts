import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('reply Channel in a turn that carries several Channels', () => {
  it('refuses an unaddressed bot_send_message after a message from another Channel was steered in', async () => {
    let ready!: (run: OrchestratorAgentRun) => void;
    let release!: () => void;
    const started = new Promise<OrchestratorAgentRun>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const steered: string[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-steered-reply-channel-'),
      agents: {
        async runOrchestrator(run) {
          ready(run);
          await held;
        },
        steerOrchestrator(_slug, text) {
          steered.push(text);
          return true;
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessageOnce(group.id, {
        id: 'group-mention',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@Ada reply here',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'group-mention');
      const run = await started;
      expect(run.inboundChannelId).toBe(group.id);
      const before = await run.channels.send({ body: 'Group reply' });
      expect(core.channels.message(group.id, before.id)?.body).toBe('Group reply');

      await core.channels.appendMessage(dm.id, {
        id: 'steered-dm',
        at: '2026-09-25T00:00:01.000Z',
        author: { kind: 'human' },
        body: 'Private question',
      });
      const admission = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'steered-dm',
        body: 'Private question',
      });
      expect(admission.admitted).toBe(true);
      expect(steered).toHaveLength(1);
      expect(steered[0]).toContain(`Channel: ${dm.id}`);

      await expect(run.channels.send({ body: 'Private answer' })).rejects.toThrow(
        `This turn carries messages from several Channels: Group "Team" (channel_id "${group.id}"); Human DM (channel_id "${dm.id}"). Call bot_send_message with the trusted source_event_id`,
      );
      const quoted = await run.channels.send({ replyTo: 'steered-dm', body: 'Quoted answer' });
      expect(core.channels.message(dm.id, quoted.id)?.body).toBe('Quoted answer');
      const quotedGroup = await run.channels.send({
        replyTo: 'group-mention',
        body: 'Quoted group',
      });
      expect(core.channels.message(group.id, quotedGroup.id)?.body).toBe('Quoted group');
      await expect(run.channels.send({ replyTo: 'missing', body: 'Nowhere' })).rejects.toThrow(
        'This turn carries messages from several Channels',
      );
      const answer = await run.channels.send({ channelId: dm.id, body: 'Private answer' });
      expect(core.channels.message(dm.id, answer.id)?.body).toBe('Private answer');
      const groupAgain = await run.channels.send({ channelId: group.id, body: 'Group follow-up' });
      expect(core.channels.message(group.id, groupAgain.id)?.body).toBe('Group follow-up');
      expect(
        core.channels
          .readMessages(group.id)
          .some((message) => ['Private answer', 'Quoted answer'].includes(message.body)),
      ).toBe(false);
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
