// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeActions } from '../src/client/actions.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { ToolApprovalCard } from '../src/client/tool-approval-card.js';
import { announceApprovalTemplateChange } from '../src/client/approval-template-changes.js';
import * as stylex from '@stylexjs/stylex';

type CardActions = Parameters<typeof ToolApprovalCard>[0]['actions'];

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));

const message = (toolName = 'bash', input = '{"command":"echo QA"}'): ChannelMessage =>
  ({
    id: 'request',
    at: '2026-10-14T08:00:00Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'Approve',
    toolApprovalRequest: {
      sessionId: 'session',
      callId: 'call',
      toolName,
      allowAlways: true,
      role: 'orchestrator',
      cwd: '/qa',
      input,
    },
  }) as ChannelMessage;

let root: Root;
let node: HTMLDivElement;
let decisions: string[];
let expiresAt: string | undefined;

const actions = (): BridgeActions =>
  ({
    toolApprovalStatus: async () => (decisions.length === 0 ? 'pending' : 'expired'),
    toolApprovalState: async () =>
      decisions.length === 0 ? { status: 'pending', expiresAt } : { status: 'expired' },
    decideToolApproval: async (_channel: string, _message: string, outcome: string) => {
      decisions.push(outcome);
    },
  }) as unknown as BridgeActions;

