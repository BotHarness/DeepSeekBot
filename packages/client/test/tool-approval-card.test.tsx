// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelMessage } from '../src/client/store.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';
import { resourceEvents } from './resource-events-fixture.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./primitive-mocks.js')).shellPrimitives(),
);

describe('Tool approval card with separate status and execution reads', () => {
  it('keeps approval actionable after an execution read fails and preserves capacity through a timeout', async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    const root = createRoot(container);
    const live = resourceEvents();
    const actions = {
      toolApprovalStatus: vi.fn(async () => 'pending' as const),
      toolApprovalExecutionState: vi
        .fn()
        .mockRejectedValueOnce(new Error('invalid execution snapshot'))
        .mockResolvedValueOnce('waiting-capacity')
        .mockRejectedValueOnce(new DOMException('Read timed out', 'TimeoutError'))
        .mockRejectedValueOnce(new Error('invalid execution snapshot')),
      decideToolApproval: vi.fn(),
    };
    const message: ChannelMessage = {
      id: 'approval',
      at: '2026-11-20T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve bash',
      toolApprovalRequest: {
        role: 'assignment',
        sessionId: 'assignment',
        callId: 'call',
        toolName: 'bash',
        cwd: '/qa',
        input: '{}',
      },
    };
    const invalidate = () =>
      act(async () => {
        live.emit({ resource: 'tool-approval', channelId: 'dm-ada', messageId: message.id });
        await vi.advanceTimersByTimeAsync(25);
      });
    try {
      await act(async () => {
        root.render(createElement(ToolApprovalCard, { message, actions, t: zhTranslate }));
      });
      expect(actions.toolApprovalStatus).toHaveBeenCalledExactlyOnceWith('dm-ada', message.id);
      const allow = [...container.querySelectorAll('button')].find(
        (button) => button.textContent === '允许这次',
      );
      expect(allow?.disabled).toBe(false);

      await invalidate();
      expect(container.textContent).toContain('等待运行名额');
      await invalidate();
      expect(container.textContent).toContain('等待运行名额');
      expect(actions.toolApprovalStatus).toHaveBeenCalledTimes(3);

      await invalidate();
      expect(container.textContent).not.toContain('等待运行名额');
      expect(actions.toolApprovalStatus).toHaveBeenCalledTimes(4);
      expect(allow?.disabled).toBe(false);
    } finally {
      await act(async () => root.unmount());
      live.dispose();
      vi.useRealTimers();
    }
  });
});

it('names the person or conversation a block approval covers', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  const root = createRoot(container);
  const actions = {
    toolApprovalStatus: vi.fn(async () => 'pending' as const),
    toolApprovalExecutionState: vi.fn().mockResolvedValue(undefined),
    decideToolApproval: vi.fn(),
  };
  const card = (input: Record<string, unknown>): ChannelMessage => ({
    id: 'approval',
    at: '2026-11-20T00:00:00Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'Approve bridge_source_block',
    toolApprovalRequest: {
      role: 'orchestrator',
      sessionId: 'session',
      callId: 'call',
      toolName: 'bridge_source_block',
      cwd: '/qa',
      input: JSON.stringify(input),
    },
  });
  try {
    await act(async () =>
      root.render(
        createElement(ToolApprovalCard, {
          message: card({
            action: 'block',
            scope: 'conversation',
            source_event_id: 'event',
            target_name: '全体',
            app: 'Slack QA',
          }),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    expect(container.textContent).toContain('屏蔽会话「全体」（Slack QA）');
    await act(async () =>
      root.render(
        createElement(ToolApprovalCard, {
          message: card({ action: 'unblock', block_id: 'id', target_name: 'QA B' }),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    expect(container.textContent).toContain('取消屏蔽「QA B」');
  } finally {
    await act(async () => root.unmount());
  }
});
