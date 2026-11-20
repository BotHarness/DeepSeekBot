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
