import { join } from 'node:path';
import fc from 'fast-check';
import { SessionId } from '@deepseek-ai/dsh-session';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { ChannelToolApproval, type ToolAutoApproval } from '../src/workspaces/tool-approval.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

async function fixture(
  options: {
    onLaterTurn?: () => Promise<void>;
    releaseTurn?: () => void;
    autoApproval?: ToolAutoApproval;
    initializationBody?: string;
  } = {},
) {
  const home = createTempRoot('direct-private-approval-');
  let turns = 0;
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session) => {
        if (++turns === 1)
          session.append('user/message', {
            role: 'user',
            content: [
              {
                type: 'text',
                text: options.initializationBody ?? 'Initialize the test Agent without a model.',
              },
            ],
          });
        else await options.onLaterTurn?.();
      },
    },
  );
  let approval: ChannelToolApproval;
  const core = createCore({
    dshHome: home,
    agents: createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => join(home, 'memory'),
      onAgentSetup: (ctx) => {
        for (const name of ['secret_cli', 'secret_http'])
          ctx.tools.register({
            name,
            description: 'Exercise approval only; never access a secret or start a process.',
            parameters: { type: 'object', properties: {} },
            output: {
              schema: { type: 'object', properties: { outcome: { type: 'string' } } },
              render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
            },
            execute: async (_args, execution) => {
              if (execution.agent === undefined) throw new Error('Missing actual Agent');
              const release = approval.track(execution, 'operation', true);
              try {
                return {
                  outcome: await approval.ask({
                    agent: execution.agent,
                    toolName: execution.name,
                    callId: execution.callId,
                    signal: execution.signal,
                  }),
                };
              } finally {
                release?.();
              }
            },
          });
      },
    }),
  });
  approval = new ChannelToolApproval(
    core.channels,
    core.ownership,
    core.toolRules,
    undefined,
    undefined,
    undefined,
    (query) => core.runtime.toolApprovalOrigin?.(query),
    options.autoApproval,
    undefined,
    core.team.approvals,
    (query) => core.runtime.hasDirectToolInvocation?.(query) === true,
  );
  closes.push(async () => {
    options.releaseTurn?.();
    approval.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'direct-private-approval-test');
  db.transaction((sql) => {
    sql.prepare('UPDATE team_settings SET enabled=1').run();
    for (const id of ['alice', 'bob']) {
      sql.prepare("INSERT INTO humans VALUES (?,?,'active','now')").run(id, id);
      sql.prepare("INSERT INTO human_roles VALUES (?,'member')").run(id);
    }
  });
  for (const id of ['alice', 'bob']) core.spaces.ensureAccount(id);
  expect(
    core.registry.create({ slug: 'helper', displayName: 'Helper', ownerHumanId: 'bob' }).ok,
  ).toBe(true);
  const approver = core.team.roles.create(OWNER_HUMAN_CONTEXT, 'Test approver', [
    'approvals.opaqueTools',
  ]).role;
  core.team.roles.set(OWNER_HUMAN_CONTEXT, 'bob', [approver.roleId]);
  core.team.bots.setVisibility(OWNER_HUMAN_CONTEXT, 'helper', {
    kind: 'public',
    audience: { kind: 'everyone' },
  });
  const ownerDm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'helper', 'Helper')!;
  const admitted = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
    channelId: ownerDm.id,
    messageId: 'initialize-live-agent',
    body: options.initializationBody ?? 'Initialize the test Agent without a model.',
  });
  if (!admitted.admitted) throw new Error('Initialization was not admitted');
  await admitted.settled;
  const sessionId = core.runtime.currentOrchestratorSessionId?.('helper');
  if (sessionId === undefined) throw new Error('Missing live Orchestrator');
  expect(core.runtime.askChannel?.(sessionId)).toBeUndefined();
  return { core, approval, host, ownerDm, sessionId };
}

