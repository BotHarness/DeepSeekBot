import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRegistry } from './registry-fixture.js';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBotRuntime } from '../src/runtime/bot-runtime.js';
import { FIXED_NOW } from './helpers.js';
import { TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { ManualAgents, setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it('applies a live limit to create and wake without cancelling existing work', async () => {
    let limit = 3;
    const { runtime, agents, admit, close } = await setup({
      assignmentConcurrencyLimit: () => limit,
    });
    try {
      await admit('Start', 'human-live-limit');
      const access = agents.access!;
      const a = access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'idle A',
        key: 'live-A',
      });
      if (a.outcome !== 'created') throw new Error('A missing');
      await agents.started[0]!.run.report({
        state: 'waiting-human',
        summary: 'Need decision',
        expectsReply: true,
      });
      agents.finish(a.assignment.sessionId);
      await runtime.whenIdle();
      for (const purpose of ['B', 'C'])
        expect(
          access.create({ grantId: TEST_GRANT_ID, title: purpose, description: purpose }).outcome,
        ).toBe('created');
      const before = runtime.getAssignment('ada', a.assignment.sessionId);
      limit = 1;
      expect(
        access.create({ title: 'Assignment', grantId: TEST_GRANT_ID, description: 'denied' }),
      ).toMatchObject({
        outcome: 'capacity',
        activeCount: 2,
        limit: 1,
      });
      expect(
        access.request({
          sessionId: a.assignment.sessionId,
          mode: 'next-turn',
          text: 'answer',
          answerTo: before!.openAsk!.sourceEventId,
        }),
      ).toMatchObject({ outcome: 'capacity', activeCount: 2, limit: 1 });
      expect(runtime.getAssignment('ada', a.assignment.sessionId)).toEqual(before);
      expect(runtime.listAssignments('ada').filter((a) => a.activity === 'working')).toHaveLength(
        2,
      );
      limit = 3;
      expect(
        access.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'reuse A',
          key: 'live-A',
        }),
      ).toMatchObject({ outcome: 'reused', assignment: { sessionId: a.assignment.sessionId } });
      expect(
        access.create({ title: 'Assignment', grantId: TEST_GRANT_ID, description: 'denied again' }),
      ).toMatchObject({
        outcome: 'capacity',
        activeCount: 3,
        limit: 3,
      });
      expect(runtime.getAssignment('ada', a.assignment.sessionId)?.permission).toEqual(
        before?.permission,
      );
    } finally {
      await close();
    }
  });

  it('checks capacity before waking an idle Session after a cold restart', async () => {
    const { runtime, agents, owner, home, grants, channels, dmChannelId, admit, close } =
      await setup({ assignmentConcurrencyLimit: 1 });
    await admit('Prepare cold wake', 'human-cold-prepare');
    const original = agents.access!.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: 'Choose a route',
      key: 'cold',
    });
    if (original.outcome !== 'created') throw new Error('Cold Assignment missing');
    await agents.started[0]!.run.report({
      state: 'waiting-human',
      summary: 'Choose A',
      expectsReply: true,
    });
    agents.finish(original.assignment.sessionId);
    await runtime.whenIdle();
    const before = runtime.getAssignment('ada', original.assignment.sessionId)!;
    await close();
    const coldAgents = new ManualAgents();
    const reopened = createBotRuntime({
      database: owner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels,
      agents: coldAgents,
      grants,
      now: FIXED_NOW,
      assignmentConcurrencyLimit: 1,
    });
    try {
      const admission = reopened.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dmChannelId,
        messageId: 'human-cold-resume',
        body: 'Resume',
      });
      if (!admission.admitted) throw new Error('Cold admission missing');
      await admission.settled;
      const access = coldAgents.access!;
      expect(
        access.create({ title: 'Assignment', grantId: TEST_GRANT_ID, description: 'Active work' })
          .outcome,
      ).toBe('created');
      expect(
        access.request({
          sessionId: before.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: before.openAsk!.sourceEventId,
        }),
      ).toMatchObject({ outcome: 'capacity', activeCount: 1, limit: 1 });
      expect(reopened.getAssignment('ada', before.sessionId)).toEqual(before);
      expect(coldAgents.resumed).toHaveLength(0);
    } finally {
      coldAgents.finishAll();
      await reopened.whenIdle();
      await reopened.close();
    }
  });

  it('shares capacity across Bots when an idle Assignment resumes', async () => {
    const { runtime, agents, grants, channels, home, admit, close } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    try {
      await admit('Start Ada', 'human-ada-capacity');
      const ada = agents.access!;
      const idle = ada.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Ada work',
      });
      if (idle.outcome !== 'created') throw new Error('Ada Assignment missing');
      agents.finish(idle.assignment.sessionId);
      await runtime.whenIdle();
      createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }).create({
        slug: 'bob',
        displayName: 'Bob',
      });
      const bobGrant = await grants.create('bob', 'test-workspace');
      const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob')!;
      const incoming = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'human-bob-capacity',
        body: 'Start Bob',
      });
      if (!incoming.admitted) throw new Error('Bob admission missing');
      await incoming.settled;
      expect(
        agents.access!.create({
          title: 'Assignment',
          grantId: bobGrant.id,
          description: 'Bob work',
        }).outcome,
      ).toBe('created');
      expect(
        ada.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue Ada',
        }),
      ).toMatchObject({ outcome: 'capacity', activeCount: 1, limit: 1 });
      expect(agents.resumed).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it('keeps a stopped Assignment stopped when its wake is refused at capacity', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    await admit('开始调研', 'stopped-capacity');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '持续调研 A 方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    await runtime.stopSession!('ada', sessionId);
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopped');

    const busy = access.create({
      title: 'Busy',
      grantId: TEST_GRANT_ID,
      description: '占住唯一的并发位',
    });
    expect(busy.outcome).toBe('created');
    const refused = access.request({ sessionId, mode: 'next-turn', text: '继续' });
    expect(refused.delivery).toBe('capacity');
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopped');

    await close();
  });

  it('releases a stale working reservation after Host restart without deleting the Assignment', async () => {
    const { runtime, owner, home, agents, grants, dmChannelId, admit } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    await admit('开始调研', 'human-restart-capacity');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');
    const created = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '原事项',
      key: 'restart-direction',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    agents.finish(created.assignment.sessionId);
    await runtime.whenIdle();
    await runtime.close();

    attachOperationalModule(owner, 'restart-capacity-seed').transaction((database) => {
      database
        .prepare("UPDATE assignments SET activity = 'working' WHERE session_id = ?")
        .run(created.assignment.sessionId);
    });
    const resumedAgents = new ManualAgents();
    const resumed = createBotRuntime({
      database: owner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: resumedAgents,
      grants,
      now: FIXED_NOW,
      assignmentConcurrencyLimit: 1,
    });
    expect(resumed.getAssignment('ada', created.assignment.sessionId)?.activity).toBe('error');
    expect(resumed.getAssignment('ada', created.assignment.sessionId)?.continuityKey).toBe(
      'restart-direction',
    );
    const admission = resumed.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dmChannelId,
      messageId: 'human-after-restart',
      body: '新事项',
    });
    if (!admission.admitted) throw new Error('DM admission refused');
    await admission.settled;
    if (resumedAgents.access === undefined) throw new Error('Orchestrator never resumed');
    const replacement = resumedAgents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '新事项',
      key: 'restart-direction',
    });
    expect(replacement).toMatchObject({
      outcome: 'reused',
      assignment: { sessionId: created.assignment.sessionId },
    });
    await Promise.resolve();
    resumedAgents.finishAll();
    await resumed.whenIdle();
    await resumed.close();
    owner.close();
  });

  it('refuses creation beyond the Assignment Concurrency Limit', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    expect(
      agents.access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: '调研 A 方向',
      }).outcome,
    ).toBe('created');
    const refused = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 B 方向',
    });
    expect(refused.outcome).toBe('capacity');
    expect(refused.outcome === 'capacity' && refused.message).toContain('retryable: true');
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    await close();
  });
});
