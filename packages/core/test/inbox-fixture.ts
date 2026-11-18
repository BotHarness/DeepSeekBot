import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestNativeWorkspace, createTestWorkspaceGrants } from './workspace-grant-fixture.js';

export type TurnHook = (run: OrchestratorAgentRun) => unknown;

export async function inboxFixture(options: { triageContinuation?: boolean } = {}) {
  const home = createTempRoot('botharness-inbox-');
  const runs: OrchestratorAgentRun[] = [];
  const hooks: TurnHook[] = [];
  const results: unknown[] = [];
  const held: Array<() => void> = [];
  const assignments: AssignmentAgentRun[] = [];
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      const hook = hooks.shift();
      if (hook !== undefined) results.push(await hook(run));
    },
    runAssignment(run) {
      assignments.push(run);
      run.setExecutionReady?.(true);
      run.acceptNativeInput?.();
      return new Promise<void>((resolve) => held.push(resolve));
    },
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  const workspace = createTestNativeWorkspace(home);
  const core = createCore({
    dshHome: home,
    agents: adapter,
    triageContinuation: options.triageContinuation ?? false,
    workspaces: () => workspace.lookup,
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  createTestWorkspaceGrants(core.operationalDatabase, workspace.path);
  const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  const probe = attachOperationalModule(core.operationalDatabase, 'inbox-test');
  let sequence = 0;
  async function admit(body: string, ...turns: TurnHook[]) {
    hooks.push(...turns);
    sequence += 1;
    const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm!.id,
      messageId: `human-${sequence}`,
      body,
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    return `human-${sequence}`;
  }
  async function send(body: string, ...turns: TurnHook[]) {
    hooks.push(...turns);
    sequence += 1;
    const messageId = `human-${sequence}`;
    const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: dm!.id,
      messageId,
      body,
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    await core.runtime.whenIdle();
    const row = probe.read((db) =>
      db.prepare('SELECT source_event_id FROM source_events WHERE message_id = ?').get(messageId),
    ) as { source_event_id: string } | undefined;
    if (row === undefined) throw new Error('Missing Source Event');
    return row.source_event_id;
  }
  function sourceId(messageId: string) {
    const row = probe.read((db) =>
      db.prepare('SELECT source_event_id FROM source_events WHERE message_id = ?').get(messageId),
    ) as { source_event_id: string } | undefined;
    if (row === undefined) throw new Error('Missing Source Event');
    return row.source_event_id;
  }
  function resolved(id: string) {
    const row = probe.read((db) =>
      db.prepare('SELECT resolved_at FROM inbox_admissions WHERE source_event_id = ?').get(id),
    ) as { resolved_at: string | null } | undefined;
    return row?.resolved_at != null;
  }
  function state(id: string) {
    return core.attention.list({ botSlug: 'ada', limit: 100 }).items.find((item) => item.id === id)
      ?.state;
  }
  function finishAssignments() {
    for (const resolve of held.splice(0)) resolve();
  }
  async function close() {
    finishAssignments();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return {
    core,
    dm,
    runs,
    results,
    assignments,
    send,
    admit,
    sourceId,
    resolved,
    state,
    close,
    finishAssignments,
  };
}
