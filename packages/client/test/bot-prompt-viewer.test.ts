// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  return {
    ...dialogPrimitives(),
    IconInfoOutlineRegular: () => null,
    Tag: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    Tooltip: ({ children }: { children?: ReactNode }) => children,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotPromptViewer, type BotPromptView } from '../src/client/bot-prompt-viewer.js';
import { zhTranslate } from '../src/client/locale.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
});

async function show(view: BotPromptView, actions: Partial<BridgeActions>) {
  await act(async () => {
    root.render(
      createElement(BotPromptViewer, {
        slug: 'ada',
        displayName: 'Ada',
        view,
        actions: actions as BridgeActions,
        t: zhTranslate,
        onClose: () => undefined,
      }),
    );
  });
}

describe('BotPromptViewer', () => {
  it('shows the effective system prompt, its sections and a pending mark with its explanation', async () => {
    const botSystemPrompt = vi.fn(async () => ({
      sessionId: 's1',
      loaded: true,
      effectiveText: 'You are Ada.',
      effectiveSource: 'session' as const,
      next: {
        text: 'You are Ada, v2.',
        sections: [{ name: 'botharness:orchestrator-role', text: 'You are Ada, v2.' }],
        contexts: [{ name: 'working-directory', text: 'cwd: /m' }],
      },
      pending: true,
    }));
    await show('system-prompt', { botSystemPrompt });
    expect(botSystemPrompt).toHaveBeenCalledWith('ada');
    const body = document.body.textContent ?? '';
    expect(body).toContain('待生效');
    expect(body).toContain('You are Ada.');
    expect(body).toContain('botharness:orchestrator-role');
    expect(body).toContain('working-directory');
    expect(body).not.toContain('SOUL.md 和 MEMORY.md 在一个会话里保持冻结');
    const info = document.querySelector<HTMLButtonElement>('button[aria-label="查看底层逻辑"]')!;
    await act(async () => info.click());
    expect(document.body.textContent).toContain('SOUL.md 和 MEMORY.md 在一个会话里保持冻结');
  });

  it('shows each input message of the latest turn with its step and source', async () => {
    const botTurnInput = vi.fn(async () => ({
      slug: 'ada',
      sessionId: 's1',
      turns: [
        {
          turn: 4,
          messages: [
            { step: 1, source: 'user', at: '2026-10-26T00:00:00.000Z', text: '[Bot Inbox] hi' },
            { step: 1, source: 'runtime-context', at: '2026-10-26T00:00:00.000Z', text: 'cwd' },
          ],
        },
      ],
    }));
    await show('turn-input', { botTurnInput });
    const body = document.body.textContent ?? '';
    expect(body).toContain('第 4 轮');
    expect(body).toContain('[Bot Inbox] hi');
    expect(body).toContain('运行时上下文');
  });

  it('reports a failed read', async () => {
    await show('turn-input', {
      botTurnInput: vi.fn(async () => {
        throw new Error('offline');
      }),
    });
    expect(document.body.textContent).toContain('读取失败');
  });
});
