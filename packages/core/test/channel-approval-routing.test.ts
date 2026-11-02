import { Context } from '@deepseek-ai/cordis';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { describe, expect, it, vi } from 'vitest';
import { registerChannelToolApproval } from '../src/workspaces/tool-approval.js';

function fixture(policy: 'ask' | 'never' = 'ask') {
  const ctx = new Context();
  const native = vi.fn(async () => 'rejected' as const);
  ctx.on('approval/request', native, { global: true });
  const answer = vi.fn(async (request: { callId?: string }) =>
    request.callId === 'owned' ? ('allowed-once' as const) : undefined,
  );
  registerChannelToolApproval(ctx, { ask: answer });
  const service = new ApprovalService(ctx, { policy });
  const agent = {
    session: { seq: 1, eventAt: () => ({ type: 'turn/start' }), append: vi.fn() },
  } as unknown as Agent;
  return { ctx, native, answer, service, agent };
}

describe('Channel approval routing through the native policy boundary', () => {
  it('answers owned calls before an earlier native answerer can swallow the request', async () => {
    const state = fixture();
    expect(
      await state.service.request({
        agent: state.agent,
        toolName: 'bash',
        callId: ToolCallId('owned'),
      }),
    ).toBe('allowed-once');
    expect(state.native).not.toHaveBeenCalled();
  });
  it('delegates unowned calls to the original native answerer', async () => {
    const state = fixture();
    expect(
      await state.service.request({
        agent: state.agent,
        toolName: 'bash',
        callId: ToolCallId('other'),
      }),
    ).toBe('rejected');
    expect(state.native).toHaveBeenCalledOnce();
  });
  it('does not bypass native never policy', async () => {
    const state = fixture('never');
    expect(
      await state.service.request({
        agent: state.agent,
        toolName: 'bash',
        callId: ToolCallId('owned'),
      }),
    ).toBe('rejected');
    expect(state.answer).not.toHaveBeenCalled();
    expect(state.native).not.toHaveBeenCalled();
  });
  it('does not route cancelled requests', async () => {
    const state = fixture();
    expect(
      await state.service.request({
        agent: state.agent,
        toolName: 'bash',
        callId: ToolCallId('owned'),
        signal: AbortSignal.abort(),
      }),
    ).toBe('cancelled');
    expect(state.answer).not.toHaveBeenCalled();
  });
});
