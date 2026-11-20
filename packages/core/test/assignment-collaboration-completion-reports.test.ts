import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRegistry } from './registry-fixture.js';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotAttentionQuery } from '../src/runtime/attention.js';
import { createBotRuntime, type BotRuntime } from '../src/runtime/bot-runtime.js';
import { FIXED_NOW, trackTestOwner } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { ManualAgents, sourceEvents, setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it('retains two causally linked sources without a second completed wake', async () => {
    const { runtime, agents, owner, admit, close, channels } = await setup();
    try {
      await admit('Start', 'completion-start');
      agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Complete',
      });
      const run = agents.started[0]!.run;
      await run.report({ state: 'completed', summary: 'Verified release' }, { turn: 7 });
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      run.completedTurn!({ turn: 7, endSeq: 42 });
      run.completedTurn!({ turn: 7, endSeq: 42 });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      expect(agents.inboxTurns).toHaveLength(1);
      const port = attachOperationalModule(owner, 'completion-test');
      const items = createBotAttentionQuery(port, channels).list({ botSlug: 'ada' }).items;
      const report = items.find((i) => i.sourceKind === 'assignment-report')!;
      const notice = items.find((i) => i.sourceKind === 'assignment-lifecycle')!;
      expect(items.filter((i) => i.sourceKind === 'assignment-lifecycle')).toHaveLength(1);
      expect(report).toMatchObject({
        state: 'open',
        authorKind: 'bot',
        authorBotSlug: 'ada',
        sourceAvailable: true,
      });
      expect(notice).toMatchObject({
        state: 'pending',
        authorKind: 'system',
        sourceAvailable: true,
      });
      const payload = port.read((db) =>
        db
          .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
          .get(notice.id),
      ) as { payload_json: string };
      expect(JSON.parse(payload.payload_json)).toMatchObject({
        assignmentLifecycle: {
          state: 'completed',
          turn: 7,
          endSeq: 42,
          reportSourceEventId: report.id,
        },
      });
      await admit('Review current facts', 'completion-review');
      expect(agents.allInboxTurns.at(-1)).toContain(notice.id);
      expect(agents.allInboxTurns.at(-1)).toContain(report.id);
      expect(
        createBotAttentionQuery(port, channels)
          .list({ botSlug: 'ada' })
          .items.find((i) => i.id === notice.id)?.state,
      ).toBe('open');
    } finally {
      await close();
    }
  });

  it('does not wake for a paired completion notice once a wait took its Report', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      agents.onMessage = async (run) => {
        const created = run.assignments.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Complete',
        });
        if (created.outcome !== 'created') throw new Error('Assignment missing');
        const assignment = agents.started.at(-1)!.run;
        const waiting = run.assignments.wait!(
          created.assignment.sessionId,
          new AbortController().signal,
        );
        await assignment.report({ state: 'completed', summary: 'Done' }, { turn: 1 });
        const waited = await waiting;
        expect(waited.inboxIds).toHaveLength(1);
        assignment.completedTurn!({ turn: 1, endSeq: 10 });
        agents.finish(created.assignment.sessionId);
      };
      await admit('Do it and wait', 'wait-start');
      await runtime.whenIdle();
      expect(agents.inboxTurns).toHaveLength(0);
      expect(
        sourceEvents(owner)
          .filter((e) => e.source_kind.startsWith('assignment-'))
          .every((e) => e.observed_at !== null),
      ).toBe(true);
    } finally {
      await close();
    }
  });

  it('wakes once when parallel Assignments from one request complete', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      agents.onMessage = async (run) => {
        for (const title of ['First', 'Second'])
          run.assignments.create({ title, grantId: TEST_GRANT_ID, description: title });
      };
      await admit('Research both in parallel', 'parallel-start');
      await vi.waitFor(() => expect(agents.started).toHaveLength(2));
      const [first, second] = agents.started.map((entry) => entry.run);
      await first!.report({ state: 'completed', summary: 'First result' }, { turn: 1 });
      first!.completedTurn!({ turn: 1, endSeq: 10 });
      agents.finish(first!.sessionId);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(agents.inboxTurns).toHaveLength(0);
      await second!.report({ state: 'completed', summary: 'Second result' }, { turn: 1 });
      second!.completedTurn!({ turn: 1, endSeq: 10 });
      agents.finish(second!.sessionId);
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      await runtime.whenIdle();
      expect(agents.inboxTurns).toHaveLength(1);
      expect(agents.inboxTurns[0]).toContain('First result');
      expect(agents.inboxTurns[0]).toContain('Second result');
    } finally {
      await close();
    }
  });

  it('batches completions from different requests while another Assignment runs', async () => {
    const { agents, admit, close } = await setup();
    try {
      agents.onMessage = async (run) => {
        run.assignments.create({ title: 'Job', grantId: TEST_GRANT_ID, description: 'Job' });
      };
      await admit('First job', 'digest-first');
      await vi.waitFor(() => expect(agents.started).toHaveLength(1));
      await admit('Second job', 'digest-second');
      await vi.waitFor(() => expect(agents.started).toHaveLength(2));
      const [first, second] = agents.started.map((entry) => entry.run);
      await first!.report({ state: 'completed', summary: 'First result' }, { turn: 1 });
      first!.completedTurn!({ turn: 1, endSeq: 10 });
      agents.finish(first!.sessionId);
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(agents.inboxTurns).toHaveLength(0);
      await second!.report({ state: 'completed', summary: 'Second result' }, { turn: 1 });
      second!.completedTurn!({ turn: 1, endSeq: 10 });
      agents.finish(second!.sessionId);
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      expect(agents.inboxTurns[0]).toContain('First result');
      expect(agents.inboxTurns[0]).toContain('Second result');
    } finally {
      await close();
    }
  });

  it('does not hold a blocked Report for a sibling Assignment', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      agents.onMessage = async (run) => {
        for (const title of ['First', 'Second'])
          run.assignments.create({ title, grantId: TEST_GRANT_ID, description: title });
      };
      await admit('Research both in parallel', 'parallel-blocked');
      await vi.waitFor(() => expect(agents.started).toHaveLength(2));
      const first = agents.started[0]!.run;
      await first.report({ state: 'blocked', summary: 'Need a key' }, { turn: 1 });
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      expect(agents.inboxTurns[0]).toContain('Need a key');
      agents.finishAll();
    } finally {
      await close();
    }
  });

  it('leaves a Report committed after the wait returned in the Inbox', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    let claimed: string[] | undefined;
    let late: Promise<unknown> | undefined;
    try {
      agents.onMessage = async (run) => {
        const created = run.assignments.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Two steps',
        });
        if (created.outcome !== 'created') throw new Error('Assignment missing');
        const assignment = agents.started.at(-1)!.run;
        const waiting = run.assignments.wait!(
          created.assignment.sessionId,
          new AbortController().signal,
        );
        const first = assignment.report({ state: 'progress', summary: 'Step one' }, { turn: 1 });
        queueMicrotask(() => {
          late = assignment.report({ state: 'progress', summary: 'Step two' }, { turn: 1 });
        });
        await first;
        claimed = (await waiting).inboxIds;
        await late;
        assignment.completedTurn!({ turn: 1, endSeq: 10 });
        agents.finish(created.assignment.sessionId);
      };
      await admit('Do it and wait', 'wait-late');
      await runtime.whenIdle();
      const reports = sourceEvents(owner).filter((e) => e.source_kind === 'assignment-report');
      expect(reports).toHaveLength(2);
      expect(claimed).toEqual([reports[0]!.source_event_id]);
    } finally {
      await close();
    }
  });

  it('keeps Report meaning alongside a paired Host completion in one harvest', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start', 'paired-start');
      agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Complete',
      });
      const run = agents.started[0]!.run;
      const reporting = run.report(
        { state: 'completed', summary: 'The result is verified' },
        { turn: 1 },
      );
      run.completedTurn!({ turn: 1, endSeq: 30 });
      await reporting;
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      expect(agents.inboxTurns).toHaveLength(1);
      expect(agents.inboxTurns[0]).toContain('reported [Source Event');
      expect(agents.inboxTurns[0]).toContain('The result is verified');
      expect(agents.inboxTurns[0]).toContain('Host lifecycle notice [Source Event');
      expect(agents.inboxTurns[0]).toContain('same native Turn as Report');
      expect(
        sourceEvents(owner)
          .filter((e) => e.source_kind.startsWith('assignment-'))
          .every((e) => e.observed_at !== null),
      ).toBe(true);
    } finally {
      await close();
    }
  });

  it.each(['cancelled', 'failed'] as const)(
    'harvests one native %s Notice and preserves its progress Report across restart',
    async (state) => {
      const { runtime, agents, admit, close, owner, channels, home, dmChannelId } = await setup();
      let reopened: ReturnType<typeof mountOperationalDatabase> | undefined;
      let recovered: BotRuntime | undefined;
      try {
        await admit('Start cancellation QA', 'human-native-cancel');
        const created = agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Cancelled work',
          key: 'cancel-direction',
        });
        if (created.outcome !== 'created') throw new Error('Assignment missing');
        const run = agents.started[0]!.run;
        await run.report(
          { state: 'progress', summary: 'Evidence before cancellation' },
          { turn: 1 },
        );
        const query = createBotAttentionQuery(
          attachOperationalModule(owner, 'native-cancel-query'),
          channels,
        );
        const reports = () =>
          query
            .list({ botSlug: 'ada' })
            .items.filter((i) => i.assignmentSessionId === run.sessionId);
        const original = reports()[0]!;
        expect(original.state).toBe('pending');
        const settle = state === 'cancelled' ? run.cancelledTurn! : run.failedTurn!;
        settle({ turn: 1, endSeq: 30 });
        settle({ turn: 1, endSeq: 30 });
        agents.finish(run.sessionId);
        await runtime.whenIdle();
        const before = reports();
        expect(before).toHaveLength(2);
        const notice = before.find((i) => i.sourceKind === 'assignment-lifecycle')!;
        expect(notice).toMatchObject({
          authorKind: 'system',
          assignmentTurn: 1,
          state: 'open',
          sourceAvailable: true,
        });
        expect(notice.relatedReportSourceEventId).toBeUndefined();
        expect(notice.summary).toContain(
          state === 'cancelled' ? 'was cancelled' : 'execution error',
        );
        expect(before.find((i) => i.id === original.id)).toMatchObject({
          ...original,
          state: 'open',
          assignmentReportState: 'progress',
        });
        expect(agents.inboxTurns).toHaveLength(1);
        expect(agents.inboxTurns[0]).toContain('Host lifecycle notice [Source Event ' + notice.id);
        expect(runtime.getAssignment('ada', run.sessionId)).toMatchObject({
          activity: 'error',
          latestReport: { state: 'progress', summary: 'Evidence before cancellation' },
        });
        expect(runtime.getAssignment('ada', run.sessionId)?.continuityKey).toBe('cancel-direction');
        expect(notice.summary).toContain(
          'send_assignment_request with this Session id continues it',
        );
        const payload = attachOperationalModule(owner, 'native-cancel-payload').read((db) =>
          db
            .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
            .get(notice.id),
        ) as { payload_json: string };
        expect(JSON.parse(payload.payload_json)).toEqual({
          author: { kind: 'system' },
          assignmentLifecycle: {
            state,
            cause: state === 'cancelled' ? 'native-turn-aborted' : 'native-turn-error',
            turn: 1,
            endSeq: 30,
          },
        });
        await runtime.close();
        owner.close();
        reopened = trackTestOwner(
          mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
        );
        const recoveredAgents = new ManualAgents();
        recovered = createBotRuntime({
          database: reopened,
          registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
          channels,
          agents: recoveredAgents,
          grants: createTestWorkspaceGrants(reopened, home),
          now: FIXED_NOW,
        });
        await recovered.whenIdle();
        const after = createBotAttentionQuery(
          attachOperationalModule(reopened, 'native-cancel-reopen'),
          channels,
        )
          .list({ botSlug: 'ada' })
          .items.filter((i) => i.assignmentSessionId === run.sessionId);
        expect(after).toEqual(before);
        expect(recoveredAgents.started).toHaveLength(0);
        expect(recoveredAgents.inboxTurns).toHaveLength(0);
        const reviewed = recovered.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dmChannelId,
          messageId: 'cancel-review',
          body: 'Review cancelled work',
        });
        if (!reviewed.admitted) throw new Error('Review admission rejected');
        await reviewed.settled;
        expect(recoveredAgents.allInboxTurns.at(-1)?.split('[Open Inbox]')[0]).not.toContain(
          notice.id,
        );
        expect(recoveredAgents.started).toHaveLength(0);
        const continued = recoveredAgents.access!.request({
          sessionId: run.sessionId,
          mode: 'next-turn',
          text: 'Continue the cancelled work',
        });
        expect(continued).toMatchObject({ delivery: 'followup' });
        expect(recoveredAgents.resumed).toHaveLength(1);
        expect(recoveredAgents.resumed[0]!.text).toContain('did not finish cleanly');
        expect(recoveredAgents.resumed[0]!.text).toContain('Continue the cancelled work');
        await Promise.resolve();
        recoveredAgents.finish(run.sessionId);
        await recovered.whenIdle();
        expect(recovered.getAssignment('ada', run.sessionId)?.activity).toBe('idle');
      } finally {
        await recovered?.close();
        reopened?.close();
        await close();
      }
    },
  );

  it('preserves a failed Report without pairing it to successful native completion or replaying after restart', async () => {
    const { runtime, agents, owner, home, admit, close, channels, dmChannelId } = await setup();
    let reopened: ReturnType<typeof mountOperationalDatabase> | undefined;
    let recovered: BotRuntime | undefined;
    const coldAgents = new ManualAgents();
    try {
      await admit('Check the unavailable result', 'failed-semantic-start');
      agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Unavailable result',
      });
      const run = agents.started[0]!.run;
      await run.report({ state: 'failed', summary: 'Required input is unavailable' }, { turn: 1 });
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      const attention = createBotAttentionQuery(
        attachOperationalModule(owner, 'failed-semantic-before'),
        channels,
      );
      const reports = () =>
        attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.assignmentSessionId === run.sessionId);
      await vi.waitFor(() => expect(reports()[0]?.state).not.toBe('processing'));
      const before = reports();
      expect(before).toHaveLength(1);
      expect(before[0]).toMatchObject({
        sourceKind: 'assignment-report',
        assignmentReportState: 'failed',
        assignmentSessionId: run.sessionId,
        assignmentTurn: 1,
        authorKind: 'bot',
        state: 'open',
        summary: 'Required input is unavailable',
      });
      expect(agents.inboxTurns[0]).toContain(before[0]!.id);
      expect(agents.inboxTurns[0]).toContain('Required input is unavailable');
      run.completedTurn!({ turn: 1, endSeq: 30 });
      run.completedTurn!({ turn: 1, endSeq: 30 });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)).toMatchObject({
        activity: 'idle',
        latestReport: { state: 'failed', summary: 'Required input is unavailable' },
      });
      expect(
        attention
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.assignmentSessionId === run.sessionId),
      ).toEqual(before);
      expect(agents.inboxTurns).toHaveLength(1);
      await close();
      owner.close();
      reopened = trackTestOwner(
        mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      );
      recovered = createBotRuntime({
        database: reopened,
        registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
        channels,
        agents: coldAgents,
        grants: createTestWorkspaceGrants(reopened, home),
        now: FIXED_NOW,
      });
      await recovered.whenIdle();
      const after = createBotAttentionQuery(
        attachOperationalModule(reopened, 'failed-semantic-after'),
        channels,
      );
      expect(
        after
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.assignmentSessionId === run.sessionId),
      ).toEqual(before);
      expect(coldAgents.allInboxTurns).toHaveLength(0);
      expect(coldAgents.started).toHaveLength(0);
      const admission = recovered.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dmChannelId,
        messageId: 'failed-semantic-review',
        body: 'Review existing facts without new work',
      });
      if (!admission.admitted) throw new Error('Human message refused');
      await admission.settled;
      expect(
        after
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.assignmentSessionId === run.sessionId),
      ).toEqual(before);
      expect(coldAgents.inboxTurns).toHaveLength(0);
      expect(coldAgents.started).toHaveLength(0);
    } finally {
      coldAgents.finishAll();
      await recovered?.close();
      reopened?.close();
      await close();
      owner.close();
    }
  });

  it('does not infer completion pairing from a different Turn or progress-only run', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start', 'unpaired-start');
      agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Complete',
      });
      const run = agents.started[0]!.run;
      await run.report({ state: 'progress', summary: 'Still checking' }, { turn: 1 });
      run.completedTurn!({ turn: 1, endSeq: 20 });
      await run.report({ state: 'completed', summary: 'Verified' }, { turn: 2 });
      run.completedTurn!({ turn: 3, endSeq: 40 });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      expect(sourceEvents(owner).filter((e) => e.source_kind === 'assignment-lifecycle')).toEqual(
        [],
      );
      expect(agents.inboxTurns).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it('keeps a late paired notice pending through restart without a replay wake', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    await admit('Start', 'late-start');
    agents.access!.create({ title: 'Assignment', grantId: TEST_GRANT_ID, description: 'Complete' });
    const run = agents.started[0]!.run;
    await run.report({ state: 'completed', summary: 'Verified before settlement' }, { turn: 1 });
    await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
    run.completedTurn!({ turn: 1, endSeq: 24 });
    agents.finish(run.sessionId);
    await runtime.whenIdle();
    const noticeId = sourceEvents(owner).find(
      (e) => e.source_kind === 'assignment-lifecycle',
    )!.source_event_id;
    await close();
    owner.close();
    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopenedAgents = new ManualAgents();
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const reopenedRuntime = createBotRuntime({
      database: reopenedOwner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels,
      agents: reopenedAgents,
      now: FIXED_NOW,
    });
    try {
      await reopenedRuntime.whenIdle();
      expect(reopenedAgents.inboxTurns).toEqual([]);
      expect(
        createBotAttentionQuery(attachOperationalModule(reopenedOwner, 'late-query'), channels)
          .list({ botSlug: 'ada' })
          .items.find((i) => i.id === noticeId),
      ).toMatchObject({ state: 'pending' });
      const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const admission = reopenedRuntime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId: 'late-review',
        body: 'Review completion',
      });
      if (!admission.admitted) throw new Error('DM denied');
      await admission.settled;
      expect(reopenedAgents.allInboxTurns.at(-1)).toContain(noticeId);
      expect(
        createBotAttentionQuery(attachOperationalModule(reopenedOwner, 'late-result'), channels)
          .list({ botSlug: 'ada' })
          .items.find((i) => i.id === noticeId)?.state,
      ).toBe('open');
    } finally {
      await reopenedRuntime.close();
      reopenedOwner.close();
    }
  });
});
