import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRegistry } from './registry-fixture.js';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { backup, DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotAttentionQuery } from '../src/runtime/attention.js';
import { createBotRuntime, type BotRuntime } from '../src/runtime/bot-runtime.js';
import { FIXED_NOW, createTempRoot, trackTestOwner } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';
import { ManualAgents, sourceEvents, setup } from './assignment-collaboration-fixtures.js';

describe('Assignment collaboration', () => {
  it('starts parallel Assignments without blocking the Orchestrator turn', async () => {
    const { runtime, agents, admit, close } = await setup();
    await admit('请同时处理两件事', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const first = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 A 方向',
      key: 'research-a',
    });
    const second = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 B 方向',
      key: 'research-b',
    });

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('created');
    expect(agents.started.map((run) => run.description)).toEqual(
      expect.arrayContaining(['调研 A 方向', '调研 B 方向']),
    );
    expect(runtime.listAssignments('ada')).toHaveLength(2);
    await close();
  });

  it('reuses an idle keyed Assignment and refuses to steal a running key', async () => {
    const { runtime, agents, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    await agents.started[0]?.run.report({ state: 'completed', summary: 'A 方向完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('idle');

    const reused = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '继续调研 A 方向',
      key: 'research-a',
    });
    expect(reused.outcome).toBe('reused');
    expect(reused.outcome === 'reused' && reused.assignment.sessionId).toBe(sessionId);
    expect(agents.resumed).toEqual([{ sessionId, text: '继续调研 A 方向' }]);

    const busy = agents.access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '再次调研 A 方向',
      key: 'research-a',
    });
    expect(busy.outcome).toBe('key-busy');
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    await close();
  });

  it('stops a running Assignment, rejects late reports, and frees its continuity key', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    await admit('开始调研', 'human-stop');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '持续调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const runningTurn = agents.started[0]?.run;
    if (runningTurn === undefined) throw new Error('Assignment never started');

    const stopped = await access.stop(sessionId);
    expect(stopped.activity).toBe('stopped');
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopped');
    await expect(
      runningTurn.report({ state: 'completed', summary: '取消之后的迟到报告' }),
    ).rejects.toThrow('unavailable or stopping');
    expect(runtime.getAssignment('ada', sessionId)?.latestReport).toBeUndefined();
    expect((await access.stop(sessionId)).activity).toBe('stopped');

    const next = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '重新开始 A 方向',
      key: 'research-a',
    });
    expect(next.outcome).toBe('created');
    expect(next.outcome === 'created' && next.assignment.sessionId).not.toBe(sessionId);
    await close();
    const reopened = createBotRuntime({
      database: owner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: new ManualAgents(),
      now: FIXED_NOW,
    });
    expect(reopened.getAssignment('ada', sessionId)?.activity).toBe('stopped');
    await reopened.close();
  });

  it('resumes a Human-stopped Assignment when the Orchestrator sends it a request', async () => {
    const { runtime, agents, admit, close } = await setup();
    await admit('开始调研', 'human-stop-3725');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '持续调研 A 方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    if (agents.started[0]?.run === undefined) throw new Error('Assignment never started');

    const stopped = await runtime.stopSession!('ada', sessionId);
    expect(stopped.outcome).toBe('settled');
    if (stopped.outcome !== 'settled') throw new Error('stop refused');
    expect(stopped.stopped).toHaveLength(1);
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopped');

    const resumed = access.request({ sessionId, mode: 'next-turn', text: '继续' });
    expect(resumed.delivery).toBe('followup');
    expect(runtime.getAssignment('ada', sessionId)?.activity).not.toBe('stopped');
    await close();
  });

  it('delivers one Host-origin stop notice through the Bot Inbox', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    await admit('开始调研', 'human-stop-notice');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调查一个可以取消的方向',
      key: 'cancel-me',
    });
    if (created.outcome !== 'created') throw new Error('create failed');

    await access.stop(created.assignment.sessionId);
    await runtime.whenIdle();

    const notices = sourceEvents(owner).filter(
      (event) => event.source_kind === 'assignment-lifecycle',
    );
    expect(notices).toHaveLength(1);
    expect(notices[0]?.observed_at).not.toBeNull();
    expect(agents.inboxTurns).toHaveLength(1);
    expect(agents.inboxTurns[0]).toContain('Host lifecycle notice');
    expect(agents.inboxTurns[0]).toContain(created.assignment.sessionId);
    expect(agents.inboxTurns[0]).toContain('stopped');

    await access.stop(created.assignment.sessionId);
    await runtime.whenIdle();
    expect(
      sourceEvents(owner).filter((event) => event.source_kind === 'assignment-lifecycle'),
    ).toHaveLength(1);
    expect(agents.inboxTurns).toHaveLength(1);
    await close();
  });

  it('replays an unobserved stop notice after Host restart', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    await admit('开始调研', 'human-stop-notice-restart');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '等待停止的方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');

    agents.failInbox = 'before-side-effect';
    await access.stop(created.assignment.sessionId);
    await runtime.whenIdle();
    expect(
      sourceEvents(owner).filter((event) => event.source_kind === 'assignment-lifecycle'),
    ).toMatchObject([{ observed_at: null }]);
    await close();

    const replayAgents = new ManualAgents();
    replayAgents.factoryUnavailableCount = 1;
    const diagnostics: string[] = [];
    const reopened = createBotRuntime({
      database: owner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: replayAgents,
      warn: (message) => diagnostics.push(message),
      now: FIXED_NOW,
    });
    await vi.waitFor(async () => {
      await reopened.whenIdle();
      expect(replayAgents.inboxTurns).toHaveLength(1);
    });
    expect(replayAgents.inboxTurns).toHaveLength(1);
    expect(diagnostics.map((entry) => JSON.parse(entry).event)).toEqual([
      'inbox-factory-retry-scheduled',
      'inbox-factory-recovered',
    ]);
    expect(replayAgents.inboxTurns[0]).toContain('Host lifecycle notice');
    expect(replayAgents.inboxTurns[0]).toContain(created.assignment.sessionId);
    expect(
      sourceEvents(owner).filter((event) => event.source_kind === 'assignment-lifecycle'),
    ).toMatchObject([{ observed_at: FIXED_NOW().toISOString() }]);
    expect(
      attachOperationalModule(owner, 'startup-inbox-test').read(
        (database) =>
          database
            .prepare(
              "SELECT COUNT(*) AS count FROM source_events WHERE body LIKE 'Session failed:%'",
            )
            .get() as { count: number },
      ).count,
    ).toBe(0);
    await reopened.close();
  });

  it('keeps an interrupted stop notice visible for repair instead of replaying uncertain work', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    await admit('开始调研', 'human-stop-notice-interrupted');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '等待停止的方向',
    });
    if (created.outcome !== 'created') throw new Error('create failed');

    agents.failInbox = 'before-side-effect';
    await access.stop(created.assignment.sessionId);
    await runtime.whenIdle();
    const noticeId = sourceEvents(owner).find(
      (event) => event.source_kind === 'assignment-lifecycle',
    )?.source_event_id;
    if (noticeId === undefined) throw new Error('Stop notice missing');
    attachOperationalModule(owner, 'interrupted-stop-test').transaction((database) => {
      database
        .prepare('UPDATE source_events SET observed_at = ? WHERE source_event_id = ?')
        .run(FIXED_NOW().toISOString(), noticeId);
      database
        .prepare(`UPDATE inbox_admissions SET observed_at = ?, attempt_state = 'running'
                  WHERE source_event_id = ?`)
        .run(FIXED_NOW().toISOString(), noticeId);
    });
    await close();

    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const replayAgents = new ManualAgents();
    const reopened = createBotRuntime({
      database: owner,
      registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels,
      agents: replayAgents,
      now: FIXED_NOW,
    });
    try {
      await reopened.whenIdle();
      expect(replayAgents.inboxTurns).toHaveLength(0);
      expect(
        createBotAttentionQuery(attachOperationalModule(owner, 'interrupted-stop-query'), channels)
          .list({ botSlug: 'ada' })
          .items.find((item) => item.id === noticeId),
      ).toMatchObject({ state: 'needs-repair', sourceKind: 'assignment-lifecycle' });
    } finally {
      await reopened.close();
    }
  });

  it('keeps a stopping Assignment reserved when DSH stop rejects, then releases it on retry', async () => {
    const { runtime, agents, owner, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    await admit('开始调研', 'human-stop-failure');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '可复用的事项',
      key: 'stopping-key',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('idle');

    agents.failNextStop = true;
    await expect(access.stop(sessionId)).rejects.toThrow('DSH stop failed');
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopping');
    expect(
      sourceEvents(owner).filter((event) => event.source_kind === 'assignment-lifecycle'),
    ).toHaveLength(0);
    expect(
      access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: '不得复用停止中的续接键',
        key: 'stopping-key',
      }).outcome,
    ).toBe('key-busy');
    expect(
      access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: '不得抢占停止中的名额',
      }).outcome,
    ).toBe('capacity');

    expect((await access.stop(sessionId)).activity).toBe('stopped');
    expect(
      access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: '停止完成后可新建',
      }).outcome,
    ).toBe('created');
    await close();
  });
  it('revocation blocks new and resumed work without rewriting an already running turn', async () => {
    const { runtime, grants, agents, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      title: 'Assignment',
      grantId: TEST_GRANT_ID,
      description: '调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const permission = runtime.getAssignment('ada', sessionId)?.permission;
    expect(permission?.mode).toBe('workspace-write');

    grants.revoke('ada', TEST_GRANT_ID);
    expect(() =>
      access.create({ title: 'Assignment', grantId: TEST_GRANT_ID, description: '新方向' }),
    ).toThrow(/missing or revoked/);
    expect(() => access.request({ sessionId, mode: 'next-turn', text: '继续' })).toThrow(
      /missing or revoked/,
    );
    expect(() =>
      access.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: '继续',
        key: 'research-a',
      }),
    ).toThrow(/missing or revoked/);
    expect(runtime.getAssignment('ada', sessionId)?.permission).toEqual(permission);

    await agents.started[0]!.run.report({ state: 'completed', summary: '已运行的事项完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.latestReport?.summary).toBe('已运行的事项完成');
    await close();
  });

  it.each([
    [true, false],
    [false, false],
    [false, true],
  ])(
    'admits one recovery Notice from a real working snapshot (progress Report: %s, approval wait: %s) without Assignment replay',
    async (hasReport, approvalWait) => {
      const { runtime, owner, home, agents, admit, close, dmChannelId, channels } = await setup({
        assignmentConcurrencyLimit: 1,
      });
      const coldHome = createTempRoot('botharness-active-assignment-snapshot-');
      let recovered: BotRuntime | undefined;
      let reopened: ReturnType<typeof mountOperationalDatabase> | undefined;
      const coldAgents = new ManualAgents();
      try {
        await admit('Start one direction', 'active-crash-start');
        const created = agents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Unfinished investigation',
          key: 'unfinished-direction',
        });
        if (created.outcome !== 'created') throw new Error('Assignment was not created');
        const sessionId = created.assignment.sessionId;
        const run = agents.started[0]!.run;
        if (approvalWait) {
          expect(
            runtime.beginAssignmentApprovalWait!(
              sessionId,
              'interrupted-call',
              new AbortController().signal,
            ),
          ).toBeDefined();
          expect(runtime.getAssignment('ada', sessionId)?.executionWait).toBe('waiting-human');
        }
        if (hasReport)
          await run.report(
            { state: 'progress', summary: 'Evidence retained before interruption' },
            { turn: 1 },
          );
        expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('working');
        const before = createBotAttentionQuery(
          attachOperationalModule(owner, 'active-crash-before'),
          channels,
        )
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.assignmentSessionId === sessionId);
        expect(before).toHaveLength(hasReport ? 1 : 0);
        if (hasReport) expect(before[0]?.state).toBe('pending');
        const snapshotPath = join(coldHome, 'botharness', 'botharness.db');
        mkdirSync(dirname(snapshotPath), { recursive: true });
        const snapshotReader = new DatabaseSync(owner.databasePath, { readOnly: true });
        try {
          await backup(snapshotReader, snapshotPath);
        } finally {
          snapshotReader.close();
        }
        await close();
        reopened = trackTestOwner(
          mountOperationalDatabase({ dshHome: coldHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
        );
        const coldGrants = createTestWorkspaceGrants(reopened, home);
        recovered = createBotRuntime({
          database: reopened,
          registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
          channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
          agents: coldAgents,
          grants: coldGrants,
          now: FIXED_NOW,
          assignmentConcurrencyLimit: 1,
        });
        await recovered.whenIdle();
        expect(recovered.getAssignment('ada', sessionId)).toMatchObject({
          sessionId,
          activity: 'error',
        });
        expect(recovered.getAssignment('ada', sessionId)?.continuityKey).toBe(
          'unfinished-direction',
        );
        expect(recovered.getAssignment('ada', sessionId)?.executionWait).toBeUndefined();
        const after = createBotAttentionQuery(
          attachOperationalModule(reopened, 'active-crash-after'),
          channels,
        )
          .list({ botSlug: 'ada' })
          .items.filter((item) => item.assignmentSessionId === sessionId);
        expect(after).toHaveLength(hasReport ? 2 : 1);
        const notice = after.find((i) => i.sourceKind === 'assignment-lifecycle')!;
        if (hasReport)
          expect(after.find((i) => i.id === before[0]!.id)).toMatchObject({
            ...before[0],
            state: 'open',
          });
        expect(notice).toMatchObject({
          authorKind: 'system',
          state: 'open',
          sourceAvailable: true,
        });
        expect(notice.assignmentTurn).toBeUndefined();
        expect(notice.relatedReportSourceEventId).toBeUndefined();
        expect(notice.summary).toContain('prior execution outcome is unconfirmed');
        const payload = attachOperationalModule(reopened, 'recovery-notice-payload').read((db) =>
          db
            .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
            .get(notice.id),
        ) as { payload_json: string };
        expect(JSON.parse(payload.payload_json)).toEqual({
          author: { kind: 'system' },
          assignmentLifecycle: { state: 'interrupted', cause: 'host-recovery' },
        });
        expect(coldAgents.started).toHaveLength(0);
        expect(coldAgents.resumed).toHaveLength(0);
        expect(coldAgents.inboxTurns).toHaveLength(1);
        expect(coldAgents.inboxTurns[0]).toContain(
          'Host lifecycle notice [Source Event ' + notice.id,
        );
        await recovered.close();
        reopened.close();
        reopened = trackTestOwner(
          mountOperationalDatabase({ dshHome: coldHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
        );
        const secondAgents = new ManualAgents();
        recovered = createBotRuntime({
          database: reopened,
          registry: createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
          channels,
          agents: secondAgents,
          grants: createTestWorkspaceGrants(reopened, home),
          now: FIXED_NOW,
          assignmentConcurrencyLimit: 1,
        });
        await recovered.whenIdle();
        expect(
          createBotAttentionQuery(
            attachOperationalModule(reopened, 'recovery-second-restart'),
            channels,
          )
            .list({ botSlug: 'ada' })
            .items.filter((i) => i.assignmentSessionId === sessionId),
        ).toEqual(after);
        expect(secondAgents.inboxTurns).toHaveLength(0);
        expect(secondAgents.started).toHaveLength(0);
        const admission = recovered.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dmChannelId,
          messageId: 'explicit-replacement',
          body: 'Start replacement work',
        });
        if (!admission.admitted) throw new Error('Human message refused');
        await admission.settled;
        const continued = secondAgents.access!.create({
          title: 'Assignment',
          grantId: TEST_GRANT_ID,
          description: 'Resume crashed work',
          key: 'unfinished-direction',
        });
        expect(continued).toMatchObject({ outcome: 'reused', assignment: { sessionId } });
        expect(secondAgents.resumed).toHaveLength(1);
        expect(secondAgents.resumed[0]!.text).toContain('did not finish cleanly');
        await Promise.resolve();
        secondAgents.finishAll();
        await recovered.whenIdle();
        expect(recovered.getAssignment('ada', sessionId)?.activity).toBe('idle');
      } finally {
        coldAgents.finishAll();
        await recovered?.close();
        reopened?.close();
        await close();
        owner.close();
      }
    },
  );
});
