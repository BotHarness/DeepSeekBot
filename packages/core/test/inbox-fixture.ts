import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

export type TurnHook = (run: OrchestratorAgentRun) => unknown;

export async function inboxFixture() {
  const home = createTempRoot('botharness-inbox-');
  const runs: OrchestratorAgentRun[] = [];
  const hooks: TurnHook[] = [];
  const results: unknown[] = [];
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      const hook = hooks.shift();
      if (hook !== undefined) results.push(await hook(run));
    },
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
  const core = createCore({ dshHome: home, agents: adapter });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  const probe = attachOperationalModule(core.operationalDatabase, 'inbox-test');
  let sequence = 0;
  async function send(body: string, hook?: TurnHook) {
    if (hook !== undefined) hooks.push(hook);
    sequence += 1;
    const messageId = `human-${sequence}`;
    const admission = core.runtime.admitDmMessage({ channelId: dm!.id, messageId, body });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    await core.runtime.whenIdle();
    const row = probe.read((db) =>
      db.prepare('SELECT source_event_id FROM source_events WHERE message_id = ?').get(messageId),
    ) as { source_event_id: string } | undefined;
    if (row === undefined) throw new Error('Missing Source Event');
    return row.source_event_id;
  }
  function state(id: string) {
    return core.attention.list({ botSlug: 'ada', limit: 100 }).items.find((item) => item.id === id)
      ?.state;
  }
  async function close() {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { core, dm, runs, results, send, state, close };
}
