import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture({
  failure = false,
  supported = true,
  nativeRefusal = false,
  deferAssignment = false,
} = {}) {
  const home = createTempRoot('wechat-typing-');
  let consumer!: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let release!: () => void;
  const running = new Promise<void>((done) => {
    release = done;
  });
  const runs: OrchestratorAgentRun[] = [];
  let finishAssignment!: () => void;
  const assignmentRunning = new Promise<void>((done) => {
    finishAssignment = done;
  });
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      await running;
      if (failure) throw new Error('controlled model failure');
    },
    async runAssignment() {
      if (deferAssignment) await assignmentRunning;
    },
    requestAssignment: () => ({ delivery: 'steer' }),
    async close() {},
  };
  const core = createCore({
    dshHome: home,
    agents,
    ...(deferAssignment
      ? {
          workspaces: () => ({
            list: () => [
              {
                id: 'test-workspace',
                path: home,
                title: 'Test Workspace',
                status: async () => 'ok' as const,
              },
            ],
            get: (id: string) =>
              id === 'test-workspace'
                ? { id, path: home, title: 'Test Workspace', status: async () => 'ok' as const }
                : undefined,
          }),
        }
      : {}),
  });
  cleanup.push(async () => {
    release();
    finishAssignment();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  if (deferAssignment) createTestWorkspaceGrants(core.operationalDatabase, home);
  const fingerprint = 'c'.repeat(64);
  const typingInputs: Parameters<NonNullable<DshImOutboundService['beginTypingChecked']>>[2][] = [];
  const stops = vi.fn(async () => {});
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    ...(supported ? { typingVersion: 1 as const } : {}),
    listBots: async () => [{ botId: 'paired', channel: 'weixin' }],
    listTargets: async () => [{ targetId: 'owner', kind: 'user', route: { toUserId: 'owner' } }],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'weixin',
      connected: true,
      account: { fingerprint, name: 'Own WeChat' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        ...(supported ? ['typing-lifecycle-checked'] : []),
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    consumeInbound: async (_account, options) => {
      consumer = options;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async () => ({ sent: true }),
    async beginTypingChecked(_account, route, options) {
      expect(route).toMatchObject({
        actorId: 'owner',
        conversationId: 'owner',
        messageId: '911-native',
      });
      expect(options.expectedFingerprint).toBe(fingerprint);
      expect(options.beforeSend()).toBe(true);
      typingInputs.push(options);
      if (nativeRefusal) throw new Error('private typing ticket');
      options.onState({ phase: 'accepted' });
      return {
        accepted: true,
        stop: async () => {
          await stops();
          options.onState({ phase: 'idle', reason: 'completed' });
        },
      };
    },
  };
  const register = () => core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  const unregister = register();
  const target = (await core.externalMessaging.targets('dsh-im/weixin', 'paired'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/weixin',
    accountRef: 'paired',
    fingerprint,
    targetRef: 'owner',
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  const receive = async () => {
    await consumer.onEvent(
      {
        version: 1,
        channel: 'weixin',
        botId: 'paired',
        fingerprint,
        eventId: '911-delivery',
        messageId: '911-native',
        actor: { kind: 'user', id: 'owner' },
        conversation: { kind: 'dm', id: 'owner' },
        mentions: [],
        mentionedAccount: false,
        at: new Date(Date.now() + 10).toISOString(),
        text: '911 controlled work',
        reply: { messageId: '911-native', actorId: 'owner', conversationId: 'owner' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      },
      { signal: consumer.signal },
    );
    await tick();
    await vi.waitFor(() => expect(runs).toHaveLength(1));
  };
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'typing-test').read((db) =>
      db.prepare(sql).all(),
    );
  return {
    core,
    home,
    grant,
    receive,
    runs,
    release,
    typingInputs,
    stops,
    register,
    unregister,
    query,
    agents,
    finishAssignment,
  };
}

it.each([true, false])(
  'global typing changes cancel only inherited work (inherit=%s)',
  async (inheritTyping) => {
    const f = await fixture();
    const identity = (await f.core.externalMessaging.snapshot('ada')).identities![0]!;
    await f.core.externalMessaging.identity('ada', {
      kind: 'update',
      id: identity.id,
      expectedRevision: identity.revision,
      name: identity.name,
      enabled: true,
      inheritEnabled: true,
      typingEnabled: true,
      inheritTyping,
    });
    await f.receive();
    await vi.waitFor(() => expect(f.typingInputs).toHaveLength(1));
    const {
      revision,
      changedAt: _at,
      ...preferences
    } = f.core.externalMessaging.defaults('weixin');
    await f.core.externalMessaging.setDefaults({
      ...preferences,
      expectedRevision: revision,
      typingEnabled: false,
    });
    await tick();
    expect(f.stops).toHaveBeenCalledTimes(inheritTyping ? 1 : 0);
    expect(f.typingInputs[0]!.beforeSend()).toBe(!inheritTyping);
    expect((await f.core.externalMessaging.snapshot('ada')).identities![0]).toMatchObject({
      typingEnabled: !inheritTyping,
      typingInheritance: inheritTyping ? 'inherit' : 'custom',
    });
    f.release();
    await f.core.runtime.whenIdle();
  },
);

it('keeps one native lease alive for related Assignment work after the Inbox turn ends', async () => {
  const f = await fixture({ deferAssignment: true });
  await f.receive();
  await vi.waitFor(() => expect(f.typingInputs).toHaveLength(1));
  const created = f.runs[0]!.assignments.create({
    title: 'Assignment',
    grantId: TEST_GRANT_ID,
    description: 'related WeChat work',
  });
  if (created.outcome !== 'created') throw new Error('Assignment refused');
  f.release();
  await vi.waitFor(() =>
    expect(
      f.query(
        "SELECT a.attempt_state FROM inbox_admissions a JOIN source_events e USING (source_event_id) WHERE e.body = '911 controlled work' AND a.bot_slug = 'ada'",
      ),
    ).toEqual([{ attempt_state: 'handled' }]),
  );
  expect(f.typingInputs).toHaveLength(1);
  expect(f.stops).not.toHaveBeenCalled();
  f.finishAssignment();
  await f.core.runtime.whenIdle();
  expect(f.stops).toHaveBeenCalledTimes(1);
});

it('waits for native follow-up acceptance before starting another typing lease', async () => {
  const f = await fixture({ deferAssignment: true });
  await f.receive();
  const created = f.runs[0]!.assignments.create({
    title: 'Assignment',
    grantId: TEST_GRANT_ID,
    description: 'related WeChat work',
  });
  if (created.outcome !== 'created') throw new Error('Assignment refused');
  f.release();
  f.finishAssignment();
  await f.core.runtime.whenIdle();
  expect(f.typingInputs).toHaveLength(1);
  expect(f.stops).toHaveBeenCalledTimes(1);
  let accept!: () => void;
  let finish!: () => void;
  const accepted = new Promise<void>((done) => {
    accept = done;
  });
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  cleanup.push(async () => {
    accept();
    finish();
  });
  f.agents.requestAssignment = () => ({ delivery: 'followup', accepted, done });
  expect(
    f.runs[0]!.assignments.request({
      sessionId: created.assignment.sessionId,
      mode: 'next-turn',
      text: 'continue related work',
    }),
  ).toMatchObject({ acceptance: 'pending' });
  await tick();
  expect(f.typingInputs).toHaveLength(1);
  accept();
  await vi.waitFor(() => expect(f.typingInputs).toHaveLength(2));
  expect(f.stops).toHaveBeenCalledTimes(1);
  finish();
  await f.core.runtime.whenIdle();
  expect(f.stops).toHaveBeenCalledTimes(2);
});

it.each([false, true])(
  'links native typing to the canonical Inbox turn and clears after failure=%s',
  async (failure) => {
    const f = await fixture({ failure });
    await f.receive();
    await vi.waitFor(() => expect(f.typingInputs).toHaveLength(1));
    const snapshot = await f.core.externalMessaging.snapshot('ada');
    expect(snapshot.identities![0]).toMatchObject({
      typingEnabled: true,
      typing: { supported: true, phase: 'accepted' },
    });
    expect(f.query('SELECT * FROM messaging_outbox')).toEqual([]);
    expect(JSON.stringify(f.query('SELECT * FROM messaging_bindings'))).not.toContain('ticket');
    expect(f.stops).not.toHaveBeenCalled();
    f.release();
    await f.core.runtime.whenIdle();
    expect(f.stops).toHaveBeenCalledTimes(1);
    expect((await f.core.externalMessaging.snapshot('ada')).identities![0]!.typing?.phase).toBe(
      'idle',
    );
  },
);

it.each(['grant', 'binding', 'preference', 'provider', 'unregister', 'runtime-close'] as const)(
  'cancels live native work immediately on %s',
  async (change) => {
    const f = await fixture();
    await f.receive();
    await vi.waitFor(() => expect(f.typingInputs).toHaveLength(1));
    const identity = (await f.core.externalMessaging.snapshot('ada')).identities![0]!;
    let closing: Promise<void> | undefined;
    if (change === 'grant') f.core.externalMessaging.revoke('ada', f.grant.id);
    else if (change === 'provider') f.register();
    else if (change === 'unregister') f.unregister();
    else if (change === 'runtime-close') closing = f.core.runtime.close();
    else
      await f.core.externalMessaging.identity('ada', {
        kind: 'update',
        id: identity.id,
        expectedRevision: identity.revision,
        name: identity.name,
        enabled: change !== 'binding',
        ...(change === 'preference' ? { typingEnabled: false } : {}),
      });
    await vi.waitFor(() => expect(f.stops).toHaveBeenCalledTimes(1));
    expect(f.typingInputs[0]!.signal.aborted).toBe(true);
    expect(f.typingInputs[0]!.beforeSend()).toBe(false);
    f.release();
    await closing;
    await f.core.runtime.whenIdle();
  },
);

it.each([false, true])(
  'unsupported or refused typing does not block the real Inbox turn: supported=%s',
  async (supported) => {
    const f = await fixture({ supported, nativeRefusal: true });
    await f.receive();
    const snapshot = await f.core.externalMessaging.snapshot('ada');
    expect(snapshot.identities![0]!.typing?.supported).toBe(supported);
    if (supported) expect(snapshot.identities![0]!.typing?.phase).toBe('unavailable');
    else expect(f.typingInputs).toEqual([]);
    f.release();
    await f.core.runtime.whenIdle();
    expect(f.runs).toHaveLength(1);
  },
);

it('local DM work never borrows an existing paired WeChat identity to show typing', async () => {
  const f = await fixture();
  const dm = f.core.channels.getOrCreateDm('ada', 'Ada')!;
  const admission = f.core.runtime.admitDmMessage({
    channelId: dm.id,
    messageId: 'local',
    body: 'local work',
  });
  expect(admission.admitted).toBe(true);
  if (!admission.admitted) throw new Error('local admission refused');
  await vi.waitFor(() => expect(f.runs).toHaveLength(1));
  expect(f.typingInputs).toEqual([]);
  f.release();
  await admission.settled;
});

it('saves only the identity preference through the real bridge and retains it across restart', async () => {
  const f = await fixture();
  const identity = (await f.core.externalMessaging.snapshot('ada')).identities![0]!;
  expect(
    await createBridgeMethods(f.core).messagingIdentity({
      slug: 'ada',
      input: {
        kind: 'update',
        id: identity.id,
        expectedRevision: identity.revision,
        name: identity.name,
        enabled: true,
        typingEnabled: false,
      },
    }),
  ).toMatchObject({ ok: true });
  await f.receive();
  expect(f.typingInputs).toEqual([]);
  f.release();
  await f.core.runtime.whenIdle();
  f.core.externalMessaging.close();
  await f.core.runtime.close();
  f.core.operationalDatabase.close();
  const reopened: BotHarnessCore = createCore({ dshHome: f.home });
  try {
    expect((await reopened.externalMessaging.snapshot('ada')).identities![0]).toMatchObject({
      typingEnabled: false,
    });
  } finally {
    reopened.externalMessaging.close();
    await reopened.runtime.close();
    reopened.operationalDatabase.close();
  }
});
