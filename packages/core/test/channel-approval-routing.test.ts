import { Context, Service } from '@deepseek-ai/cordis';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerChannelToolApproval } from '../src/workspaces/tool-approval.js';

const contexts: Context[] = [];
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose();
});

async function fixture(policy: 'ask' | 'never' = 'ask', openTurn = true) {
  const ctx = new Context();
  contexts.push(ctx);
  new SessionProjectionRegistry(ctx);
  const native = vi.fn(async () => 'rejected' as const);
  ctx.on('approval/request', native, { global: true });
  const answer = vi.fn(async (request: { callId?: string }) =>
    request.callId === 'owned' ? ('allowed-once' as const) : undefined,
  );
  registerChannelToolApproval(ctx, { ask: answer });
  const service = new ApprovalService(ctx, { policy });
  await service[Service.init]();
  const session = Session.create(SessionId('approval-routing'));
  if (openTurn) session.append('turn/start', { turn: 1 });
  const agent = { session } as Agent;
  return { ctx, native, answer, service, agent };
}

describe('Channel approval routing through the native policy boundary', () => {
  it('answers owned calls before an earlier native answerer can swallow the request', async () => {
    const state = await fixture();
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
    const state = await fixture();
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
    const state = await fixture('never');
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
    const state = await fixture();
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
  it('refuses an idle Session before routing or appending approval audit events', async () => {
    const state = await fixture('ask', false);
    const before = state.agent.session.seq;
    await expect(
      state.service.request({
        agent: state.agent,
        toolName: 'bash',
        callId: ToolCallId('owned'),
      }),
    ).rejects.toThrow('outside an open turn');
    expect(state.agent.session.seq).toBe(before);
    expect(state.answer).not.toHaveBeenCalled();
    expect(state.native).not.toHaveBeenCalled();
  });
});
