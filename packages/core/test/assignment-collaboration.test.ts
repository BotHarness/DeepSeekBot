import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { AssignmentInboxAcceptanceUncertainError } from '../src/runtime/assignment-delivery.js';
import { join, dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { backup, DatabaseSync } from 'node:sqlite';

import { describe, expect, it, vi } from 'vitest';

import { createChannelStore } from '../src/channels/store.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotAttentionQuery } from '../src/runtime/attention.js';
import { createBotSourcePolicyStore } from '../src/runtime/source-policy.js';
import { readAssignmentReportPage } from '../src/runtime/assignment-tail.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import {
  createBotRuntime,
  type AssignmentAgentRun,
  type AssignmentRequestDelivery,
  type BotAgentAdapter,
  type BotRuntime,
  type OrchestratorAgentRun,
  type OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { FIXED_NOW, createTempRoot, trackTestOwner } from './helpers.js';
import type { WorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

class ManualAgents implements BotAgentAdapter {
  readonly started: Array<{ sessionId: string; purpose: string; run: AssignmentAgentRun }> = [];
  readonly resumed: Array<{ sessionId: string; text: string }> = [];
  readonly inboxTurns: string[] = [];
  readonly allInboxTurns: string[] = [];
  access: OrchestratorAssignmentAccess | undefined;
  failNextStop = false;
  failInbox: 'before-side-effect' | 'after-side-effect' | undefined;
  factoryUnavailableCount = 0;
  readonly #finish = new Map<string, () => void>();

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.access = run.assignments;
    this.allInboxTurns.push(run.inbox);
    if (run.message.trim().length > 0) return;
    if (this.factoryUnavailableCount > 0) {
      this.factoryUnavailableCount -= 1;
      throw new Error('no agent factory registered (load an agent-loop plugin)');
    }
    if (this.failInbox === 'after-side-effect') {
      const created = run.assignments.create({ grantId: TEST_GRANT_ID, purpose: 'Follow-up work' });
      if (created.outcome === 'created') this.finish(created.assignment.sessionId);
    }
    if (this.failInbox !== undefined) throw new Error('Inbox turn failed');
    this.inboxTurns.push(run.inbox);
  }

  runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.started.push({ sessionId: run.sessionId, purpose: run.purpose, run });
    return new Promise<void>((resolve) => this.#finish.set(run.sessionId, resolve));
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    this.resumed.push({ sessionId: run.sessionId, text: run.purpose });
    this.started.push({ sessionId: run.sessionId, purpose: run.purpose, run });
    return {
      delivery: 'followup',
      accepted: Promise.resolve(),
      done: new Promise<void>((resolve) => this.#finish.set(run.sessionId, resolve)),
    };
  }

  finish(sessionId: string): void {
    this.#finish.get(sessionId)?.();
    this.#finish.delete(sessionId);
  }

  finishAll(): void {
    for (const resolve of this.#finish.values()) resolve();
    this.#finish.clear();
  }

  async stopAssignment(sessionId: string): Promise<void> {
    if (this.failNextStop) {
      this.failNextStop = false;
      throw new Error('DSH stop failed');
    }
    this.finish(sessionId);
  }

  async close(): Promise<void> {}
}

function sourceEvents(owner: ReturnType<typeof mountOperationalDatabase>): Array<{
  source_event_id: string;
  source_kind: string;
  observed_at: string | null;
  expects_reply: number;
}> {
  return attachOperationalModule(owner, 'collaboration-test').read((database) =>
    database
      .prepare(
        `SELECT source_event_id, source_kind, observed_at, expects_reply FROM source_events
          ORDER BY rowid`,
      )
      .all(),
  ) as Array<{
    source_event_id: string;
    source_kind: string;
    observed_at: string | null;
    expects_reply: number;
  }>;
}

async function setup(
  options: {
    assignmentConcurrencyLimit?: number | (() => number);
    saveReportSpill?: (input: {
      sessionId: string;
      content: string;
    }) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;
    readAssignmentTail?: (sessionId: string) => Promise<{
      events: Array<{ seq: number; type: string; text: string; truncated: boolean }>;
      indexedEvents: number;
      readCount: number;
      sourceEventBytes: number;
      returnedCharacters: number;
      estimatedTokens: number;
    }>;
    readAssignmentReportPage?: (
      sessionId: string,
      acceptedSummary: string,
      offset: number,
    ) => Promise<{
      text: string;
      offset: number;
      nextOffset?: number;
      totalCharacters: number;
      matchedEvents: number;
      readCount: number;
      sourceEventBytes: number;
      returnedCharacters: number;
      estimatedTokens: number;
    }>;
  } = {},
): Promise<{
  runtime: BotRuntime;
  grants: WorkspaceGrantStore;
  agents: ManualAgents;
  owner: ReturnType<typeof mountOperationalDatabase>;
  channels: ReturnType<typeof createChannelStore>;
  home: string;
  admit: (body: string, messageId: string) => Promise<void>;
  close: () => Promise<void>;
  dmChannelId: string;
}> {
  const home = createTempRoot('botharness-assignment-collaboration-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  trackTestOwner(registryDatabase(join(home, 'bots')));
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('DM missing');
  const agents = new ManualAgents();
  const grants = createTestWorkspaceGrants(owner, home);
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    agents,
    grants,
    ...(options.saveReportSpill === undefined ? {} : { saveReportSpill: options.saveReportSpill }),
    ...(options.readAssignmentTail === undefined
      ? {}
      : { readAssignmentTail: options.readAssignmentTail }),
    ...(options.readAssignmentReportPage === undefined
      ? {}
      : { readAssignmentReportPage: options.readAssignmentReportPage }),
    now: FIXED_NOW,
    ...(options.assignmentConcurrencyLimit === undefined
      ? {}
      : { assignmentConcurrencyLimit: options.assignmentConcurrencyLimit }),
  });
  return {
    runtime,
    grants,
    agents,
    owner,
    channels,
    home,
    close: async () => {
      agents.finishAll();
      await runtime.whenIdle();
      await runtime.close();
    },
    dmChannelId: dm.id,
    admit: async (body: string, messageId: string) => {
      const admission = runtime.admitDmMessage({ channelId: dm.id, messageId, body });
      if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
      await admission.settled;
    },
  };
}

describe('Assignment collaboration', () => {
  it('admits real runtime work during a native approval wait and gates the original resumption', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    try {
      await admit('Start', 'capacity-start');
      const original = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Original' });
      if (original.outcome !== 'created') throw new Error('Original missing');
      const signal = new AbortController().signal;
      const wait = runtime.beginAssignmentApprovalWait!(
        original.assignment.sessionId,
        'call',
        signal,
      )!;
      expect(runtime.getAssignment('ada', original.assignment.sessionId)?.executionWait).toBe(
        'waiting-human',
      );
      await admit('Unrelated conversation', 'capacity-unrelated');
      const other = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Other work' });
      if (other.outcome !== 'created') throw new Error('Other missing');
      expect(agents.started).toHaveLength(2);
      expect(agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Overflow' }).outcome).toBe(
        'capacity',
      );
      const resumed = vi.fn();
      const resume = wait.resume().then(resumed);
      await Promise.resolve();
      expect(resumed).not.toHaveBeenCalled();
      expect(runtime.getAssignment('ada', original.assignment.sessionId)?.executionWait).toBe(
        'waiting-capacity',
      );
      agents.finish(other.assignment.sessionId);
      await resume;
      wait.release();
      const effect = vi.fn(async () => 'original result');
      await expect(
        runtime.runAssignmentTool!(original.assignment.sessionId, 'call', Symbol(), signal, effect),
      ).resolves.toBe('original result');
      expect(effect).toHaveBeenCalledTimes(1);
      expect(
        runtime.getAssignment('ada', original.assignment.sessionId)?.executionWait,
      ).toBeUndefined();
      expect(agents.started).toHaveLength(2);
    } finally {
      await close();
    }
  });

  it('refuses an approved original call after its Grant is revoked while capacity is occupied', async () => {
    const { runtime, agents, grants, admit, close } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    try {
      await admit('Start', 'capacity-revoke');
      const original = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Original' });
      if (original.outcome !== 'created') throw new Error('Original missing');
      const signal = new AbortController().signal;
      const wait = runtime.beginAssignmentApprovalWait!(
        original.assignment.sessionId,
        'call',
        signal,
      )!;
      agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Competitor' });
      const refused = expect(wait.resume()).rejects.toThrow('authority');
      grants.revoke('ada', TEST_GRANT_ID);
      await refused;
      wait.release();
      const effect = vi.fn(async () => undefined);
      await expect(
        runtime.runAssignmentTool!(original.assignment.sessionId, 'call', Symbol(), signal, effect),
      ).rejects.toThrow('authority');
      expect(effect).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it('retains two causally linked sources without a second completed wake', async () => {
    const { runtime, agents, owner, admit, close, channels } = await setup();
    try {
      await admit('Start', 'completion-start');
      agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Complete' });
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

  it('keeps Report meaning alongside a paired Host completion in one harvest', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start', 'paired-start');
      agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Complete' });
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
          grantId: TEST_GRANT_ID,
          purpose: 'Cancelled work',
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
        expect(runtime.getAssignment('ada', run.sessionId)?.continuityKey).toBeUndefined();
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
        const reviewed = recovered.admitDmMessage({
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
      agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Unavailable result' });
      const run = agents.started[0]!.run;
      await run.report({ state: 'failed', summary: 'Required input is unavailable' }, { turn: 1 });
      await vi.waitFor(() => expect(agents.inboxTurns).toHaveLength(1));
      const attention = createBotAttentionQuery(
        attachOperationalModule(owner, 'failed-semantic-before'),
        channels,
      );
      const before = attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.assignmentSessionId === run.sessionId);
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
      const admission = recovered.admitDmMessage({
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
      agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Complete' });
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
    agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Complete' });
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
      const dm = channels.getOrCreateDm('ada', 'Ada')!;
      const admission = reopenedRuntime.admitDmMessage({
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

  it('applies a live limit to create and wake without cancelling existing work', async () => {
    let limit = 3;
    const { runtime, agents, admit, close } = await setup({
      assignmentConcurrencyLimit: () => limit,
    });
    try {
      await admit('Start', 'human-live-limit');
      const access = agents.access!;
      const a = access.create({ grantId: TEST_GRANT_ID, purpose: 'idle A', key: 'live-A' });
      if (a.outcome !== 'created') throw new Error('A missing');
      await agents.started[0]!.run.report({
        state: 'waiting-human',
        summary: 'Need decision',
        expectsReply: true,
      });
      agents.finish(a.assignment.sessionId);
      await runtime.whenIdle();
      for (const purpose of ['B', 'C'])
        expect(access.create({ grantId: TEST_GRANT_ID, purpose }).outcome).toBe('created');
      const before = runtime.getAssignment('ada', a.assignment.sessionId);
      limit = 1;
      expect(access.create({ grantId: TEST_GRANT_ID, purpose: 'denied' })).toMatchObject({
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
        access.create({ grantId: TEST_GRANT_ID, purpose: 'reuse A', key: 'live-A' }),
      ).toMatchObject({ outcome: 'reused', assignment: { sessionId: a.assignment.sessionId } });
      expect(access.create({ grantId: TEST_GRANT_ID, purpose: 'denied again' })).toMatchObject({
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
      grantId: TEST_GRANT_ID,
      purpose: 'Choose a route',
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
      const admission = reopened.admitDmMessage({
        channelId: dmChannelId,
        messageId: 'human-cold-resume',
        body: 'Resume',
      });
      if (!admission.admitted) throw new Error('Cold admission missing');
      await admission.settled;
      const access = coldAgents.access!;
      expect(access.create({ grantId: TEST_GRANT_ID, purpose: 'Active work' }).outcome).toBe(
        'created',
      );
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

  it('keeps the original question after synchronous answer delivery refuses', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      await admit('Start', 'human-answer-refusal');
      const access = agents.access!;
      const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Choose a direction' });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      await agents.started[0]!.run.report({
        state: 'waiting-human',
        summary: 'Choose A or B',
        expectsReply: true,
      });
      agents.finish(created.assignment.sessionId);
      await runtime.whenIdle();
      const before = runtime.getAssignment('ada', created.assignment.sessionId)!;
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        throw new Error('Inbox unavailable');
      });
      expect(() =>
        access.request({
          sessionId: before.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: before.openAsk!.sourceEventId,
        }),
      ).toThrow('Inbox unavailable');
      expect(runtime.getAssignment('ada', before.sessionId)).toEqual(before);
    } finally {
      await close();
    }
  });

  it.each([false, true])(
    'preserves delayed delivery refusal and distinguishes uncertainty=%s',
    async (uncertain) => {
      const { runtime, agents, owner, admit, close } = await setup();
      try {
        await admit('Start', 'human-delayed-refusal');
        const access = agents.access!;
        const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Answer delivery' });
        if (created.outcome !== 'created') throw new Error('Missing Assignment');
        await agents.started[0]!.run.report({
          state: 'waiting-human',
          summary: 'Choose A or B',
          expectsReply: true,
        });
        agents.finish(created.assignment.sessionId);
        await runtime.whenIdle();
        const before = runtime.getAssignment('ada', created.assignment.sessionId)!;
        let reject!: (error: unknown) => void;
        const accepted = new Promise<void>((_resolve, refuse) => {
          reject = refuse;
        });
        vi.spyOn(agents, 'requestAssignment').mockReturnValueOnce({
          delivery: 'followup',
          accepted,
          done: accepted,
        });
        access.request({
          sessionId: before.sessionId,
          mode: 'next-turn',
          text: 'Choose A',
          answerTo: before.openAsk!.sourceEventId,
        });
        expect(runtime.getAssignment('ada', before.sessionId)?.openAsk).toEqual(before.openAsk);
        reject(
          uncertain
            ? new AssignmentInboxAcceptanceUncertainError(new Error('native send threw'))
            : new Error('Resume failed before native send'),
        );
        await runtime.whenIdle();
        const failed = runtime.getAssignment('ada', before.sessionId)!;
        expect(failed).toMatchObject({ ...before, activity: uncertain ? 'error' : 'idle' });
        const query = createHumanAttentionQuery(
          attachOperationalModule(owner, 'answer-refusal-test'),
        );
        expect(query.list({ category: 'action' }).items).toContainEqual(
          expect.objectContaining({ sourceEventId: before.openAsk!.sourceEventId }),
        );
        if (uncertain) {
          expect(() =>
            access.request({
              sessionId: before.sessionId,
              mode: 'next-turn',
              text: 'Choose A',
              answerTo: before.openAsk!.sourceEventId,
            }),
          ).toThrow('failed');
        } else {
          access.request({
            sessionId: before.sessionId,
            mode: 'next-turn',
            text: 'Choose A',
            answerTo: before.openAsk!.sourceEventId,
          });
          await Promise.resolve();
          expect(runtime.getAssignment('ada', before.sessionId)?.openAsk).toBeUndefined();
          expect(runtime.getAssignment('ada', before.sessionId)?.permission).toEqual(
            before.permission,
          );
          expect(() =>
            access.request({
              sessionId: before.sessionId,
              mode: 'next-turn',
              text: 'Choose A',
              answerTo: before.openAsk!.sourceEventId,
            }),
          ).toThrow('no open ask');
          agents.finish(before.sessionId);
          await runtime.whenIdle();
          expect(runtime.getAssignment('ada', before.sessionId)?.activity).toBe('idle');
        }
      } finally {
        await close();
      }
    },
  );

  it('does not erase a newer question when the older answer is accepted', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      await admit('Start', 'human-newer-ask');
      const access = agents.access!;
      const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Question race' });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      const run = agents.started[0]!.run;
      await run.report({ state: 'waiting-human', summary: 'First question', expectsReply: true });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      const first = runtime.getAssignment('ada', run.sessionId)!.openAsk!;
      let accept!: () => void;
      const accepted = new Promise<void>((resolve) => {
        accept = resolve;
      });
      vi.spyOn(agents, 'requestAssignment').mockReturnValueOnce({
        delivery: 'followup',
        accepted,
        done: accepted,
      });
      access.request({
        sessionId: run.sessionId,
        mode: 'next-turn',
        text: 'First answer',
        answerTo: first.sourceEventId,
      });
      await run.report({ state: 'waiting-human', summary: 'Newer question', expectsReply: true });
      const newer = runtime.getAssignment('ada', run.sessionId)!.openAsk!;
      expect(newer.sourceEventId).not.toBe(first.sourceEventId);
      accept();
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)?.openAsk).toEqual(newer);
    } finally {
      await close();
    }
  });

  it('retains active steering uncertainty after the original turn finishes', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start', 'human-steer-uncertain');
      const access = agents.access!;
      const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Active steering' });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      const run = agents.started[0]!.run;
      await run.report({ state: 'waiting-human', summary: 'Question', expectsReply: true });
      const ask = runtime.getAssignment('ada', run.sessionId)!.openAsk!;
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        throw new AssignmentInboxAcceptanceUncertainError(new Error('native steer threw'));
      });
      expect(() =>
        access.request({
          sessionId: run.sessionId,
          mode: 'next-step',
          text: 'Answer',
          answerTo: ask.sourceEventId,
        }),
      ).toThrow('acceptance is uncertain');
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)).toMatchObject({
        activity: 'error',
        openAsk: ask,
      });
      expect(
        createHumanAttentionQuery(
          attachOperationalModule(owner, 'steer-uncertainty'),
        ).assignmentContext('ada', run.sessionId, ask.sourceEventId)?.canReply,
      ).toBe(false);
      expect(() =>
        access.request({
          sessionId: run.sessionId,
          mode: 'next-turn',
          text: 'Replay',
          answerTo: ask.sourceEventId,
        }),
      ).toThrow('failed');
    } finally {
      await close();
    }
  });

  it('settles an accepted answer even when its subsequent execution fails', async () => {
    const { runtime, agents, admit, close } = await setup();
    try {
      await admit('Start', 'human-after-accept');
      const access = agents.access!;
      const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Accepted failure' });
      if (created.outcome !== 'created') throw new Error('Missing Assignment');
      const run = agents.started[0]!.run;
      await run.report({ state: 'waiting-human', summary: 'Question', expectsReply: true });
      agents.finish(run.sessionId);
      await runtime.whenIdle();
      const before = runtime.getAssignment('ada', run.sessionId)!;
      vi.spyOn(agents, 'requestAssignment').mockReturnValueOnce({
        delivery: 'followup',
        accepted: Promise.resolve(),
        done: Promise.reject(new Error('Native turn failed after acceptance')),
      });
      access.request({
        sessionId: run.sessionId,
        mode: 'next-turn',
        text: 'Answer',
        answerTo: before.openAsk!.sourceEventId,
      });
      await runtime.whenIdle();
      expect(runtime.getAssignment('ada', run.sessionId)).toMatchObject({ activity: 'error' });
      expect(runtime.getAssignment('ada', run.sessionId)?.openAsk).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('releases a wake reservation when the adapter rejects synchronously', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    try {
      await admit('Start wake rejection test', 'human-wake-rejection');
      const access = agents.access!;
      const idle = access.create({ grantId: TEST_GRANT_ID, purpose: 'Idle work' });
      if (idle.outcome !== 'created') throw new Error('Idle Assignment missing');
      agents.finish(idle.assignment.sessionId);
      await runtime.whenIdle();
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        throw new Error('DSH delivery unavailable');
      });
      expect(() =>
        access.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue',
        }),
      ).toThrow('DSH delivery unavailable');
      expect(runtime.getAssignment('ada', idle.assignment.sessionId)?.activity).toBe('idle');
      expect(access.create({ grantId: TEST_GRANT_ID, purpose: 'Next work' }).outcome).toBe(
        'created',
      );
      expect(agents.resumed).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it('shares capacity across Bots when an idle Assignment resumes', async () => {
    const { runtime, agents, grants, channels, home, admit, close } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    try {
      await admit('Start Ada', 'human-ada-capacity');
      const ada = agents.access!;
      const idle = ada.create({ grantId: TEST_GRANT_ID, purpose: 'Ada work' });
      if (idle.outcome !== 'created') throw new Error('Ada Assignment missing');
      agents.finish(idle.assignment.sessionId);
      await runtime.whenIdle();
      createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }).create({
        slug: 'bob',
        displayName: 'Bob',
      });
      const bobGrant = await grants.create('bob', 'test-workspace');
      const dm = channels.getOrCreateDm('bob', 'Bob')!;
      const incoming = runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'human-bob-capacity',
        body: 'Start Bob',
      });
      if (!incoming.admitted) throw new Error('Bob admission missing');
      await incoming.settled;
      expect(agents.access!.create({ grantId: bobGrant.id, purpose: 'Bob work' }).outcome).toBe(
        'created',
      );
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

  it('reserves the final wake slot before entering the adapter and allows updates to running work', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    try {
      await admit('Start reservation test', 'human-reservation');
      const access = agents.access!;
      const idle = access.create({ grantId: TEST_GRANT_ID, purpose: 'Idle work' });
      if (idle.outcome !== 'created') throw new Error('Idle Assignment missing');
      agents.finish(idle.assignment.sessionId);
      await runtime.whenIdle();
      let competitor: string | undefined;
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => {
        competitor = access.create({ grantId: TEST_GRANT_ID, purpose: 'Competing work' }).outcome;
        return { delivery: 'steer' };
      });
      expect(
        access.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-turn',
          text: 'Continue',
        }).delivery,
      ).toBe('steer');
      expect(competitor).toBe('capacity');
      vi.spyOn(agents, 'requestAssignment').mockImplementationOnce(() => ({ delivery: 'steer' }));
      expect(
        access.request({
          sessionId: idle.assignment.sessionId,
          mode: 'next-step',
          text: 'More context',
        }).delivery,
      ).toBe('steer');
      expect(runtime.listAssignments('ada')).toHaveLength(1);
    } finally {
      await close();
    }
  });

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
          grantId: TEST_GRANT_ID,
          purpose: 'Choose route',
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
          const other = access.create({ grantId: TEST_GRANT_ID, purpose: `Other work ${index}` });
          if (other.outcome !== 'created') throw new Error('Capacity fixture missing');
          activeIds.push(other.assignment.sessionId);
        }
        const refused =
          path === 'keyed'
            ? access.create({
                grantId: TEST_GRANT_ID,
                purpose: 'Continue route',
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
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
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

  it('keeps a 2 KiB report inline and spills the next byte', async () => {
    const saved: string[] = [];
    const { agents, admit, close } = await setup({
      saveReportSpill: async ({ content }) => {
        saved.push(content);
        return {
          locator: 'opaque-report',
          bytes: Buffer.byteLength(content),
          retrievalHint: 'Read the report.',
        };
      },
    });
    try {
      await admit('Start research', 'human-spill-boundary');
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
      if (created.outcome !== 'created') throw new Error('create failed');
      const run = agents.started[0]!.run;
      await run.report({ state: 'progress', summary: 'a'.repeat(2_048) });
      expect(saved).toEqual([]);
      await run.report({ state: 'progress', summary: 'b'.repeat(2_049) });
      expect(saved).toEqual(['b'.repeat(2_049)]);
    } finally {
      await close();
    }
  });

  it('spills an oversized report before admitting its bounded Inbox summary', async () => {
    const saved: Array<{ sessionId: string; content: string }> = [];
    const { runtime, agents, owner, admit, close } = await setup({
      saveReportSpill: async (input) => {
        saved.push(input);
        return {
          locator: '/private/spill/report.txt',
          bytes: Buffer.byteLength(input.content),
          retrievalHint: 'Use read on this locator.',
        };
      },
    });
    try {
      await admit('Start research', 'human-spill');
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Long research' });
      if (created.outcome !== 'created') throw new Error('create failed');
      const content = `Report start ${'α'.repeat(1200)} FINAL-MARKER`;
      await agents.started[0]!.run.report({ state: 'completed', summary: content });
      agents.finish(created.assignment.sessionId);
      await runtime.whenIdle();
      expect(saved).toEqual([{ sessionId: created.assignment.sessionId, content }]);
      const summary = runtime.getAssignment('ada', created.assignment.sessionId)?.latestReport
        ?.summary;
      expect(summary).toContain('/private/spill/report.txt');
      expect(summary).toMatch(/sha256: [0-9a-f]{64}/u);
      expect(summary).not.toContain('FINAL-MARKER');
      const page = await readAssignmentReportPage(
        {
          listEvents: async () => [],
          filterEvents: async () => [{ seq: 1 }],
          readEvent: async () => ({
            target: {
              type: 'tool/call',
              data: {
                name: 'report_to_orchestrator',
                arguments: JSON.stringify({ summary: saved[0]!.content }),
              },
            },
          }),
        },
        created.assignment.sessionId,
        summary!,
        1_000,
      );
      expect(page.text).toContain('FINAL-MARKER');
      expect(page.sourceEventBytes).toBeGreaterThan(Buffer.byteLength(content));
      expect(agents.inboxTurns[0]).toContain('/private/spill/report.txt');
      expect(agents.inboxTurns[0]).not.toContain('FINAL-MARKER');
      const source = attachOperationalModule(owner, 'spill-test').read((database) =>
        database
          .prepare("SELECT body FROM source_events WHERE source_kind = 'assignment-report'")
          .get(),
      ) as { body: string };
      expect(source.body).toBe(summary);
      await agents.access!.stop(created.assignment.sessionId);
      await expect(
        agents.started[0]!.run.report({ state: 'completed', summary: content }),
      ).rejects.toThrow('unavailable or stopping');
      expect(saved).toHaveLength(1);
    } finally {
      await close();
    }
  });

  it('authorizes Session Query tail reads through the owning Bot Assignment Directory', async () => {
    const readAssignmentTail = vi.fn(async () => ({
      events: [],
      indexedEvents: 0,
      readCount: 0,
      sourceEventBytes: 0,
      returnedCharacters: 0,
      estimatedTokens: 0,
    }));
    const { agents, admit, close } = await setup({ readAssignmentTail });
    try {
      await admit('Start', 'human-tail');
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
      if (created.outcome !== 'created') throw new Error('create failed');
      await expect(agents.access!.tail?.(created.assignment.sessionId)).resolves.toMatchObject({
        indexedEvents: 0,
      });
      await expect(agents.access!.tail?.('foreign-session')).rejects.toThrow(
        'Unknown Assignment Session',
      );
      expect(readAssignmentTail).toHaveBeenCalledTimes(1);
      expect(readAssignmentTail).toHaveBeenCalledWith(created.assignment.sessionId);
    } finally {
      await close();
    }
  });

  it('only pages the latest accepted report from an owned Assignment', async () => {
    const readAssignmentReportPage = vi.fn(async () => ({
      text: 'first page',
      offset: 0,
      totalCharacters: 10,
      matchedEvents: 1,
      readCount: 1,
      sourceEventBytes: 100,
      returnedCharacters: 10,
      estimatedTokens: 3,
    }));
    const { agents, admit, close } = await setup({ readAssignmentReportPage });
    try {
      await admit('Start', 'human-report-page');
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      await agents.started[0]!.run.report({ state: 'completed', summary: 'first page' });
      await expect(agents.access!.reportPage?.(sessionId, 'first page', 0)).resolves.toMatchObject({
        text: 'first page',
      });
      await expect(agents.access!.reportPage?.(sessionId, 'stale page', 0)).rejects.toThrow(
        'Assignment report changed',
      );
      await expect(agents.access!.reportPage?.('foreign-session', 'first page', 0)).rejects.toThrow(
        'Unknown Assignment Session',
      );
      expect(readAssignmentReportPage).toHaveBeenCalledTimes(1);
      expect(readAssignmentReportPage).toHaveBeenCalledWith(sessionId, 'first page', 0);
    } finally {
      await close();
    }
  });

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
    const dmChannelId = channels.getOrCreateDm('ada', 'Ada')!.id;
    createTestWorkspaceGrants(owner, home);
    try {
      const query = createHumanAttentionQuery(
        attachOperationalModule(owner, 'human-grant-attention-test'),
      );
      await channels.appendMessage(dmChannelId, {
        id: 'grant-request-1',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Please give me access to the project.',
        grantRequest: true,
      });
      expect(query.list({ category: 'action' }).items).toMatchObject([
        {
          kind: 'workspace-grant-request',
          botSlug: 'ada',
          channelId: dmChannelId,
          messageId: 'grant-request-1',
          summary: 'Please give me access to the project.',
        },
      ]);
      expect(query.list({ category: 'action', botSlug: 'other' }).items).toEqual([]);
      await channels.appendMessage(dmChannelId, {
        id: 'human-unrelated',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'I will review this.',
        replyTo: 'grant-request-1',
      });
      expect(query.list({ category: 'action' }).items).toHaveLength(1);
      await channels.appendMessage(dmChannelId, {
        id: 'human-uppercase-unvalidated',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'I AUTHORIZED WORKSPACE “Project”; please continue.',
        replyTo: 'grant-request-1',
      });
      expect(query.list({ category: 'action' }).items).toHaveLength(1);
      await channels.appendMessage(dmChannelId, {
        id: 'human-approved',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: 'Workspace authorized.',
        replyTo: 'grant-request-1',
        grantRequestResolution: { requestMessageId: 'grant-request-1', grantId: TEST_GRANT_ID },
      });
      await Promise.resolve();
      expect(query.list({ category: 'action' }).items).toEqual([]);

      await channels.appendMessage(dmChannelId, {
        id: 'grant-request-legacy',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Please give me another folder.',
        grantRequest: true,
      });
      expect(query.list({ category: 'action' }).items).toHaveLength(1);
      await channels.appendMessage(dmChannelId, {
        id: 'human-approved-legacy',
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: '已授权工作区「Project」，请继续处理之前的事项。',
        replyTo: 'grant-request-legacy',
      });
      expect(query.list({ category: 'action' }).items).toMatchObject([
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
      expect(query.list({ category: 'action' }).items).toMatchObject([
        { messageId: 'grant-request-legacy' },
      ]);
    } finally {
      reopened.close();
    }
  });

  it('starts parallel Assignments without blocking the Orchestrator turn', async () => {
    const { runtime, agents, admit, close } = await setup();
    await admit('请同时处理两件事', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const first = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 A 方向',
      key: 'research-a',
    });
    const second = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 B 方向',
      key: 'research-b',
    });

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('created');
    expect(agents.started.map((run) => run.purpose)).toEqual(
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
      grantId: TEST_GRANT_ID,
      purpose: '调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    agents.started[0]?.run.report({ state: 'completed', summary: 'A 方向完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('idle');

    const reused = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '继续调研 A 方向',
      key: 'research-a',
    });
    expect(reused.outcome).toBe('reused');
    expect(reused.outcome === 'reused' && reused.assignment.sessionId).toBe(sessionId);
    expect(agents.resumed).toEqual([{ sessionId, text: '继续调研 A 方向' }]);

    const busy = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '再次调研 A 方向',
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
      grantId: TEST_GRANT_ID,
      purpose: '持续调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const runningTurn = agents.started[0]?.run;
    if (runningTurn === undefined) throw new Error('Assignment never started');

    const stopped = await access.stop(sessionId);
    expect(stopped.activity).toBe('stopped');
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopped');
    expect(() => access.request({ sessionId, mode: 'next-turn', text: '继续' })).toThrow(
      /stopped or stopping/,
    );
    await expect(
      runningTurn.report({ state: 'completed', summary: '取消之后的迟到报告' }),
    ).rejects.toThrow('unavailable or stopping');
    expect(runtime.getAssignment('ada', sessionId)?.latestReport).toBeUndefined();
    expect((await access.stop(sessionId)).activity).toBe('stopped');

    const next = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '重新开始 A 方向',
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

  it('delivers one Host-origin stop notice through the Bot Inbox', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    await admit('开始调研', 'human-stop-notice');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调查一个可以取消的方向',
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
    const created = access.create({ grantId: TEST_GRANT_ID, purpose: '等待停止的方向' });
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
    const created = access.create({ grantId: TEST_GRANT_ID, purpose: '等待停止的方向' });
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
      grantId: TEST_GRANT_ID,
      purpose: '可复用的事项',
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
        grantId: TEST_GRANT_ID,
        purpose: '不得复用停止中的续接键',
        key: 'stopping-key',
      }).outcome,
    ).toBe('key-busy');
    expect(access.create({ grantId: TEST_GRANT_ID, purpose: '不得抢占停止中的名额' }).outcome).toBe(
      'capacity',
    );

    expect((await access.stop(sessionId)).activity).toBe('stopped');
    expect(access.create({ grantId: TEST_GRANT_ID, purpose: '停止完成后可新建' }).outcome).toBe(
      'created',
    );
    await close();
  });
  it('revocation blocks new and resumed work without rewriting an already running turn', async () => {
    const { runtime, grants, agents, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const permission = runtime.getAssignment('ada', sessionId)?.permission;
    expect(permission?.mode).toBe('workspace-write');

    grants.revoke('ada', TEST_GRANT_ID);
    expect(() => access.create({ grantId: TEST_GRANT_ID, purpose: '新方向' })).toThrow(
      /missing or revoked/,
    );
    expect(() => access.request({ sessionId, mode: 'next-turn', text: '继续' })).toThrow(
      /missing or revoked/,
    );
    expect(() =>
      access.create({ grantId: TEST_GRANT_ID, purpose: '继续', key: 'research-a' }),
    ).toThrow(/missing or revoked/);
    expect(runtime.getAssignment('ada', sessionId)?.permission).toEqual(permission);

    await agents.started[0]!.run.report({ state: 'completed', summary: '已运行的事项完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.latestReport?.summary).toBe('已运行的事项完成');
    await close();
  });

  it('wakes an idle Orchestrator with one coalesced block and records observation', async () => {
    const { runtime, agents, owner, channels, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
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
          assignmentPurpose: '调研 A 方向',
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

    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
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
        const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Choose route' });
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
        const active = runtime.admitDmMessage({
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
        grantId: TEST_GRANT_ID,
        purpose: 'Choose a direction',
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
      expect(attention.list({ category: 'action' }).items).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-waiting-human',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'Should I choose A or B?',
        },
      ]);
      expect(attention.list({ category: 'action', botSlug: 'bea' }).items).toEqual([]);
      expect(attention.list({ category: 'action', channelId: 'dm-ada' }).items).toMatchObject([
        { assignmentSessionId: sessionId },
      ]);
      expect(attention.list({ category: 'info' }).items).toEqual([]);

      const askId = runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId;
      if (askId === undefined) throw new Error('Open ask missing');
      agents.access!.request({
        sessionId,
        mode: 'next-turn',
        text: 'Choose A',
        answerTo: askId,
      });
      await Promise.resolve();
      expect(attention.list({ category: 'action' }).items).toEqual([]);
    } finally {
      await close();
    }
  });

  it('retains the escalated blocker and exact Human reply target after weaker reports', async () => {
    const { runtime, agents, owner, channels, admit, close } = await setup();
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        grantId: TEST_GRANT_ID,
        purpose: 'Choose release route',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      const run = agents.started[0]!.run;
      const query = createHumanAttentionQuery(attachOperationalModule(owner, 'escalation-test'));
      await run.report({ state: 'waiting-human', summary: 'Choose route', expectsReply: true });
      const initialSource = query.list({ category: 'action' }).items[0]?.sourceEventId;
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
      expect(query.list({ category: 'action' }).items).toMatchObject([
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
      expect(query.list({ category: 'action' }).items).toEqual([]);
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
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
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
      const first = query.list({ category: 'action' }).items;
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
      const revised = query.list({ category: 'action' }).items;
      expect(revised).toHaveLength(1);
      expect(revised[0]).toMatchObject({
        id: 'assignment:' + sessionId,
        kind: 'assignment-blocked',
        summary: 'Still blocked; need a grant',
      });
      expect(revised[0]?.sourceEventId).not.toBe(originalSource);
      expect(query.list({ category: 'info' }).items).toEqual([]);
      expect(query.list({ category: 'action', botSlug: 'bea' }).items).toEqual([]);

      const answerTo = revised[0]?.sourceEventId;
      if (answerTo === undefined) throw new Error('Open blocker missing source');
      agents.access!.request({
        sessionId,
        mode: 'next-turn',
        text: 'Use the new grant',
        answerTo,
      });
      await Promise.resolve();
      expect(query.list({ category: 'action' }).items).toEqual([]);
      agents.finish(sessionId);
      await runtime.whenIdle();
      expect(query.list({ category: 'action' }).items).toMatchObject([
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
      expect(query.list({ category: 'action' }).items).toEqual([]);
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
      expect(query.list({ category: 'action' }).items).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it('keeps an open ask across a restart', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');
    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
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
          grantId: TEST_GRANT_ID,
          purpose: 'Unfinished investigation',
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
        expect(recovered.getAssignment('ada', sessionId)?.continuityKey).toBeUndefined();
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
        const admission = recovered.admitDmMessage({
          channelId: dmChannelId,
          messageId: 'explicit-replacement',
          body: 'Start replacement work',
        });
        if (!admission.admitted) throw new Error('Human message refused');
        await admission.settled;
        expect(() =>
          secondAgents.access!.request({
            sessionId,
            mode: 'next-turn',
            text: 'Resume crashed work',
          }),
        ).toThrow('failed; start a new Assignment');
        const replacement = secondAgents.access!.create({
          grantId: TEST_GRANT_ID,
          purpose: 'Replacement investigation',
          key: 'unfinished-direction',
        });
        secondAgents.finishAll();
        expect(replacement.outcome).toBe('created');
        if (replacement.outcome === 'created')
          expect(replacement.assignment.sessionId).not.toBe(sessionId);
      } finally {
        coldAgents.finishAll();
        await recovered?.close();
        reopened?.close();
        await close();
        owner.close();
      }
    },
  );

  it('releases a stale working reservation after Host restart without deleting the Assignment', async () => {
    const { runtime, owner, home, agents, grants, dmChannelId, admit } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    await admit('开始调研', 'human-restart-capacity');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');
    const created = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '原事项',
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
    expect(
      resumed.getAssignment('ada', created.assignment.sessionId)?.continuityKey,
    ).toBeUndefined();
    const admission = resumed.admitDmMessage({
      channelId: dmChannelId,
      messageId: 'human-after-restart',
      body: '新事项',
    });
    if (!admission.admitted) throw new Error('DM admission refused');
    await admission.settled;
    if (resumedAgents.access === undefined) throw new Error('Orchestrator never resumed');
    const replacement = resumedAgents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '新事项',
      key: 'restart-direction',
    });
    expect(replacement.outcome).toBe('created');
    if (replacement.outcome === 'created')
      expect(replacement.assignment.sessionId).not.toBe(created.assignment.sessionId);
    resumedAgents.finishAll();
    await resumed.whenIdle();
    await resumed.close();
    owner.close();
  });

  it('refuses creation beyond the Assignment Concurrency Limit', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    expect(agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' }).outcome).toBe(
      'created',
    );
    const refused = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 B 方向' });
    expect(refused.outcome).toBe('capacity');
    expect(refused.outcome === 'capacity' && refused.message).toContain('retryable: true');
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    await close();
  });
  it('recovers an unobserved due report once after restart', async () => {
    const { agents, owner, home, admit, close } = await setup();
    await admit('Start research', 'human-1');
    const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
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
        const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
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
        grantId: TEST_GRANT_ID,
        purpose: 'Research',
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
      const first = query.list({ category: 'info' }).items;
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
      expect(decisions.ignoreAssignmentReport(firstReportId)).toBe(true);
      expect(decisions.ignoreAssignmentReport(firstReportId)).toBe(true);
      expect(query.list({ category: 'info' }).items).toEqual([]);

      const reused = agents.access!.create({
        grantId: TEST_GRANT_ID,
        purpose: 'Continue research',
        key: 'research',
      });
      if (reused.outcome !== 'reused') throw new Error('Assignment was not reused');
      await agents.started.at(-1)!.run.report({ state: 'completed', summary: 'New result' });
      agents.finish(sessionId);
      await runtime.whenIdle();
      const next = query.list({ category: 'info' }).items;
      expect(next).toMatchObject([
        {
          kind: 'assignment-report',
          assignmentSessionId: sessionId,
          summary: 'New result',
        },
      ]);
      nextReportId = next[0]?.sourceEventId ?? '';
      expect(nextReportId).not.toBe(firstReportId);
      expect(decisions.ignoreAssignmentReport(firstReportId)).toBe(false);
      expect(query.list({ category: 'info', channelId: 'dm-ada' }).items).toEqual([]);
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
      expect(query.list({ category: 'info' }).items[0]?.sourceEventId).toBe(nextReportId);
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
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
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
      const admission = reopenedRuntime.admitDmMessage({
        channelId: reopenedChannels.getOrCreateDm('ada', 'Ada')!.id,
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
    const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
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