const render = async (
  value: ChannelMessage = message(),
  overrides: Partial<BridgeActions> = {},
  decision?: Parameters<typeof ToolApprovalCard>[0]['decision'],
): Promise<HTMLElement> => {
  await act(async () => {
    root.render(
      createElement(ToolApprovalCard, {
        message: value,
        ...(decision === undefined ? {} : { decision }),
        actions: { ...actions(), ...overrides },
        t: zhTranslate,
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
  return node.querySelector<HTMLElement>('.bh-tool-approval-card')!;
};

const press = async (target: HTMLElement, key: string): Promise<void> => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  store.select({ kind: 'inbox' });
  decisions = [];
  expiresAt = undefined;
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});

afterEach(() => {
  act(() => root.unmount());
  node.remove();
  vi.useRealTimers();
});

const ellipsis = stylex.create({
  label: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  half: { maxWidth: '50%' },
});

describe('Auto approval preset picker on the approval card', () => {
  const library = {
    templates: [
      {
        name: 'cautious',
        title: 'Cautious',
        description: 'Ask before leaving.',
        builtIn: true,
        usedBy: [],
        text: '',
      },
      {
        name: 'get-work-done',
        title: 'Get the work done',
        description: 'Keep working.',
        builtIn: true,
        usedBy: [],
        text: '',
      },
      {
        name: 'nightly-release-train-with-a-very-long-preset-name',
        title: 'Nightly release train with a very long preset name that never fits',
        description: 'Long.',
        builtIn: false,
        usedBy: [],
        text: '',
      },
    ],
  };
  const presets = (selected: string | null, chosen: Array<string | null> = []) => {
    let current = selected;
    return {
      approvalTemplates: vi.fn(async () => ({
        ...library,
        selected: current,
        globalDefault: 'cautious',
      })),
      setBotApprovalTemplate: vi.fn(async (_slug: string, template: string | null) => {
        chosen.push(template);
        current = template;
      }),
    } satisfies Pick<CardActions, 'approvalTemplates' | 'setBotApprovalTemplate'>;
  };
  const trigger = (card: HTMLElement) =>
    card.querySelector<HTMLButtonElement>('[data-approval-preset-trigger]');
  const openMenu = async (card: HTMLElement) => {
    await act(async () => trigger(card)!.click());
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
  };
  const item = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((node) =>
      node.textContent?.startsWith(label),
    );

  it('shows the current preset below the actions for a Human who may change it', async () => {
    const actions = presets('get-work-done');
    const card = await render(message(), actions);
    expect(actions.approvalTemplates).toHaveBeenCalledWith('ada');
    const button = trigger(card)!;
    expect(button.textContent).toBe('自动审批 · 把活干完');
    const children = [...card.children];
    expect(children.indexOf(button.closest('[data-approval-preset]')!)).toBeGreaterThan(
      children.indexOf(card.querySelector('.bh-tool-approval-actions')!),
    );
    await openMenu(card);
    expect(document.body.textContent).toContain('这个 Bot 的自动审批预设');
    expect(document.body.textContent).toContain('切换后从下一次请求开始生效，这次仍需你确认。');
    expect(item('跟随全局')?.textContent).toBe('跟随全局谨慎');
    expect(item('把活干完')?.getAttribute('aria-checked')).toBe('true');
    expect(item('谨慎')?.getAttribute('aria-checked')).toBeNull();
    expect(item('关闭')).toBeDefined();
    expect(item('新建预设…')).toBeUndefined();
  });

  it.each([
    { label: '谨慎', value: 'cautious' },
    { label: '关闭', value: null },
    { label: '跟随全局', value: '@global' },
  ])('switches to $label for the next request and keeps this card pending', async (choice) => {
    const chosen: Array<string | null> = [];
    const actions = presets('get-work-done', chosen);
    const card = await render(message(), actions);
    await openMenu(card);
    await act(async () => item(choice.label)!.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(chosen).toEqual([choice.value]);
    expect(actions.setBotApprovalTemplate).toHaveBeenCalledWith('ada', choice.value);
    expect(decisions).toEqual([]);
    expect(trigger(card)!.textContent).toBe(`自动审批 · ${choice.label}`);
    expect(card.querySelector('[data-approval-preset-next]')?.textContent).toBe('下次生效');
    expect(card.querySelector('.bh-request-pill')?.textContent).toBe('需要你确认');
    const choices = [
      ...card.querySelectorAll<HTMLButtonElement>('.bh-tool-approval-actions button'),
    ];
    expect(choices.every((button) => !button.disabled)).toBe(true);
  });

  it('does not decide the card from keys typed inside the preset menu', async () => {
    const card = await render(message(), presets('cautious'));
    await openMenu(card);
    await press(item('关闭')!, 'n');
    await press(item('关闭')!, 'Escape');
    await press(trigger(card)!, 'y');
    expect(decisions).toEqual([]);
  });

  it('ellipsizes a long preset name at half the card width with the full name as its title', async () => {
    const card = await render(
      message(),
      presets('nightly-release-train-with-a-very-long-preset-name'),
    );
    const button = trigger(card)!;
    const full = '自动审批 · Nightly release train with a very long preset name that never fits';
    expect(button.getAttribute('title')).toBe(full);
    expect(button.getAttribute('aria-label')).toBe(full);
    const classes = (node: Element) => new Set(node.className.split(' '));
    const label = classes(button.querySelector('span')!);
    for (const name of stylex.props(ellipsis.label).className!.split(' '))
      expect(label.has(name)).toBe(true);
    const anchor = classes(button.closest('[data-tobs-menu-anchor]')!);
    for (const name of stylex.props(ellipsis.half).className!.split(' '))
      expect(anchor.has(name)).toBe(true);
  });

  it('renders nothing for a Human the Host refuses to show this Bot preset', async () => {
    const card = await render(message(), {
      approvalTemplates: async () => {
        throw new Error('bot-not-found');
      },
      setBotApprovalTemplate: vi.fn(async () => {}),
    } satisfies Pick<CardActions, 'approvalTemplates' | 'setBotApprovalTemplate'>);
    expect(card.querySelector('[data-approval-preset]')?.childElementCount ?? 0).toBe(0);
    expect(trigger(card)).toBeNull();
  });

  it('renders nothing without the selection actions', async () => {
    const card = await render(message());
    expect(card.querySelector('[data-approval-preset]')).toBeNull();
  });

  it('hides the picker once the card is decided or expired', async () => {
    const decided = await render(message(), presets('cautious'), 'allowed-once');
    expect(decided.querySelector('[data-approval-preset]')).toBeNull();
    const expired = await render(message(), {
      ...presets('cautious'),
      toolApprovalStatus: async () => 'expired',
      toolApprovalState: async () => ({ status: 'expired' }),
    } satisfies Partial<BridgeActions>);
    expect(expired.querySelector('[data-approval-preset]')).toBeNull();
  });

  const renderPair = async (shared: ReturnType<typeof presets>) => {
    const cardActions = { ...actions(), ...shared } satisfies CardActions;
    const second = { ...message(), id: 'request-2' };
    await act(async () => {
      root.render(
        createElement(
          'div',
          null,
          createElement(ToolApprovalCard, {
            message: message(),
            actions: cardActions,
            t: zhTranslate,
          }),
          createElement(ToolApprovalCard, {
            message: second,
            actions: { ...cardActions },
            t: zhTranslate,
          }),
        ),
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    return [...node.querySelectorAll<HTMLElement>('.bh-tool-approval-card')];
  };

  it('updates every picker for the Bot when one card switches its preset', async () => {
    const chosen: Array<string | null> = [];
    const shared = presets('get-work-done', chosen);
    const [first, second] = await renderPair(shared);
    expect(trigger(second!)!.textContent).toBe('自动审批 · 把活干完');
    await openMenu(first!);
    await act(async () => item('关闭')!.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(chosen).toEqual([null]);
    expect(trigger(first!)!.textContent).toBe('自动审批 · 关闭');
    expect(trigger(second!)!.textContent).toBe('自动审批 · 关闭');
    expect(second!.querySelector('.bh-request-pill')?.textContent).toBe('需要你确认');
    expect(decisions).toEqual([]);
  });

  it('keeps the newest read when change notifications resolve out of order', async () => {
    type Answer = Awaited<ReturnType<NonNullable<CardActions['approvalTemplates']>>>;
    const answer = (selected: string): Answer => ({
      ...library,
      selected,
      globalDefault: 'cautious',
    });
    const pending: Array<(value: Answer) => void> = [];
    let deferred = false;
    const fixture = {
      approvalTemplates: vi.fn(async (): Promise<Answer> => {
        if (!deferred) return answer('get-work-done');
        return new Promise<Answer>((resolve) => pending.push(resolve));
      }),
      setBotApprovalTemplate: vi.fn(async () => {}),
    } satisfies Pick<CardActions, 'approvalTemplates' | 'setBotApprovalTemplate'>;
    const card = await render(message(), fixture);
    expect(trigger(card)!.textContent).toBe('自动审批 · 把活干完');
    deferred = true;
    act(() => {
      announceApprovalTemplateChange(fixture.approvalTemplates, 'ada');
      announceApprovalTemplateChange(fixture.approvalTemplates, 'ada');
    });
    expect(pending).toHaveLength(2);
    await act(async () => pending[1]!(answer('cautious')));
    await act(async () => pending[0]!(answer('get-work-done')));
    expect(trigger(card)!.textContent).toBe('自动审批 · 谨慎');
  });

  it('keeps the refresh of replaced actions when a save from the old actions finishes', async () => {
    let current: string | null = 'get-work-done';
    let finish: () => void = () => undefined;
    const fixture = {
      approvalTemplates: vi.fn(async () => ({
        ...library,
        selected: current,
        globalDefault: 'cautious',
      })),
      setBotApprovalTemplate: vi.fn(
        (_slug: string, template: string | null) =>
          new Promise<void>((resolve) => {
            finish = () => {
              current = template;
              resolve();
            };
          }),
      ),
    } satisfies Pick<CardActions, 'approvalTemplates' | 'setBotApprovalTemplate'>;
    const card = await render(message(), fixture);
    await openMenu(card);
    await act(async () => item('谨慎')!.click());
    expect(fixture.setBotApprovalTemplate).toHaveBeenCalledWith('ada', 'cautious');
    const replaced = await render(message(), fixture);
    await act(async () => finish());
    await act(async () => {
      await Promise.resolve();
    });
    expect(trigger(replaced)!.textContent).toBe('自动审批 · 谨慎');
  });

  it('writes the chosen preset even when the card still shows it as current', async () => {
    const chosen: Array<string | null> = [];
    const shared = presets(null, chosen);
    const card = await render(message(), shared);
    expect(trigger(card)!.textContent).toBe('自动审批 · 关闭');
    await shared.setBotApprovalTemplate('ada', 'cautious');
    chosen.length = 0;
    await openMenu(card);
    expect(item('关闭')?.getAttribute('aria-checked')).toBe('true');
    await act(async () => item('关闭')!.click());
    await act(async () => {
      await Promise.resolve();
    });
    expect(chosen).toEqual([null]);
    expect(shared.setBotApprovalTemplate).toHaveBeenLastCalledWith('ada', null);
  });
});
