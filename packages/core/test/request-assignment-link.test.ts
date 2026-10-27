import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import type {
  BotAgentAdapter,
  OrchestratorAgentRun,
  OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

type Turn = (assignments: OrchestratorAssignmentAccess) => unknown;

async function fixture() {
  const home = createTempRoot('botharness-request-assignment-');
  const turns: Turn[] = [];
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run: OrchestratorAgentRun) {
      await turns.shift()?.(run.assignments);
    },
    async runAssignment() {},
    requestAssignment: () => ({ delivery: 'steer' }),
    async close() {},
  };
  const core = createCore({
    dshHome: home,
    agents: adapter,
    triageContinuation: false,
    workspaces: () => ({
      get: (id) =>
        id === 'test-workspace'
          ? { id, path: home, title: 'Test Workspace', status: async () => 'ok' }
          : undefined,
      list: () => [],
    }),
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  createTestWorkspaceGrants(core.operationalDatabase, home);
  const dm = core.channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  let sequence = 0;
  async function send(turn?: Turn) {
    if (turn) turns.push(turn);
    const messageId = `human-${++sequence}`;
    const admission = core.runtime.admitDmMessage({
      channelId: dm!.id,
      messageId,
      body: messageId,
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    await core.runtime.whenIdle();
    return messageId;
  }
  const status = (messageId: string) => core.channels.humanSendStatus?.(dm.id, messageId);
  return {
    core,
    send,
    status,
    async close() {
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}

describe('Human request Assignment link', () => {
  it('names the Assignment a request created or advanced last, and none otherwise', async () => {
    const f = await fixture();
    try {
      let first = '';
      let second = '';
      const plain = await f.send();
      const creating = await f.send((assignments) => {
        const created = assignments.create({
          title: 'Research',
          description: 'Research the topic',
          grantId: TEST_GRANT_ID,
        });
        if (created.outcome !== 'created') throw new Error(created.outcome);
        first = created.assignment.sessionId;
      });
      const advancing = await f.send((assignments) => {
        const created = assignments.create({
          title: 'Draft',
          description: 'Draft the summary',
          grantId: TEST_GRANT_ID,
        });
        if (created.outcome !== 'created') throw new Error(created.outcome);
        second = created.assignment.sessionId;
        assignments.request({ sessionId: first, mode: 'next-turn', text: 'More context' });
      });
      expect(f.status(plain)).not.toHaveProperty('assignmentId');
      expect(f.status(creating)).toMatchObject({ assignmentId: first });
      expect(second).not.toBe(first);
      expect(f.status(advancing)).toMatchObject({ assignmentId: first });
    } finally {
      await f.close();
    }
  }, 60000);
});
