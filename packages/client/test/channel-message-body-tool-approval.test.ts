// @vitest-environment jsdom
import { resourceEvents } from './resource-events-fixture.js';
import { type ReactNode } from 'react';
import { type BotHarnessTranslate } from '../src/client/locale.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { type BridgeActions } from '../src/client/actions.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { en, zhTranslate } from '../src/client/locale.js';
import { toolApprovalText } from '../src/client/approval-text.js';
import { publishWorkspaceGrantChange } from '../src/client/workspace-grant-events.js';
import { type ChannelMessage } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/channel-message-body-primitives.js')).mockMessagePrimitives(),
);

beforeEach(() => {
  vi.mocked(MarkdownText).mockClear();
});

describe('Tool approval card', () => {
  it('keeps an accepted decision visible while capacity is unavailable, then clears the wait on execution', async () => {
    vi.useFakeTimers();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const live = resourceEvents();
    const toolApprovalState = vi
      .fn()
      .mockResolvedValueOnce({ status: 'expired', execution: 'waiting-capacity' })
      .mockRejectedValueOnce(new Error('read timed out'))
      .mockResolvedValue({ status: 'expired', execution: 'running' });
    const actions = { toolApprovalState } as unknown as BridgeActions;
    const message: ChannelMessage = {
      id: 'approval-capacity',
      at: '2026-10-09T00:00:00Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve bash',
      toolApprovalRequest: {
        sessionId: 'original',
        callId: 'call',
        role: 'assignment',
        toolName: 'bash',
        cwd: '/qa',
        input: '{}',
      },
    };
    try {
      await act(async () =>
        root.render(
          createElement(ChannelMessageBody, {
            message,
            actions,
            t: zhTranslate,
            toolApprovalDecision: 'allowed-once',
          }),
        ),
      );
      expect(container.textContent).toContain('终端 · 已允许');
      expect(container.textContent).toContain('等待运行名额');
      const selected = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
        (button) => button.textContent === '允许这次',
      )!;
      expect(selected.disabled).toBe(true);
      expect(selected.getAttribute('aria-pressed')).toBe('true');
      const change = {
        resource: 'tool-approval',
        channelId: 'dm-ada',
        messageId: message.id,
      } as const;
      await act(async () => vi.advanceTimersByTimeAsync(9000));
      expect(toolApprovalState).toHaveBeenCalledTimes(1);
      await act(async () => {
        live.emit(change);
        await vi.advanceTimersByTimeAsync(25);
      });
      expect(container.textContent).toContain('等待运行名额');
      await act(async () => {
        live.emit(change);
        await vi.advanceTimersByTimeAsync(25);
      });
      expect(container.textContent).not.toContain('等待运行名额');
      expect(container.textContent).toContain('终端 · 已允许');
      expect(toolApprovalState).toHaveBeenCalledTimes(3);
    } finally {
      live.dispose();
      await act(async () => root.unmount());
      container.remove();
      vi.useRealTimers();
    }
  });

  it('removes approval actions immediately when a Workspace Grant change expires the request', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const toolApprovalStatus = vi
      .fn()
      .mockResolvedValueOnce('pending')
      .mockResolvedValueOnce('expired');
    const actions = { toolApprovalStatus } as unknown as BridgeActions;
    const message: ChannelMessage = {
      id: 'approval-1',
      at: '2026-09-25T00:00:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Approve bash',
      toolApprovalRequest: {
        sessionId: 'assignment-1',
        callId: 'call-1',
        toolName: 'bash',
        role: 'assignment',
        cwd: '/tmp/project',
        input: '{"command":"pwd"}',
      },
    };
    try {
      await act(async () => {
        root.render(
          createElement(ChannelMessageBody, {
            message,
            t: zhTranslate,
            actions,
          }),
        );
      });
      expect(container.textContent).toContain('允许这次');
      await act(async () => {
        publishWorkspaceGrantChange('ada', actions);
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      expect(toolApprovalStatus).toHaveBeenCalledTimes(2);
      expect(container.textContent).not.toContain('允许这次');
      expect(container.textContent).toContain('终端 · 已过期');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});

describe('Tool approval text follows the UI locale (#1293)', () => {
  const enTranslate: BotHarnessTranslate = (key, params) => {
    const value: unknown = Reflect.get(en, key);
    const text = typeof value === 'string' ? value : key;
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? `{${name}}`));
  };
  const request: ChannelMessage = {
    id: 'approval',
    at: '2026-10-09T00:00:00.000Z',
    author: { kind: 'bot', slug: 'ada' },
    body: '请求批准执行 bash',
    toolApprovalRequest: {
      sessionId: 's1',
      callId: 'c1',
      toolName: 'bash',
      role: 'orchestrator',
      cwd: '/work',
      input: '{}',
      externalDecision: 'operation',
    },
  } as ChannelMessage;
  const decision = (outcome: NonNullable<ChannelMessage['toolApprovalDecision']>['outcome']) =>
    ({
      id: 'decision-' + outcome,
      at: '2026-10-09T00:00:01.000Z',
      author: { kind: 'human' },
      body: '已拒绝这一次工具调用',
      replyTo: 'approval',
      toolApprovalDecision: { requestMessageId: 'approval', outcome },
    }) as ChannelMessage;

  it('derives request and decision text from structured fields, not the stored body', () => {
    expect(toolApprovalText(request, enTranslate)).toBe('Requests approval to run bash');
    expect(toolApprovalText(decision('rejected'), enTranslate)).toBe('This call was rejected');
    expect(toolApprovalText(decision('allowed-once'), enTranslate)).toBe('This call was approved');
    expect(toolApprovalText(decision('allowed-always-all'), enTranslate)).toBe(
      'Allowed this time and saved your choice',
    );
    expect(toolApprovalText(decision('rejected'), zhTranslate)).toBe('已拒绝这一次调用');
    expect(toolApprovalText({}, enTranslate)).toBeUndefined();
  });

  it('renders a decision bubble in English without the Host body', () => {
    const html = renderToStaticMarkup(
      createElement(ChannelMessageBody, {
        message: decision('rejected'),
        channelId: 'dm-ada',
        t: enTranslate,
      }),
    );
    expect(html).toContain('This call was rejected');
    expect(html).not.toMatch(/[\u4e00-\u9fff]/u);
  });
});
