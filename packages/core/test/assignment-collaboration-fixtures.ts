import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { AssignmentReportContent } from '../src/runtime/assignment-report.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { join } from 'node:path';
import { expect } from 'vitest';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
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

export class ManualAgents implements BotAgentAdapter {
  readonly started: Array<{ sessionId: string; description: string; run: AssignmentAgentRun }> = [];
  readonly resumed: Array<{ sessionId: string; text: string }> = [];
  readonly inboxTurns: string[] = [];
  readonly allInboxTurns: string[] = [];
  access: OrchestratorAssignmentAccess | undefined;
  failNextStop = false;
  failInbox: 'before-side-effect' | 'after-side-effect' | undefined;
  factoryUnavailableCount = 0;
  onMessage: ((run: OrchestratorAgentRun) => Promise<void>) | undefined;
  readonly #finish = new Map<string, () => void>();

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.access = run.assignments;
    this.allInboxTurns.push(run.inbox);
    if (run.message.trim().length > 0) {
      await this.onMessage?.(run);
      return;
    }
    if (this.factoryUnavailableCount > 0) {
      this.factoryUnavailableCount -= 1;
      throw new Error('no agent factory registered (load an agent-loop plugin)');
    }
    if (this.failInbox === 'after-side-effect') {
      const created = run.assignments.create({
        title: 'Assignment',
        grantId: TEST_GRANT_ID,
        description: 'Follow-up work',
      });
      if (created.outcome === 'created') this.finish(created.assignment.sessionId);
    }
    if (this.failInbox !== undefined) throw new Error('Inbox turn failed');
    this.inboxTurns.push(run.inbox);
  }

  runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.started.push({ sessionId: run.sessionId, description: run.text, run });
    run.setExecutionReady?.(true);
    run.acceptNativeInput?.();
    return new Promise<void>((resolve) => this.#finish.set(run.sessionId, resolve)).finally(() =>
      run.setExecutionReady?.(false),
    );
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    this.resumed.push({ sessionId: run.sessionId, text: run.text });
    this.started.push({ sessionId: run.sessionId, description: run.text, run });
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

export function sourceEvents(owner: ReturnType<typeof mountOperationalDatabase>): Array<{
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

export async function setup(
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
      content?: AssignmentReportContent,
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
  registry: ReturnType<typeof createTestRegistry>;
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
  const dm = channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
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
    registry,
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
      const admission = runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: dm.id,
        messageId,
        body,
      });
      if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
      await admission.settled;
    },
  };
}
