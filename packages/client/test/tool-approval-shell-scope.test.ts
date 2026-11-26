// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WireShellApprovalSuggestions } from '@botharness/host-protocol/wire';
import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';
import { SHELL_SCOPE_LONG_PRESS_MS } from '../src/client/shell-approval-scope-menu.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

const message = (toolName = 'bash'): ChannelMessage =>
  ({
    id: 'request',
    at: '2026-11-27T08:00:00Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'Approve',
    toolApprovalRequest: {
      sessionId: 'session',
      callId: 'call',
      toolName,
      allowAlways: true,
      role: 'orchestrator',
      cwd: '/qa',
      input: '{"command":"git status -s"}',
    },
  }) as ChannelMessage;

const simple: WireShellApprovalSuggestions = {
  exact: 'git status -s',
  compound: false,
  unparseable: false,
  subcommands: [{ exact: 'git status -s', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' }],
};

let root: Root;
let node: HTMLDivElement;
let decisions: unknown[][];
let suggestions: WireShellApprovalSuggestions | undefined;
let refuse: Error | undefined;

const actions = (): BridgeActions =>
  ({
    toolApprovalStatus: async () => (decisions.length === 0 ? 'pending' : 'expired'),
    toolApprovalState: async () =>
      decisions.length === 0
        ? {
            status: 'pending',
            ...(suggestions === undefined ? {} : { shellSuggestions: suggestions }),
          }
        : { status: 'expired' },
    decideToolApproval: async (...args: unknown[]) => {
      if (refuse !== undefined) {
        const error = refuse;
        refuse = undefined;
        throw error;
      }
      decisions.push(args.slice(2));
    },
  }) as unknown as BridgeActions;

const render = async (value = message(), onBubbleMenu?: () => void): Promise<HTMLElement> => {
  await act(async () => {
    root.render(
      createElement(
        'div',
        { onContextMenu: onBubbleMenu },
        createElement(ToolApprovalCard, { message: value, actions: actions(), t: zhTranslate }),
      ),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return node.querySelector<HTMLElement>('.bh-tool-approval-card')!;
};

const always = (card: HTMLElement) =>
  [...card.querySelectorAll<HTMLButtonElement>('.bh-tool-approval-actions button')][1]!;

const menuItems = () =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].map(
    (item) => item.textContent ?? '',
  );

const choose = async (text: string) => {
  const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (entry) => entry.textContent === text,
  )!;
  await act(async () => item.click());
};

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  store.select({ kind: 'inbox' });
  decisions = [];
  suggestions = simple;
  refuse = undefined;
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});

afterEach(() => {
  act(() => root.unmount());
  node.remove();
  vi.useRealTimers();
});

describe('Shell Always allow scope menu', () => {
  it('keeps a plain click as the all-commands rule', async () => {
    const card = await render();
    await act(async () => always(card).click());
    await settle();
    expect(decisions).toEqual([['allowed-always-tool']]);
    expect(card.textContent).not.toContain('git status *');
  });

  it('opens on right-click without the message menu and saves the two-word prefix', async () => {
    const bubbleMenu = vi.fn();
    const card = await render(message(), bubbleMenu);
    await act(async () => {
      always(card).dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }),
      );
    });
    expect(menuItems()).toEqual([
      '所有 bash 命令',
      '以 git * 开头',
      '以 git status * 开头',
      '只允许这一条',
      '自定义…',
    ]);
    expect(bubbleMenu).not.toHaveBeenCalled();
    await choose('以 git status * 开头');
    await settle();
    expect(decisions).toEqual([
      ['allowed-always-prefix', { kind: 'prefix', patterns: ['git status *'] }],
    ]);
  });

  it('opens after a long press without also saving the click', async () => {
    vi.useFakeTimers();
    const card = await render();
    const button = always(card);
    await act(async () => {
      button.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }),
      );
      vi.advanceTimersByTime(SHELL_SCOPE_LONG_PRESS_MS);
    });
    await act(async () => {
      button.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
      button.click();
    });
    vi.useRealTimers();
    expect(decisions).toEqual([]);
    expect(menuItems()).toContain('只允许这一条');
    await choose('只允许这一条');
    await settle();
    expect(decisions).toEqual([['allowed-always-exact']]);
  });

  it('opens from the keyboard with Shift+F10', async () => {
    const card = await render();
    await act(async () => {
      always(card).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      );
    });
    expect(menuItems()).toContain('所有 bash 命令');
    expect(always(card).getAttribute('aria-keyshortcuts')).toBe('Shift+F10');
  });

  it('saves one rule per subcommand of a compound command', async () => {
    suggestions = {
      exact: 'git status && ls -la',
      compound: true,
      unparseable: false,
      subcommands: [
        { exact: 'git status', oneWordPrefix: 'git *', twoWordPrefix: 'git status *' },
        { exact: 'ls -la', oneWordPrefix: 'ls *' },
      ],
    };
    const card = await render();
    await act(async () => {
      always(card).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    expect(menuItems()).toEqual([
      '所有 bash 命令',
      '每条子命令各存一条规则git status *ls *',
      '只允许这一条',
      '自定义…',
    ]);
    await choose('每条子命令各存一条规则git status *ls *');
    await settle();
    expect(decisions).toEqual([
      ['allowed-always-prefix', { kind: 'prefix', patterns: ['git status *', 'ls *'] }],
    ]);
  });

  it('offers only all and exact for an unparseable command and nothing without suggestions', async () => {
    suggestions = { exact: 'echo $(id)', compound: false, unparseable: true, subcommands: [] };
    let card = await render();
    await act(async () => {
      always(card).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    expect(menuItems()).toEqual(['所有 bash 命令', '只允许这一条']);
    act(() => root.unmount());
    root = createRoot(node);
    suggestions = undefined;
    card = await render();
    await act(async () => {
      always(card).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    expect(menuItems()).toEqual([]);
  });

  it('validates a custom prefix and shows the Host refusal inline', async () => {
    const card = await render();
    await act(async () => {
      always(card).dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true }),
      );
    });
    await choose('自定义…');
    const field = document.querySelector<HTMLInputElement>('input')!;
    expect(field.value).toBe('git status *');
    const type = async (value: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(field, value);
        field.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    const save = () => document.querySelector<HTMLButtonElement>('[data-shell-scope-save]')!;
    await type('git status');
    await act(async () => save().click());
    expect(document.body.textContent).toContain('前缀要以空格加 * 结尾');
    expect(decisions).toEqual([]);
    await type('bash *');
    refuse = Object.assign(new Error('runner'), { code: 'unsafe-shell-prefix-runner' });
    await act(async () => save().click());
    await settle();
    await settle();
    expect(document.body.textContent).toContain('这个前缀会让命令运行器执行任意代码');
    expect(card.querySelector('[role="alert"]')).toBeNull();
    await type('git log *');
    await act(async () => save().click());
    await settle();
    expect(decisions).toEqual([
      ['allowed-always-prefix', { kind: 'prefix', patterns: ['git log *'] }],
    ]);
  });
});
