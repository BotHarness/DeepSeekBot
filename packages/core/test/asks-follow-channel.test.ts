import { describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { ChannelUserQuestions } from '../src/channels/user-questions.js';
import { createCore } from '../src/plugin.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

describe('asks follow the Channel the task came from', () => {
  it('posts a question, a tool approval and a grant request in the Group whose mention started the turn', async () => {
    let ready!: (run: OrchestratorAgentRun) => void;
    let release!: () => void;
    const started = new Promise<OrchestratorAgentRun>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const core = createCore({
      dshHome: createTempRoot('bh-asks-follow-channel-'),
      agents: {
        async runOrchestrator(run) {
          ready(run);
          await held;
        },
        steerOrchestrator() {
          return true;
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    const askChannel = (sessionId: string): string | undefined =>
      core.runtime.askChannel?.(sessionId);
    const questions = new ChannelUserQuestions(
      core.channels,
      core.ownership,
      () => true,
      undefined,
      undefined,
      undefined,
      askChannel,
    );
    const approvals = new ChannelToolApproval(
      core.channels,
      core.ownership,
      undefined,
      undefined,
      undefined,
      undefined,
      askChannel,
    );
    const methods = createBridgeMethods({
      ...core,
      userQuestions: questions,
      toolApproval: approvals,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessageOnce(group.id, {
        id: 'group-mention',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@Ada read the handoff folder',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'group-mention');
      const run = await started;
      expect(core.runtime.askChannel?.(run.sessionId)).toBe(group.id);
      const agent = { session: { id: run.sessionId, header: { cwd: '/tmp/project' } } } as Agent;
      const cards = () =>
        core.channels
          .readMessages(group.id)
          .filter(
            (message) =>
              message.userQuestionRequest !== undefined ||
              message.toolApprovalRequest !== undefined ||
              message.grantRequest === true,
          );

      const answer = questions.ask({
        agent,
        questions: [{ id: 'which', question: 'Which folder?', options: [{ label: 'A' }] }],
      });
      await vi.waitFor(() => expect(cards()).toHaveLength(1));
      const question = cards().find((message) => message.userQuestionRequest !== undefined)!;
      expect(questions.requests('ada')[0]?.channelId).toBe(group.id);
      expect(
        await methods.userQuestionAnswer({
          channelId: group.id,
          messageId: question.id,
          answer: { answers: [{ id: 'which', selected: ['A'] }] },
        }),
      ).toEqual({ ok: true, value: { accepted: true } });
      expect((await answer)?.answers).toEqual([{ id: 'which', selected: ['A'] }]);
      expect(
        core.channels
          .readMessages(group.id)
          .some(
            (message) =>
              message.userQuestionResolution?.requestMessageId === question.id &&
              message.userQuestionResolution.state === 'answered',
          ),
      ).toBe(true);

      approvals.track({
        agent,
        name: 'bash',
        callId: 'call-1',
        arguments: { command: 'ls' },
        token: Symbol('call'),
      } as ToolExecution);
      const outcome = approvals.ask({ agent, toolName: 'bash', callId: 'call-1' });
      await vi.waitFor(() => expect(cards()).toHaveLength(2));
      const approval = cards().find((message) => message.toolApprovalRequest !== undefined)!;
      expect(approvals.requests('ada')[0]?.channelId).toBe(group.id);
      expect(
        await methods.toolApprovalDecide({
          channelId: group.id,
          messageId: approval.id,
          outcome: 'allowed-once',
        }),
      ).toEqual({ ok: true, value: { accepted: true } });
      expect(await outcome).toBe('allowed-once');

      const grant = await run.channels.requestGrant('Need the handoff folder');
      expect(core.channels.message(group.id, grant.id)?.grantRequest).toBe(true);
      expect(
        core.channels
          .readMessages(dm.id)
          .some(
            (message) =>
              message.userQuestionRequest !== undefined ||
              message.toolApprovalRequest !== undefined ||
              message.grantRequest === true,
          ),
      ).toBe(false);

      await core.channels.appendMessage(dm.id, {
        id: 'steered-dm',
        at: '2026-09-25T00:00:01.000Z',
        author: { kind: 'human' },
        body: 'Private task',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'steered-dm',
        body: 'Private task',
      });
      expect(core.runtime.askChannel?.(run.sessionId)).toBeUndefined();
    } finally {
      release();
      questions.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

describe('approval routing does not require a preliminary Channel message', () => {
  it('routes approval requests to the originating DM without a preliminary notice', async () => {
    let ready!: (run: OrchestratorAgentRun) => void;
    let release!: () => void;
    const started = new Promise<OrchestratorAgentRun>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const core = createCore({
      dshHome: createTempRoot('bh-ask-notice-'),
      agents: {
        async runOrchestrator(run) {
          ready(run);
          await held;
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-task',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Check the time',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-task',
        body: 'Check the time',
      });
      const run = await started;
      expect(core.runtime.askChannel?.(run.sessionId)).toBe(dm.id);
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps approval routing after the Bot has spoken', async () => {
    let ready!: (run: OrchestratorAgentRun) => void;
    let release!: () => void;
    const started = new Promise<OrchestratorAgentRun>((resolve) => {
      ready = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const core = createCore({
      dshHome: createTempRoot('bh-ask-notice-spoken-'),
      agents: {
        async runOrchestrator(run) {
          ready(run);
          await held;
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'dm-task',
        at: '2026-09-25T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Check the time',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'dm-task',
        body: 'Check the time',
      });
      const run = await started;
      await run.channels.send({ body: 'I will run date; please approve it.' });
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
