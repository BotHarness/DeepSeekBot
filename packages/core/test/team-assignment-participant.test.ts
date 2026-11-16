import { afterEach, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import type {
  AssignmentAgentRun,
  OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import {
  createTestNativeWorkspace,
  createTestWorkspaceGrants,
  TEST_GRANT_ID,
} from './workspace-grant-fixture.js';

const bob = humanContext('bob');
const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
async function fixture(failExecution = false) {
  const home = createTempRoot('m7-assignment-participant-');
  const workspace = createTestNativeWorkspace(home);
  let access: OrchestratorAssignmentAccess | undefined;
  let assignment: AssignmentAgentRun | undefined;
  const core = createCore({
    dshHome: home,
    workspaces: () => workspace.lookup,
    agents: {
      async runOrchestrator(run) {
        if (!run.message.includes('create-private-task')) return;
        access = run.assignments;
        run.assignments.create({
          title: 'Bob private task',
          description: 'private task',
          grantId: TEST_GRANT_ID,
        });
      },
      async runAssignment(run) {
        assignment = run;
        if (failExecution) throw new Error('private execution failure');
      },
      requestAssignment() {
        throw new Error('private request refusal');
      },
      async close() {},
    },
  });
  closes.push(async () => {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    await core.roster.detach();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'assignment-participant-test');
  db.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled=1').run();
    for (const id of ['bob', 'eve']) {
      db.prepare("INSERT INTO humans VALUES (?,?,'active','now')").run(id, id);
      db.prepare("INSERT INTO human_roles VALUES (?,'member')").run(id);
    }
  });
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  createTestWorkspaceGrants(core.operationalDatabase, workspace.path);
  const principalDm = core.channels.getOrCreateDm(owner, 'ada')!;
  core.team.bots.setVisibility(owner, 'ada', { kind: 'public', audience: { kind: 'everyone' } });
  const dm = core.team.bots.dm(bob, 'ada')!;
  const foreignDm = core.team.bots.dm(humanContext('eve'), 'ada')!;
  db.transaction((db) =>
    db
      .prepare(
        "UPDATE channel_records SET record_json=json_set(record_json,'$.updatedAt','2099-01-01T00:00:00Z') WHERE channel_id=?",
      )
      .run(foreignDm.id),
  );
  const start = async () => {
    await core.channels.appendMessage(bob, dm.id, {
      id: 'start',
      at: new Date().toISOString(),
      author: { kind: 'human', humanId: 'bob' },
      body: 'create-private-task',
    });
    const admission = core.runtime.admitDmMessage(bob, {
      channelId: dm.id,
      messageId: 'start',
      body: 'create-private-task',
    });
    if (!admission.admitted) throw new Error('not admitted');
    await admission.settled;
    await core.runtime.whenIdle();
    if (!assignment || !access) throw new Error('assignment not started');
    return { assignment, access };
  };
  return { core, db, dm, principalDm, foreignDm, start, current: () => assignment };
}

it.each(['execution', 'request'] as const)(
  'routes Assignment %s failures to the requesting participant DM',
  async (kind) => {
    const f = await fixture(kind === 'execution');
    const { assignment, access } = await f.start();
    if (kind === 'request') {
      expect(() =>
        access.request({ sessionId: assignment.sessionId, mode: 'next-turn', text: 'continue' }),
      ).toThrow('private request refusal');
      await f.core.runtime.whenIdle();
    }
    const notices = (id: string) =>
      f.core.channels
        .readMessages(id)
        .filter((message) => message.sessionFailure?.role === 'assignment');
    expect(notices(f.dm.id)).toHaveLength(1);
    expect(notices(f.dm.id)[0]?.sessionFailure?.context).toBe('Bob private task');
    expect(notices(f.principalDm.id)).toEqual([]);
    expect(notices(f.foreignDm.id)).toEqual([]);
  },
);

it('skips Assignment refusal notices when the requesting participant no longer has a DM', async () => {
  const f = await fixture();
  const { assignment, access } = await f.start();
  f.db.transaction((db) =>
    db
      .prepare(
        "UPDATE channel_records SET record_json=json_set(record_json,'$.deletedAt','now') WHERE channel_id=?",
      )
      .run(f.dm.id),
  );
  expect(() =>
    access.request({ sessionId: assignment.sessionId, mode: 'next-turn', text: 'continue' }),
  ).toThrow('private request refusal');
  await f.core.runtime.whenIdle();
  for (const dm of [f.principalDm, f.foreignDm])
    expect(f.core.channels.readMessages(dm.id).filter((message) => message.sessionFailure)).toEqual(
      [],
    );
});

it('shows handled Assignment DM responses only to their recorded Human participant', async () => {
  const f = await fixture();
  const { assignment } = await f.start();
  await assignment.report({ state: 'waiting-human', summary: 'Choose branch', expectsReply: true });
  const ask = f.core.runtime.getAssignment('ada', assignment.sessionId)!.openAsk!;
  await f.core.channels.appendMessage(bob, f.dm.id, {
    id: 'answer',
    at: new Date().toISOString(),
    author: { kind: 'human', humanId: 'bob' },
    body: 'main',
    assignmentReply: { sessionId: assignment.sessionId, sourceEventId: ask.sourceEventId },
  });
  f.db.transaction((db) =>
    db
      .prepare('UPDATE assignments SET open_ask_source_event_id=NULL WHERE session_id=?')
      .run(assignment.sessionId),
  );
  expect(f.core.humanAttention.list(bob, { category: 'handled' }).items).toContainEqual(
    expect.objectContaining({
      assignmentSessionId: assignment.sessionId,
      responseMessageId: 'answer',
    }),
  );
  for (const human of [owner, humanContext('eve')])
    expect(f.core.humanAttention.list(human, { category: 'handled' }).items).toEqual([]);
});

it.each(['waiting-human', 'blocked'] as const)(
  'routes Assignment %s action items to the requesting participant DM',
  async (state) => {
    const f = await fixture();
    const { assignment } = await f.start();
    await assignment.report({ state, summary: 'Bob must choose', expectsReply: true });
    const actions = f.core.humanAttention.list(bob, { category: 'action' }).items;
    expect(actions).toContainEqual(
      expect.objectContaining({
        kind: state === 'blocked' ? 'assignment-blocked' : 'assignment-waiting-human',
        assignmentSessionId: assignment.sessionId,
        channelId: f.dm.id,
        channelName: f.dm.name,
      }),
    );
    for (const human of [owner, humanContext('eve')])
      expect(f.core.humanAttention.list(human, { category: 'action' }).items).toEqual([]);
  },
);

it('does not fall back to the principal when the requesting participant DM is deleted', async () => {
  const f = await fixture();
  const { assignment } = await f.start();
  await assignment.report({ state: 'blocked', summary: 'Bob private blocker', expectsReply: true });
  f.db.transaction((db) =>
    db
      .prepare(
        "UPDATE channel_records SET record_json=json_set(record_json,'$.deletedAt','now') WHERE channel_id=?",
      )
      .run(f.dm.id),
  );
  for (const human of [bob, owner, humanContext('eve')])
    expect(f.core.humanAttention.list(human, { category: 'action' }).items).toEqual([]);
});

it("keeps the principal's Assignment action when only another Human's DM exists", async () => {
  const f = await fixture();
  await f.core.channels.appendMessage(owner, f.principalDm.id, {
    id: 'owner-start',
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'create-private-task',
  });
  const admission = f.core.runtime.admitDmMessage(owner, {
    channelId: f.principalDm.id,
    messageId: 'owner-start',
    body: 'create-private-task',
  });
  if (!admission.admitted) throw new Error('not admitted');
  await admission.settled;
  await f.core.runtime.whenIdle();
  const run = f.current()!;
  const session = run.sessionId;
  f.db.transaction((db) =>
    db
      .prepare(
        "UPDATE channel_records SET record_json=json_set(record_json,'$.botSlug','retired-ada') WHERE channel_id=?",
      )
      .run(f.principalDm.id),
  );
  await run.report({ state: 'blocked', summary: 'Owner blocker', expectsReply: true });
  expect(f.core.humanAttention.list(owner, { category: 'action' }).items).toContainEqual(
    expect.objectContaining({ kind: 'assignment-blocked', assignmentSessionId: session }),
  );
  for (const human of [bob, humanContext('eve')])
    expect(f.core.humanAttention.list(human, { category: 'action' }).items).toEqual([]);
});

it('routes Workspace Grant request actions only to the recorded shared DM participant', async () => {
  const f = await fixture();
  await f.core.channels.appendMessage(bob, f.dm.id, {
    id: 'grant',
    at: new Date().toISOString(),
    author: { kind: 'bot', slug: 'ada' },
    body: 'Choose a Workspace',
    grantRequest: true,
  });
  expect(f.core.humanAttention.list(bob, { category: 'action' }).items).toContainEqual(
    expect.objectContaining({
      kind: 'workspace-grant-request',
      channelId: f.dm.id,
      messageId: 'grant',
    }),
  );
  for (const human of [owner, humanContext('eve')])
    expect(f.core.humanAttention.list(human, { category: 'action' }).items).toEqual([]);
});
