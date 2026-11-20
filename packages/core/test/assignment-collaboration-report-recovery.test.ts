import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRegistry } from './registry-fixture.js';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotAttentionQuery } from '../src/runtime/attention.js';
import { createBotSourcePolicyStore } from '../src/runtime/source-policy.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import { createBotRuntime } from '../src/runtime/bot-runtime.js';
import { FIXED_NOW } from './helpers.js';
import { TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { ManualAgents, sourceEvents, setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it.each([
    [1, 'addressed'],
    [3, 'addressed'],
    [1, 'keyed'],
    [3, 'keyed'],
  ] as const)(
    'refuses an idle %s-slot %s wake without changing its ask or snapshot',
    async (limit, path) => {
      const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: limit });
      try {
        await admit('Start capacity test', 'human-capacity');
        const access = agents.access!;
        const idle = access.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Choose route',
          key: 'capacity-idle',
        });
        if (idle.outcome !== 'created') throw new Error('Idle Assignment missing');
        await agents.started[0]!.run.report({
          state: 'waiting-human',
          summary: 'Choose A or B',
          expectsReply: true,
        });
        agents.finish(idle.assignment.sessionId);
        await runtime.whenIdle();
        const before = runtime.getAssignment('ada', idle.assignment.sessionId)!;
        const activeIds: string[] = [];
        for (let index = 0; index < limit; index++) {
          const other = access.create({
            title: 'Assignment',
            grantId: TEST_GRANT_ID,
            description: `Other work ${index}`,
          });
          if (other.outcome !== 'created') throw new Error('Capacity fixture missing');
          activeIds.push(other.assignment.sessionId);
        }
        const refused =
          path === 'keyed'
            ? access.create({
                title: 'Assignment',
                grantId: TEST_GRANT_ID,
                description: 'Continue route',
                key: 'capacity-idle',
              })
            : access.request({
                sessionId: before.sessionId,
                mode: 'next-turn',
                text: 'Choose A',
                answerTo: before.openAsk!.sourceEventId,
              });
        expect(refused).toMatchObject({
          outcome: 'capacity',
          code: 'assignment-capacity',
          activeCount: limit,
          limit,
          retryable: true,
        });
        expect(runtime.getAssignment('ada', before.sessionId)).toEqual(before);
        expect(agents.resumed).toEqual([]);
        expect(runtime.listAssignments('ada')).toHaveLength(limit + 1);
        agents.finish(activeIds[0]!);
        await vi.waitFor(() =>
          expect(runtime.getAssignment('ada', activeIds[0]!)?.activity).toBe('idle'),
        );
        const resumed = access.request({
          sessionId: before.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: before.openAsk!.sourceEventId,
        });
        expect(resumed.delivery).toBe('followup');
        expect(agents.resumed).toEqual([{ sessionId: before.sessionId, text: 'Choose A' }]);
        await Promise.resolve();
        expect(runtime.getAssignment('ada', before.sessionId)?.openAsk).toBeUndefined();
        expect(runtime.getAssignment('ada', before.sessionId)?.permission).toEqual(
          before.permission,
        );
      } finally {
        await close();
      }
    },
  );

  it('applies an edited Assignment report wake only to later Admissions', async () => {
    const { agents, owner, admit, close } = await setup();
    try {
      await admit('Start research', 'human-policy-edit');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const run = agents.started[0]!.run;
      await run.report({ state: 'progress', summary: 'First quiet progress' });
      expect(agents.inboxTurns).toEqual([]);
      const policy = createBotSourcePolicyStore(
        attachOperationalModule(owner, 'bot-inbox'),
        FIXED_NOW,
      );
      expect(policy.setAssignmentReport('ada', 'immediate', { kind: 'human' })).toMatchObject({
        revision: 2,
        wake: 'immediate',
      });
      await run.report({ state: 'progress', summary: 'Second waking progress' });
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      expect(agents.inboxTurns).toHaveLength(1);
      expect(agents.inboxTurns[0]).toContain('Second waking progress');
      const snapshots = attachOperationalModule(owner, 'assignment-policy-snapshots').read((db) =>
        db
          .prepare(`
          SELECT a.source_policy_revision, a.source_policy_wake_mode
            FROM inbox_admissions a JOIN source_events e
              ON e.source_event_id = a.source_event_id
           WHERE a.bot_slug = 'ada' AND a.reason = 'assignment-report'
           ORDER BY e.created_at, e.rowid
        `)
          .all(),
      );
      expect(snapshots).toMatchObject([
        { source_policy_revision: 1, source_policy_wake_mode: 'conditional' },
        { source_policy_revision: 2, source_policy_wake_mode: 'immediate' },
      ]);
      expect(
        policy.list('ada').find((rule) => rule.sourceClass === 'assignment-report'),
      ).toMatchObject({ recentWakeCount: 1 });
    } finally {
      await close();
    }
  });
  it('recovers an unobserved due report once after restart', async () => {
    const { agents, owner, home, admit, close } = await setup();
    await admit('Start research', 'human-1');
    const created = agents.access!.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: 'Research',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const run = agents.started[0]!.run;
    await run.report({ state: 'progress', summary: 'Phase one' });
    const reportId = sourceEvents(owner).find(
      (row) => row.source_kind === 'assignment-report',
    )!.source_event_id;
    const testDatabase = attachOperationalModule(owner, 'report-recovery-test');
    testDatabase.transaction((db) => {
      db.prepare(`
        UPDATE source_events
           SET payload_json = ?, expects_reply = 1
         WHERE source_event_id = ?
      `).run(JSON.stringify({ assignmentReport: { state: 'completed' } }), reportId);
    });
    await close();
    owner.close();

    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopenedAgents = new ManualAgents();
    const reopenedChannels = createChannelStore({
      rootDir: join(home, 'channels'),
      now: FIXED_NOW,
    });
    const reopenedRuntime = createBotRuntime({
      database: reopenedOwner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: reopenedChannels,
      agents: reopenedAgents,
      now: FIXED_NOW,
    });
    try {
      await reopenedRuntime.whenIdle();
      expect(reopenedAgents.inboxTurns).toHaveLength(1);
      expect(reopenedAgents.inboxTurns[0]).toContain('Phase one');
      const attention = createBotAttentionQuery(
        attachOperationalModule(reopenedOwner, 'report-recovery-query'),
        reopenedChannels,
      );
      expect(
        attention.list({ botSlug: 'ada' }).items.find((item) => item.id === reportId),
      ).toMatchObject({
        state: 'open',
        assignmentReportState: 'completed',
      });
    } finally {
      await reopenedRuntime.close();
      reopenedOwner.close();
    }
  });

  it.each(['before-side-effect', 'after-side-effect'] as const)(
    'tracks every collected report when an Inbox turn fails %s',
    async (failure) => {
      const { runtime, agents, owner, admit, close } = await setup();
      try {
        await admit('Start research', 'human-1');
        const created = agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Research',
        });
        if (created.outcome !== 'created') throw new Error('create failed');
        const run = agents.started[0]!.run;
        agents.failInbox = failure;
        await run.report({ state: 'progress', summary: 'First report' });
        await run.report({ state: 'completed', summary: 'Second report' });
        agents.finish(created.assignment.sessionId);
        await runtime.whenIdle();
        const rows = attachOperationalModule(owner, 'multi-report-recovery-test').read(
          (db) =>
            db
              .prepare(`
              SELECT a.attempt_state, a.side_effect_started_at, e.observed_at
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE a.reason = 'assignment-report'
               ORDER BY e.body
            `)
              .all() as Array<{
              attempt_state: string;
              side_effect_started_at: string | null;
              observed_at: string | null;
            }>,
        );
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.attempt_state)).toEqual([
          failure === 'after-side-effect' ? 'needs-repair' : 'retryable',
          failure === 'after-side-effect' ? 'needs-repair' : 'retryable',
        ]);
        expect(rows.every((row) => row.observed_at === null)).toBe(true);
        expect(rows.every((row) => row.side_effect_started_at !== null)).toBe(
          failure === 'after-side-effect',
        );
      } finally {
        await close();
      }
    },
  );

  it('keeps an ignored completed report hidden until the same Assignment reports again', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    let nextReportId = '';
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
        key: 'research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      await agents.started[0]!.run.report({ state: 'completed', summary: 'First result' });
      agents.finish(sessionId);
      await runtime.whenIdle();

      const port = attachOperationalModule(owner, 'human-report-decision-test');
      const query = createHumanAttentionQuery(port);
      const decisions = createHumanAttentionDecisions(port, FIXED_NOW);
      const first = query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items;
      expect(first).toMatchObject([
        {
          kind: 'assignment-report',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'First result',
        },
      ]);
      const firstReportId = first[0]?.sourceEventId;
      if (firstReportId === undefined) throw new Error('report source missing');
      expect(decisions.ignoreAssignmentReport(OWNER_HUMAN_CONTEXT, firstReportId)).toBe(true);
      expect(decisions.ignoreAssignmentReport(OWNER_HUMAN_CONTEXT, firstReportId)).toBe(true);
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items).toEqual([]);

      const reused = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Continue research',
        key: 'research',
      });
      if (reused.outcome !== 'reused') throw new Error('Assignment was not reused');
      await agents.started.at(-1)!.run.report({ state: 'completed', summary: 'New result' });
      agents.finish(sessionId);
      await runtime.whenIdle();
      const next = query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items;
      expect(next).toMatchObject([
        {
          kind: 'assignment-report',
          assignmentSessionId: sessionId,
          summary: 'New result',
        },
      ]);
      nextReportId = next[0]?.sourceEventId ?? '';
      expect(nextReportId).not.toBe(firstReportId);
      expect(decisions.ignoreAssignmentReport(OWNER_HUMAN_CONTEXT, firstReportId)).toBe(false);
      expect(
        query.list(OWNER_HUMAN_CONTEXT, { category: 'info', channelId: 'dm-ada' }).items,
      ).toEqual([]);
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
        attachOperationalModule(reopened, 'human-report-restart'),
      );
      expect(query.list(OWNER_HUMAN_CONTEXT, { category: 'info' }).items[0]?.sourceEventId).toBe(
        nextReportId,
      );
    } finally {
      reopened.close();
    }
  });

  it('retains failed report repair across restart and excludes it from later Human harvests', async () => {
    const { runtime, agents, owner, home, channels, admit, close } = await setup();
    let repairSourceId = '';
    let repairSource;
    try {
      await admit('Start research', 'human-start');
      const created = agents.access!.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const run = agents.started[0]!.run;
      await run.report({ state: 'progress', summary: 'Report needing review' });
      vi.spyOn(agents, 'runOrchestrator').mockImplementationOnce(async (turn) => {
        expect(turn.inbox).toContain('Report needing review');
        await turn.channels.send({ body: 'Report read; execution interrupted' });
        throw new Error('Orchestrator interrupted after Channel side effect');
      });
      await expect(admit('Read the current report', 'human-read')).rejects.toThrow(
        'Orchestrator interrupted after Channel side effect',
      );
      const attention = createBotAttentionQuery(
        attachOperationalModule(owner, 'failed-report-repair-query'),
        channels,
      );
      repairSource = attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'assignment-report');
      expect(repairSource).toMatchObject({
        state: 'needs-repair',
        summary: 'Report needing review',
        sourceAvailable: true,
      });
      repairSourceId = repairSource!.id;
      expect(repairSource!.handledAt).toBeUndefined();
      await run.report({ state: 'progress', summary: 'Later informational update' });
      agents.finish(created.assignment.sessionId);
      await runtime.whenIdle();
    } finally {
      await close();
      owner.close();
    }

    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopenedAgents = new ManualAgents();
    const reopenedChannels = createChannelStore({
      rootDir: join(home, 'channels'),
      now: FIXED_NOW,
    });
    const reopenedRuntime = createBotRuntime({
      database: reopenedOwner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: reopenedChannels,
      agents: reopenedAgents,
      now: FIXED_NOW,
    });
    try {
      await reopenedRuntime.whenIdle();
      expect(reopenedAgents.allInboxTurns).toEqual([]);
      const attention = createBotAttentionQuery(
        attachOperationalModule(reopenedOwner, 'failed-report-repair-reopened'),
        reopenedChannels,
      );
      expect(
        attention.list({ botSlug: 'ada' }).items.find((item) => item.id === repairSourceId),
      ).toEqual(repairSource);
      const admission = reopenedRuntime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: reopenedChannels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id,
        messageId: 'human-after-restart',
        body: 'Read the new information',
      });
      if (!admission.admitted) throw new Error('admission rejected');
      await admission.settled;
      expect(reopenedAgents.allInboxTurns).toHaveLength(1);
      expect(reopenedAgents.allInboxTurns[0]).toContain('Later informational update');
      expect(reopenedAgents.allInboxTurns[0]).not.toContain('Report needing review');
      const final = attention.list({ botSlug: 'ada' }).items;
      expect(final.find((item) => item.id === repairSourceId)).toEqual(repairSource);
      expect(final.find((item) => item.summary === 'Later informational update')).toMatchObject({
        state: 'open',
      });
    } finally {
      await reopenedRuntime.close();
      reopenedOwner.close();
    }
  });

  it('shows an interrupted observed report as needs-repair instead of waking it twice', async () => {
    const { agents, owner, home, admit, close } = await setup();
    await admit('Start research', 'human-1');
    const created = agents.access!.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: 'Research',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    await agents.started[0]!.run.report({ state: 'progress', summary: 'Read this report' });
    const reportId = sourceEvents(owner).find(
      (row) => row.source_kind === 'assignment-report',
    )!.source_event_id;
    attachOperationalModule(owner, 'report-interruption-test').transaction((db) => {
      db.prepare('UPDATE source_events SET observed_at = ? WHERE source_event_id = ?').run(
        FIXED_NOW().toISOString(),
        reportId,
      );
      db.prepare(`
        UPDATE inbox_admissions SET observed_at = ?, attempt_state = 'running'
         WHERE source_event_id = ? AND bot_slug = 'ada'
      `).run(FIXED_NOW().toISOString(), reportId);
    });
    await close();
    owner.close();

    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopenedAgents = new ManualAgents();
    const reopenedChannels = createChannelStore({
      rootDir: join(home, 'channels'),
      now: FIXED_NOW,
    });
    const reopenedRuntime = createBotRuntime({
      database: reopenedOwner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: reopenedChannels,
      agents: reopenedAgents,
      now: FIXED_NOW,
    });
    try {
      await reopenedRuntime.whenIdle();
      expect(reopenedAgents.inboxTurns).toHaveLength(0);
      const attention = createBotAttentionQuery(
        attachOperationalModule(reopenedOwner, 'report-interruption-query'),
        reopenedChannels,
      );
      expect(
        attention.list({ botSlug: 'ada' }).items.find((item) => item.id === reportId),
      ).toMatchObject({
        state: 'needs-repair',
        observedAt: FIXED_NOW().toISOString(),
      });
    } finally {
      await reopenedRuntime.close();
      reopenedOwner.close();
    }
  });
});