describe('ADR-0186 direct private-tool approval origin', () => {
  it.each(['secret_cli', 'secret_http'])(
    'posts idle %s approval in the authenticated participant DM',
    async (tool) => {
      const state = await fixture();
      const bob = humanContext('bob');
      const dm = state.core.channels.getOrCreateDm(bob, 'helper', 'Helper')!;
      const controller = new AbortController();
      const request = state.core.runtime.runDirectBotTool!(
        'helper',
        tool,
        tool === 'secret_http'
          ? { method: 'GET', path: '/audit/approval-reviewer.json', account: 'synthetic-missing' }
          : { program: 'git', account: 'synthetic-missing' },
        controller.signal,
        undefined,
        undefined,
        bob,
      );
      try {
        await vi.waitFor(() =>
          expect(
            state.core.channels
              .readMessages(dm.id)
              .filter((message) => message.toolApprovalRequest),
          ).toHaveLength(1),
        );
        const card = state.core.channels
          .readMessages(dm.id)
          .find((message) => message.toolApprovalRequest);
        if (card?.toolApprovalRequest === undefined) throw new Error('Missing approval card');
        expect(card.toolApprovalRequest.sessionId).toBe(state.sessionId);
        expect(
          state.core.channels.readMessages(state.ownerDm.id).some((m) => m.toolApprovalRequest),
        ).toBe(false);
        await expect(
          state.approval.decide(OWNER_HUMAN_CONTEXT, 'helper', card.id, 'rejected'),
        ).rejects.toMatchObject({ code: 'approval-not-allowed' });
        await state.approval.decide(bob, 'helper', card.id, 'rejected');
        expect(await request).toMatchObject({ result: { outcome: 'rejected' } });
        expect(
          state.core.runtime.toolApprovalOrigin?.({
            sessionId: SessionId(state.sessionId),
            callId: ToolCallId(card.toolApprovalRequest.callId),
          })?.channelId,
        ).toBeUndefined();
        expect(state.host.get(state.sessionId)).toBeDefined();
        expect(state.host.disposed).not.toContain(state.sessionId);
      } finally {
        controller.abort();
        await request.catch(() => undefined);
      }
    },
  );

  it('reviews a direct call without exposing another Human prior Session history', async () => {
    const review = vi.fn<ToolAutoApproval['review']>(async () => ({
      outcome: 'ask-human',
      reason: 'Ask the caller.',
    }));
    const privateMarker = 'OWNER-PRIVATE-CONTEXT-SENTINEL';
    const state = await fixture({
      initializationBody: privateMarker,
      autoApproval: {
        template: () => ({ name: 'qa-guidance', text: '# Ask the Human when uncertain' }),
        review,
        log: vi.fn(),
      },
    });
    const agent = state.host.get(state.sessionId);
    if (agent === undefined) throw new Error('Missing initialized Agent');
    expect(JSON.stringify(agent.session.snapshotEvents())).toContain(privateMarker);
    const bob = humanContext('bob');
    const controller = new AbortController();
    const request = state.core.runtime.runDirectBotTool!(
      'helper',
      'secret_cli',
      { program: 'git', account: 'synthetic-missing' },
      controller.signal,
      undefined,
      undefined,
      bob,
    );
    try {
      await vi.waitFor(() => expect(review).toHaveBeenCalledOnce());
      const reviewed = review.mock.calls[0]?.[0];
      expect(reviewed?.excerpt).toEqual({ humanMessages: [], toolCalls: [] });
      expect(reviewed?.call.input).toContain('synthetic-missing');
      expect(JSON.stringify(reviewed)).not.toContain(privateMarker);
    } finally {
      controller.abort();
      await request.catch(() => undefined);
    }
  });

  it('isolates concurrent caller DMs and removes only the cancelled call origin', async () => {
    const state = await fixture();
    const humans = [humanContext('alice'), humanContext('bob')];
    const controllers = humans.map(() => new AbortController());
    const dms = humans.map((human) =>
      state.core.channels.getOrCreateDm(human, 'helper', 'Helper')!,
    );
    const requests = humans.map((human, index) =>
      state.core.runtime.runDirectBotTool!(
        'helper',
        'secret_cli',
        { program: 'git', account: `synthetic-${human.humanId}` },
        controllers[index]!.signal,
        undefined,
        undefined,
        human,
      ),
    );
    const settled = Promise.allSettled(requests);
    try {
      await vi.waitFor(() => {
        for (const dm of dms)
          expect(
            state.core.channels.readMessages(dm.id).filter((m) => m.toolApprovalRequest),
          ).toHaveLength(1);
      });
      const cards = dms.map((dm, index) => {
        const human = humans[index];
        if (human === undefined) throw new Error('Missing concurrent caller');
        const message = state.core.channels.readMessages(dm.id).find((m) => m.toolApprovalRequest);
        if (message?.toolApprovalRequest === undefined) throw new Error('Missing approval');
        expect(JSON.parse(message.toolApprovalRequest.input)).toMatchObject({
          account: `synthetic-${human.humanId}`,
        });
        return { id: message.id, callId: message.toolApprovalRequest.callId };
      });
      for (const [index, card] of cards.entries())
        expect(
          state.core.runtime.toolApprovalOrigin?.({
            sessionId: SessionId(state.sessionId),
            callId: ToolCallId(card.callId),
          })?.channelId,
        ).toBe(dms[index]!.id);
      expect(cards[0]!.callId).not.toBe(cards[1]!.callId);
      expect(state.core.runtime.askChannel?.(state.sessionId)).toBeUndefined();
      fc.assert(
        fc.property(fc.uuid(), (otherSessionId) => {
          fc.pre(otherSessionId !== state.sessionId);
          state.core.ownership.claim({
            sessionId: otherSessionId,
            botSlug: 'helper',
            rootRole: 'orchestrator',
            at: new Date().toISOString(),
          });
          for (const [index, card] of cards.entries()) {
            expect(
              state.core.runtime.toolApprovalOrigin?.({
                sessionId: SessionId(otherSessionId),
                callId: ToolCallId(card.callId),
              })?.channelId,
            ).toBeUndefined();
            expect(
              state.core.runtime.toolApprovalOrigin?.({
                sessionId: SessionId(state.sessionId),
                callId: ToolCallId(card.callId),
              })?.channelId,
            ).toBe(dms[index]!.id);
          }
        }),
      );
      controllers[0]!.abort();
      await requests[0]!.catch(() => undefined);
      expect(
        state.core.runtime.toolApprovalOrigin?.({
          sessionId: SessionId(state.sessionId),
          callId: ToolCallId(cards[0]!.callId),
        })?.channelId,
      ).toBeUndefined();
      expect(
        state.core.runtime.toolApprovalOrigin?.({
          sessionId: SessionId(state.sessionId),
          callId: ToolCallId(cards[1]!.callId),
        })?.channelId,
      ).toBe(dms[1]!.id);
      expect(await state.approval.decide(humans[0]!, 'helper', cards[0]!.id, 'allowed-once')).toBe(
        false,
      );
    } finally {
      for (const controller of controllers) controller.abort();
      await settled;
    }
    expect(state.host.get(state.sessionId)).toBeDefined();
  });

  it('preserves the active Group origin and refuses a direct call without a Human carrier', async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const state = await fixture({ onLaterTurn: () => held, releaseTurn: release });
    const controller = new AbortController();
    let request: ReturnType<NonNullable<typeof state.core.runtime.runDirectBotTool>> | undefined;
    try {
      const group = state.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Active Group',
        members: ['helper'],
      });
      await state.core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
        id: 'group-turn',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Helper work',
        mentions: [{ botSlug: 'helper', label: 'Helper', start: 0, end: 7 }],
      });
      state.core.runtime.admitGroupMessage(group.id, 'group-turn');
      await vi.waitFor(() =>
        expect(state.core.runtime.askChannel?.(state.sessionId)).toBe(group.id),
      );
      const bob = humanContext('bob');
      const dm = state.core.channels.getOrCreateDm(bob, 'helper', 'Helper')!;
      request = state.core.runtime.runDirectBotTool!(
        'helper',
        'secret_cli',
        { program: 'git', account: 'synthetic-bob' },
        controller.signal,
        undefined,
        undefined,
        bob,
      );
      await vi.waitFor(() =>
        expect(
          state.core.channels.readMessages(dm.id).filter((m) => m.toolApprovalRequest),
        ).toHaveLength(1),
      );
      const card = state.core.channels.readMessages(dm.id).find((m) => m.toolApprovalRequest);
      if (card?.toolApprovalRequest === undefined) throw new Error('Missing approval');
      expect(
        state.core.runtime.toolApprovalOrigin?.({
          sessionId: SessionId(state.sessionId),
          callId: ToolCallId(card.toolApprovalRequest.callId),
        })?.channelId,
      ).toBe(dm.id);
      expect(
        state.core.runtime.toolApprovalOrigin?.({
          sessionId: SessionId(state.sessionId),
          callId: ToolCallId('ordinary-model-call'),
        })?.channelId,
      ).toBe(group.id);
      expect(state.core.runtime.askChannel?.(state.sessionId)).toBe(group.id);
      expect(state.core.channels.readMessages(group.id).some((m) => m.toolApprovalRequest)).toBe(
        false,
      );
      const unbound = await state.core.runtime.runDirectBotTool!(
        'helper',
        'secret_cli',
        { program: 'git', account: 'unbound' },
        new AbortController().signal,
      );
      expect(unbound).toMatchObject({ result: { outcome: 'unavailable' } });
      expect(state.core.channels.readMessages(group.id).some((m) => m.toolApprovalRequest)).toBe(
        false,
      );
    } finally {
      controller.abort();
      await request?.catch(() => undefined);
      release();
      await state.core.runtime.whenIdle();
    }
  });
});
