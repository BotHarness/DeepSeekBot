import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRegistry } from './registry-fixture.js';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotAttentionQuery } from '../src/runtime/attention.js';
import { createHumanAttentionQuery } from '../src/runtime/human-attention.js';
import { createBotRuntime } from '../src/runtime/bot-runtime.js';
import { FIXED_NOW, createTempRoot, trackTestOwner } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { ManualAgents, sourceEvents, setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it('projects a Bot Grant request until a committed Grant-linked reply and keeps legacy text pending', async () => {
    const home = createTempRoot('botharness-grant-attention-');
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const channels = createSqliteChannelStore({
      database: attachOperationalModule(owner, 'grant-messaging-test'),
      databaseOwnerReady: owner.mode === 'ready',
      rootDir: join(home, 'channels'),
      now: FIXED_NOW,
    });
    const dmChannelId = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id;
    createTestWorkspaceGrants(owner, home);
    try {
      const query = createHumanAttentionQuery(
        attachOperationalModule(owner, 'human-grant-attention-test'),
      );
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dmChannelId, {
        id: 'grant-request-1',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Please give me access to the project.',
        grantRequest: true,
      });
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toMatchObject([
        {
          kind: 'workspace-grant-request',
          botSlug: 'ada',
          channelId: dmChannelId,
          messageId: 'grant-request-1',
          summary: 'Please give me access to the project.',
        },
      ]);
      expect(
        query.list(OWNER_HUMAN_CONTEXT, { category: 'action', botSlug: 'other' }).items,
      ).toEqual([]);
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dmChannelId, {
        id: 'human-unrelated',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'I will review this.',
        replyTo: 'grant-request-1',
      });
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toHaveLength(1);
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dmChannelId, {
        id: 'human-uppercase-unvalidated',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'I AUTHORIZED WORKSPACE “Project”; please continue.',
        replyTo: 'grant-request-1',
      });
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toHaveLength(1);
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dmChannelId, {
        id: 'human-approved',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'Workspace authorized.',
        replyTo: 'grant-request-1',
        grantRequestResolution: { requestMessageId: 'grant-request-1', grantId: TEST_GRANT_ID },
      });
      await Promise.resolve();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual([]);

      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dmChannelId, {
        id: 'grant-request-legacy',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Please give me another folder.',
        grantRequest: true,
      });
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toHaveLength(1);
      await channels.appendMessage(OWNER_HUMAN_CONTEXT, dmChannelId, {
        id: 'human-approved-legacy',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: '已授权工作区「Project」，请继续处理之前的事项。',
        replyTo: 'grant-request-legacy',
      });
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toMatchObject([
        { messageId: 'grant-request-legacy' },
      ]);
    } finally {
      owner.close();
    }
    const reopened = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const query = createHumanAttentionQuery(attachOperationalModule(reopened, 'grant-restart'));
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toMatchObject([
        { messageId: 'grant-request-legacy' },
      ]);
    } finally {
      reopened.close();
    }
  });

  it('wakes an idle Orchestrator with one coalesced block and records observation', async () => {
    const { runtime, agents, owner, channels, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({
      title: '调研 A 方向',
      grantId: TEST_GRANT_ID,
      description: '调研 A 方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');
    const attention = createBotAttentionQuery(
      attachOperationalModule(owner, 'report-attention-test'),
      channels,
    );

    await run.report({ state: 'progress', summary: '里程碑 1' });
    await Promise.resolve();
    expect(agents.inboxTurns).toEqual([]);
    expect(attention.list({ botSlug: 'ada' }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'assignment-report',
          state: 'pending',
          sourceKind: 'assignment-report',
          assignmentSessionId: sessionId,
          assignmentTitle: '调研 A 方向',
          assignmentReportState: 'progress',
          sourceAvailable: true,
          summary: '里程碑 1',
        }),
      ]),
    );

    await run.report({ state: 'progress', summary: '里程碑 2' });
    await run.report({ state: 'completed', summary: 'A 方向完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();

    expect(agents.inboxTurns).toHaveLength(1);
    expect(
      attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.reason === 'assignment-report'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'open',
          assignmentReportState: 'completed',
          assignmentSessionId: sessionId,
        }),
        expect.objectContaining({
          state: 'open',
          assignmentReportState: 'progress',
          assignmentSessionId: sessionId,
        }),
      ]),
    );
    const injected = agents.inboxTurns[0] ?? '';
    expect(injected).toContain('A 方向完成');
    expect(injected).toContain('repeats 3');
    expect(injected).not.toContain('里程碑 1');
    expect(
      sourceEvents(owner)
        .filter((row) => row.source_kind === 'assignment-report')
        .map((row) => row.observed_at),
    ).toEqual([FIXED_NOW().toISOString(), FIXED_NOW().toISOString(), FIXED_NOW().toISOString()]);

    await admit('继续', 'human-2');
    await runtime.whenIdle();
    expect(agents.inboxTurns).toHaveLength(1);
    await close();
  });

  it('resumes an Assignment when the Orchestrator answers its open ask', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 A 方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');

    await run.report({ state: 'blocked', summary: '需要决定 A 还是 B', expectsReply: true });
    agents.finish(sessionId);
    await runtime.whenIdle();

    const openAsk = runtime.getAssignment('ada', sessionId)?.openAsk;
    expect(openAsk?.summary).toBe('需要决定 A 还是 B');
    expect(agents.inboxTurns).toHaveLength(1);
    expect(agents.inboxTurns[0]).toContain('WAITING');
    const askId = openAsk?.sourceEventId ?? '';
    expect(agents.inboxTurns[0]).toContain(askId);
    expect(
      sourceEvents(owner).some(
        (row) => row.source_kind === 'assignment-report' && row.expects_reply === 1,
      ),
    ).toBe(true);

    const answered = agents.access.request({
      sessionId,
      mode: 'next-turn',
      text: '选 A',
      answerTo: askId,
    });
    expect(answered.delivery).toBe('followup');
    expect(agents.resumed).toEqual([{ sessionId, text: '选 A' }]);
    await Promise.resolve();
    expect(runtime.getAssignment('ada', sessionId)?.openAsk).toBeUndefined();
    await close();
  });

  it.each(['waiting-human', 'progress', 'stop-failed'] as const)(
    'keeps the canonical blocked ask address when harvesting a later %s report',
    async (state) => {
      const { runtime, agents, dmChannelId, admit, close } = await setup();
      let release = (): void => undefined;
      try {
        await admit('Start research', 'human-1');
        const created = agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Choose route',
        });
        if (created.outcome !== 'created') throw new Error('create failed');
        const sessionId = created.assignment.sessionId;
        const run = agents.started[0]!.run;
        let started = (): void => undefined;
        const ready = new Promise<void>((resolve) => {
          started = resolve;
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        vi.spyOn(agents, 'runOrchestrator').mockImplementationOnce(async () => {
          started();
          await held;
        });
        const active = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dmChannelId,
          messageId: 'human-2',
          body: 'Review context',
        });
        if (!active.admitted) throw new Error('active turn missing');
        await ready;
        await run.report({ state: 'blocked', summary: 'Choose A or B', expectsReply: true });
        const askId = runtime.getAssignment('ada', sessionId)!.openAsk!.sourceEventId;
        await run.report({
          state: state === 'stop-failed' ? 'progress' : state,
          summary: 'Later update',
          expectsReply: state === 'waiting-human',
        });
        if (state === 'stop-failed') {
          agents.failNextStop = true;
          await expect(agents.access!.stop(sessionId)).rejects.toThrow('DSH stop failed');
        }
        agents.finish(sessionId);
        release();
        await active.settled;
        await runtime.whenIdle();
        const injected = agents.inboxTurns[0] ?? '';
        if (state === 'stop-failed') {
          expect(injected).toContain('activity stopping');
          expect(injected).not.toContain('WAITING');
          expect(injected).not.toContain('answer_to: ' + askId);
          return;
        }
        expect(injected).toContain('WAITING');
        expect(injected).toContain('answer_to: ' + askId);
        expect(injected).toContain('Choose A or B');
        const answerTo = injected.match(/answer_to: ([^)]+)/u)?.[1];
        if (answerTo === undefined) throw new Error('Inbox answer target missing');
        expect(
          agents.access!.request({ sessionId, mode: 'next-turn', text: 'Choose A', answerTo })
            .delivery,
        ).toBe('followup');
        await Promise.resolve();
        expect(runtime.getAssignment('ada', sessionId)?.openAsk).toBeUndefined();
      } finally {
        release();
        await close();
      }
    },
  );

  it('projects one open Assignment ask into Human Inbox and clears it when answered', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Choose a direction',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      await agents.started[0]!.run.report({
        state: 'waiting-human',
        summary: 'Should I choose A or B?',
        expectsReply: true,
      });
      agents.finish(sessionId);
      await runtime.whenIdle();

      const attention = createHumanAttentionQuery(
        attachOperationalModule(owner, 'assignment-human-attention-test'),
      );
      expect(attention.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-waiting-human',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'Should I choose A or B?',
        },
      ]);
      expect(
        attention.list(OWNER_HUMAN_CONTEXT, { category: 'action', botSlug: 'bea' }).items,
      ).toEqual([]);
      expect(
        attention.list(OWNER_HUMAN_CONTEXT, { category: 'action', channelId: 'dm-ada' }).items,
      ).toMatchObject([{ assignmentSessionId: sessionId }]);
      expect(attention.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items).toEqual([]);

      const askId = runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId;
      if (askId === undefined) throw new Error('Open ask missing');
      agents.access!.request({
        sessionId,
        mode: 'next-turn',
        text: 'Choose A',
        answerTo: askId,
      });
      await Promise.resolve();
      expect(attention.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual([]);
    } finally {
      await close();
    }
  });

  it('retains the escalated blocker and exact Human reply target after weaker reports', async () => {
    const { runtime, agents, owner, channels, admit, close } = await setup();
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Choose release route',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      const run = agents.started[0]!.run;
      const query = createHumanAttentionQuery(attachOperationalModule(owner, 'escalation-test'));
      await run.report({ state: 'waiting-human', summary: 'Choose route', expectsReply: true });
      const initialSource = query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items[0]
        ?.sourceEventId;
      await run.report({
        state: 'blocked',
        summary: 'Release blocked; choose route',
        expectsReply: true,
      });
      const blockedSource = runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId;
      if (blockedSource === undefined) throw new Error('Open blocker missing');
      expect(blockedSource).not.toBe(initialSource);
      await run.report({
        state: 'waiting-human',
        summary: 'Weaker waiting update',
        expectsReply: true,
      });
      await run.report({ state: 'progress', summary: 'Informational progress' });
      expect(runtime.getAssignment('ada', sessionId)?.latestReport?.state).toBe('progress');
      expect(runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId).toBe(blockedSource);
      agents.finish(sessionId);
      await runtime.whenIdle();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toMatchObject([
        {
          kind: 'assignment-blocked',
          sourceEventId: blockedSource,
          summary: 'Release blocked; choose route',
        },
      ]);
      const sources = createBotAttentionQuery(
        attachOperationalModule(owner, 'escalation-sources'),
        channels,
      );
      const originalReports = sources
        .list({ botSlug: 'ada' })
        .items.filter((i) => i.sourceKind === 'assignment-report');
      expect(originalReports).toHaveLength(4);
      expect(new Set(originalReports.map((i) => i.id)).size).toBe(4);
      expect(originalReports.every((i) => i.sourceAvailable && i.authorKind === 'bot')).toBe(true);
      expect(
        agents.access!.request({
          sessionId,
          mode: 'next-turn',
          text: 'Choose Canary',
          answerTo: blockedSource,
        }).delivery,
      ).toBe('followup');
      await Promise.resolve();
      expect(runtime.getAssignment('ada', sessionId)?.openAsk).toBeUndefined();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual([]);
      expect(
        sources.list({ botSlug: 'ada' }).items.filter((i) => i.sourceKind === 'assignment-report'),
      ).toEqual(originalReports);
    } finally {
      await close();
    }
  });

  it('coalesces a blocked Assignment ask, opens its source, and clears it on reply', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    let sessionId = '';
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      sessionId = created.assignment.sessionId;
      const run = agents.started[0]!.run;
      await run.report({
        state: 'waiting-human',
        summary: 'Need a decision',
        expectsReply: true,
      });
      const query = createHumanAttentionQuery(
        attachOperationalModule(owner, 'assignment-blocked-human-attention-test'),
      );
      const first = query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items;
      expect(first).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-waiting-human',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'Need a decision',
        },
      ]);
      const originalSource = first[0]?.sourceEventId;
      expect(originalSource).toBeDefined();

      await run.report({
        state: 'blocked',
        summary: 'Still blocked; need a grant',
        expectsReply: true,
      });
      agents.finish(sessionId);
      await runtime.whenIdle();
      const revised = query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items;
      expect(revised).toHaveLength(1);
      expect(revised[0]).toMatchObject({
        id: 'assignment:' + sessionId,
        kind: 'assignment-blocked',
        summary: 'Still blocked; need a grant',
      });
      expect(revised[0]?.sourceEventId).not.toBe(originalSource);
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items).toEqual([]);
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action', botSlug: 'bea' }).items).toEqual(
        [],
      );

      const answerTo = revised[0]?.sourceEventId;
      if (answerTo === undefined) throw new Error('Open blocker missing source');
      agents.access!.request({
        sessionId,
        mode: 'next-turn',
        text: 'Use the new grant',
        answerTo,
      });
      await Promise.resolve();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual([]);
      agents.finish(sessionId);
      await runtime.whenIdle();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-blocked',
          sourceEventId: answerTo,
          summary: 'Still blocked; need a grant',
        },
      ]);

      agents.access!.request({ sessionId, mode: 'next-turn', text: 'Complete the task' });
      await agents.started.at(-1)!.run.report({
        state: 'completed',
        summary: 'Resolved with the new grant',
      });
      agents.finish(sessionId);
      await runtime.whenIdle();
      await Promise.resolve();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual([]);
    } finally {
      await close();
      owner.close();
    }
    const reopened = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const query = createHumanAttentionQuery(
        attachOperationalModule(reopened, 'assignment-blocked-restart-test'),
      );
      await Promise.resolve();
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'action' }).items).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it('keeps an open ask across a restart', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');
    const created = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 A 方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');
    await run.report({ state: 'waiting-human', summary: '需要 Human 决定', expectsReply: true });
    agents.finish(sessionId);
    await runtime.whenIdle();

    const askId = runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId;
    await close();
    expect(askId).toBeDefined();

    const reopened = createBotRuntime({
      database: owner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: new ManualAgents(),
      now: FIXED_NOW,
    });
    expect(reopened.getAssignment('ada', sessionId)?.openAsk?.sourceEventId).toBe(askId);
    expect(reopened.getAssignment('ada', sessionId)?.activity).toBe('idle');
    await reopened.close();
    owner.close();
  });
});
