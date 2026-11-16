import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import type { ApprovalReview } from '../src/workspaces/approval-reviewer.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';

const closers: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closers.splice(0)) await close();
});

function fixture(fullAccess?: () => boolean) {
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
    const outcome = verdicts.shift() ?? 'ask-human';
    return { outcome, reason: outcome === 'allow' ? 'Fine.' : 'Not under this template.' };
  });
  const template = vi.fn(() => ({ name: 'cautious', text: '# Cautious' }));
  broker = new ChannelToolApproval(
    core.channels,
    core.ownership,
    core.toolRules,
    () => 'qa-scope',
    undefined,
    undefined,
    undefined,
    {
      template,
      review,
      log: () => undefined,
    },
    fullAccess,
  );
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, toolApproval: broker });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const channelId = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id;
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
    template,
    verdicts,
    channelId,
    sessionId,
    call,
    callWith,
    messages,
    runs,
  };
}

describe('two-outcome Reviewer Human control', () => {
  it('keeps a native global-policy edit behind Human approval despite Full Access and a broad tool rule', async () => {
    let fullAccess = false;
    const f = fixture(() => fullAccess);
    const ordinary = f.call('ordinary operation');
    await vi.waitFor(() =>
      expect(f.messages().filter((message) => message.toolApprovalRequest)).toHaveLength(1),
    );
    const first = f.messages().find((message) => message.toolApprovalRequest)!;
    expect(await f.broker.decide(OWNER_HUMAN_CONTEXT, 'ada', first.id, 'allowed-always-tool')).toBe(
      true,
    );
    expect(await ordinary).toBe('allowed-once');
    f.review.mockClear();
    f.verdicts.push('allow');
    fullAccess = true;
    const policy = f.call(
      String.raw`Set-Content -LiteralPath 'C:\dsh\botharness\approval-templates\.selection.json' -Value '{"template":"get-work-done"}'`,
    );
    await vi.waitFor(() =>
      expect(f.messages().filter((message) => message.toolApprovalRequest)).toHaveLength(2),
    );
    expect(f.review).not.toHaveBeenCalled();
    const card = f
      .messages()
      .find((message) => message.toolApprovalRequest?.input.includes('.selection.json'))!;
    expect(await f.broker.decide(OWNER_HUMAN_CONTEXT, 'ada', card.id, 'rejected')).toBe(true);
    expect(await policy).toBe('rejected');
  });

  it('uses a Human-saved deterministic tool rule before template lookup or Reviewer calls', async () => {
    const f = fixture();
    expect(f.methods.approvalTemplates({ slug: 'ada' })).toMatchObject({
      value: { selected: '@global', source: 'global', effective: null },
    });
    const first = f.call('first operation');
    await vi.waitFor(() =>
      expect(f.messages().some((message) => message.toolApprovalRequest)).toBe(true),
    );
    const card = f.messages().find((message) => message.toolApprovalRequest)!;
    expect(await f.broker.decide(OWNER_HUMAN_CONTEXT, 'ada', card.id, 'allowed-always-tool')).toBe(
      true,
    );
    expect(await first).toBe('allowed-once');
    f.review.mockClear();
    f.template.mockClear();
    expect(await f.call('different input')).toBe('allowed-once');
    expect(f.review).not.toHaveBeenCalled();
    expect(f.messages().filter((message) => message.toolApprovalRequest)).toHaveLength(1);
    expect(f.template).not.toHaveBeenCalled();
    const listed = f.methods.toolApprovalRules({ slug: 'ada' });
    expect(listed.ok).toBe(true);
    if (!listed.ok) throw new Error('Expected canonical rules');
    const rule = listed.value.rules[0]!;
    expect(rule).toMatchObject({
      botSlug: 'ada',
      role: 'orchestrator',
      scopeKey: 'qa-scope',
      kind: 'tool',
    });
    expect(f.methods.toolApprovalRuleRevoke({ slug: 'ada', id: rule.id }).ok).toBe(true);
    f.verdicts.push('allow');
    expect(await f.call('different input')).toBe('allowed-once');
    expect(f.review).toHaveBeenCalledTimes(1);
    expect(f.core.toolRules.list('ada')).toHaveLength(1);
    expect(f.core.toolRules.list('ada')[0]?.revokedAt).toBeDefined();
  });
  it('keeps reviewing later calls after repeated Human rejections without pausing', async () => {
    const f = fixture();
    for (let index = 0; index < 4; index++) {
      const answer = f.call('uncovered-' + index);
      await vi.waitFor(() =>
        expect(f.messages().filter((message) => message.toolApprovalRequest)).toHaveLength(
          index + 1,
        ),
      );
      const card = f
        .messages()
        .find((message) => message.toolApprovalRequest?.input.includes('uncovered-' + index))!;
      expect(
        (
          await f.methods.toolApprovalDecide({
            channelId: f.channelId,
            messageId: card.id,
            outcome: 'rejected',
          })
        ).ok,
      ).toBe(true);
      expect(await answer).toBe('rejected');
      expect(f.broker.autoApprovalPaused(f.sessionId)).toBe(false);
    }
    expect(f.review).toHaveBeenCalledTimes(4);
    expect(f.messages().some((message) => message.toolAutoApprovalPause)).toBe(false);
    expect(
      f.messages().filter((message) => message.toolAutoApproval?.outcome === 'ask-human'),
    ).toHaveLength(4);
    f.verdicts.push('allow');
    expect(await f.call('covered')).toBe('allowed-once');
    expect(f.review).toHaveBeenCalledTimes(5);
  });
});
