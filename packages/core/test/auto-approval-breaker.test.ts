import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import type { ApprovalReview } from '../src/workspaces/approval-reviewer.js';
import {
  AUTO_APPROVAL_CONSECUTIVE_REJECTIONS,
  AUTO_APPROVAL_SESSION_REJECTIONS,
  ChannelToolApproval,
} from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function fixture() {
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
    },
    async runAssignment() {},
    async close() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
  };
  let broker: ChannelToolApproval;
  const core = createCore({
    dshHome: createTempRoot('botharness-auto-breaker-'),
    agents,
    activeToolApprovalMessageIds: () => broker?.activeMessageIds() ?? [],
  });
  closers.push(async () => {
    broker.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const verdicts: Array<ApprovalReview['outcome']> = [];
  const review = vi.fn(async (): Promise<ApprovalReview> => {
    const outcome = verdicts.shift() ?? 'reject';
    return { outcome, reason: outcome === 'allow' ? 'Fine.' : 'Not under this template.' };
  });
  broker = new ChannelToolApproval(
    core.channels,
    core.ownership,
    undefined,
    () => 'qa-scope',
    undefined,
    undefined,
    undefined,
    {
      template: () => ({ name: 'cautious', text: '# Cautious' }),
      review,
      log: () => undefined,
    },
  );
  const methods = createBridgeMethods({ ...core, toolApproval: broker });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const channelId = core.channels.getOrCreateDm('ada', 'Ada')!.id;
  const sessionId = 'qa-ada';
  core.ownership.claim({
    sessionId,
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: '2026-10-01T08:00:00Z',
  });
  const agent = {
    session: { id: sessionId, header: { cwd: '/qa' }, snapshotEvents: () => [] },
  } as unknown as Agent;
  let calls = 0;
  const callWith = (args: Record<string, unknown>) => {
    calls += 1;
    const callId = 'call-' + String(calls);
    broker.track({
      agent,
      name: 'bash',
      callId,
      arguments: args,
      token: Symbol(callId),
    } as ToolExecution);
    return broker.ask({ agent, toolName: 'bash', callId });
  };
  const call = (command: string) => callWith({ command });
  const messages = () => core.channels.readMessages(channelId);
  return {
    core,
    broker,
    methods,
    review,
    verdicts,
    channelId,
    sessionId,
    call,
    callWith,
    messages,
    runs,
  };
}

describe('allow this once anyway from the Human Inbox', () => {
  it('lets the identical retry run without review while other calls stay reviewed', async () => {
    const f = fixture();
    expect(
      await f.callWith({ command: 'git push', sandbox_permissions: 'danger-full-access' }),
    ).toBe('rejected');
    const page = f.methods.humanAttention({ category: 'action', kind: 'auto-rejection' });
    if (!page.ok) throw new Error('inbox failed');
    expect(page.value.items).toHaveLength(1);
    const item = page.value.items[0]!;
    expect(item).toMatchObject({
      kind: 'auto-rejection',
      botSlug: 'ada',
      channelId: f.channelId,
      autoRejection: {
        sessionId: f.sessionId,
        toolName: 'bash',
        template: 'cautious',
        reason: 'Not under this template.',
      },
    });
    expect(item.autoRejection?.input).toContain('git push');
    expect(f.methods.humanAttentionStatus({})).toMatchObject({
      ok: true,
      value: { hasAction: true },
    });

    const override = await f.methods.toolAutoRejectionOverride({ itemId: item.id });
    expect(override.ok).toBe(true);
    const overrideMessage = f.messages().find((message) => message.toolAutoApprovalOverride);
    expect(overrideMessage).toMatchObject({
      author: { kind: 'human' },
      replyTo: item.messageId,
      toolAutoApprovalOverride: { botSlug: 'ada', sessionId: f.sessionId, toolName: 'bash' },
    });
    await f.core.runtime.whenIdle();
    expect(f.runs.at(-1)?.message).toContain('Human allowed an auto-rejected call once');
    expect(f.runs.at(-1)?.message).toContain('"command": "git push"');
    const after = f.methods.humanAttention({ category: 'action', kind: 'auto-rejection' });
    expect(after.ok && after.value.items).toEqual([]);
    expect((await f.methods.toolAutoRejectionOverride({ itemId: item.id })).ok).toBe(false);

    const reviewed = f.review.mock.calls.length;
    expect(await f.call('git push')).toBe('rejected');
    expect(f.review.mock.calls.length).toBe(reviewed + 1);
    const retry = { sandbox_permissions: 'danger-full-access', command: 'git push' };
    expect(await f.callWith(retry)).toBe('allowed-once');
    expect(f.review.mock.calls.length).toBe(reviewed + 1);
    expect(await f.callWith(retry)).toBe('rejected');
    expect(f.review.mock.calls.length).toBe(reviewed + 2);
  });
});

describe('auto approval circuit breaker', () => {
  it('pauses after three rejections in a row and resumes on the next Human approval', async () => {
    const f = fixture();
    for (let index = 0; index < AUTO_APPROVAL_CONSECUTIVE_REJECTIONS; index += 1)
      expect(await f.call('rm -rf build-' + String(index))).toBe('rejected');
    expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(true);
    const paused = f.messages().filter((message) => message.toolAutoApprovalPause);
    expect(paused).toHaveLength(1);
    expect(paused[0]).toMatchObject({
      author: { kind: 'system' },
      toolAutoApprovalPause: { state: 'paused', reason: 'consecutive', template: 'cautious' },
    });

    const reviewed = f.review.mock.calls.length;
    const answer = f.call('pnpm test');
    await vi.waitFor(() =>
      expect(f.messages().some((message) => message.toolApprovalRequest)).toBe(true),
    );
    expect(f.review.mock.calls.length).toBe(reviewed);
    const card = f.messages().find((message) => message.toolApprovalRequest)!;
    const decided = await f.methods.toolApprovalDecide({
      channelId: f.channelId,
      messageId: card.id,
      outcome: 'allowed-once',
    });
    expect(decided.ok).toBe(true);
    expect(await answer).toBe('allowed-once');
    expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(false);
    expect(
      f
        .messages()
        .filter((message) => message.toolAutoApprovalPause)
        .map((message) => message.toolAutoApprovalPause?.state),
    ).toEqual(['resumed', 'paused']);

    f.verdicts.push('allow');
    expect(await f.call('pnpm lint')).toBe('allowed-once');
    expect(f.review.mock.calls.length).toBe(reviewed + 1);
  });

  it('pauses after twenty rejections in one Session even when allows come between', async () => {
    const f = fixture();
    for (let rejections = 1; rejections <= AUTO_APPROVAL_SESSION_REJECTIONS; rejections += 1) {
      expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(false);
      expect(await f.call('reject-' + String(rejections))).toBe('rejected');
      if (rejections % 2 === 0 && rejections < AUTO_APPROVAL_SESSION_REJECTIONS) {
        f.verdicts.push('allow');
        expect(await f.call('allow-' + String(rejections))).toBe('allowed-once');
      }
    }
    expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(true);
    expect(
      f.messages().find((message) => message.toolAutoApprovalPause)?.toolAutoApprovalPause,
    ).toMatchObject({ state: 'paused', reason: 'session' });
  });

  it('resumes when the Human allows an auto-rejected call from the Inbox', async () => {
    const f = fixture();
    for (let index = 0; index < AUTO_APPROVAL_CONSECUTIVE_REJECTIONS; index += 1)
      await f.call('x-' + String(index));
    expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(true);
    const page = f.methods.humanAttention({ category: 'action', kind: 'auto-rejection' });
    if (!page.ok) throw new Error('inbox failed');
    expect(page.value.items).toHaveLength(AUTO_APPROVAL_CONSECUTIVE_REJECTIONS);
    const override = await f.methods.toolAutoRejectionOverride({
      itemId: page.value.items[0]!.id,
    });
    expect(override.ok).toBe(true);
    expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(false);
  });
});
