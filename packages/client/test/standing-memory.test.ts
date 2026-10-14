// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const passthrough = ({ children }: { children?: ReactNode }) => children ?? null;
  return {
    Button: ({
      children,
      variant: _variant,
      size: _size,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
      createElement('button', props, children),
    Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
    Tag: ({ children }: { children?: ReactNode }) =>
      createElement('span', { className: 'tag' }, children),
    Modal: ({
      open,
      title,
      children,
      footer,
    }: {
      open: boolean;
      title: string;
      children?: ReactNode;
      footer?: ReactNode;
    }) =>
      open ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer) : null,
    Tooltip: passthrough,
    FileTypeIcon: stub,
    IconEllipsisOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { loadMemorySnapshot, parseBotSummary } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { MemoryFileTree } from '../src/client/memory-file-tree.js';
import { memoryFileTree } from '../src/client/memory-file-tree-model.js';
import { StandingLimitsRow } from '../src/client/standing-limits.js';
import type { BotSummary } from '../src/client/store.js';

const bot: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-10-06T00:00:00.000Z',
  standingLimits: { soul: 5000, coreMemory: 3000 },
};

describe('Standing memory', () => {
  it('pins the standing root files above folders in their prompt order', () => {
    const tree = memoryFileTree(
      ['a.md', 'MEMORY.md', 'topics/plan.md', 'SOUL.md', 'topics/MEMORY.md'],
      ['SOUL.md', 'MEMORY.md'],
    );
    expect(tree.map((node) => node.path)).toEqual(['SOUL.md', 'MEMORY.md', 'topics', 'a.md']);
    expect(tree[2]?.children.map((node) => node.path)).toEqual([
      'topics/MEMORY.md',
      'topics/plan.md',
    ]);
  });

  it('shows the Standing badge and usage, marking an over-limit file', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryFileTree, {
        paths: ['notes.md', 'MEMORY.md', 'SOUL.md'],
        standing: [
          { path: 'SOUL.md', role: 'soul', chars: 1860, limit: 5000 },
          { path: 'MEMORY.md', role: 'coreMemory', chars: 3600, limit: 3000 },
        ],
        selectedPath: undefined,
        onSelect: undefined,
        t: zhTranslate,
      }),
    );
    const container = document.createElement('div');
    container.innerHTML = html;
    const rows = [...container.querySelectorAll('[role="treeitem"]')];
    expect(rows.map((row) => row.getAttribute('data-path'))).toEqual([
      'SOUL.md',
      'MEMORY.md',
      'notes.md',
    ]);
    expect(rows[0]?.textContent).toContain('常驻');
    expect(rows[0]?.textContent).toContain('1,860/5,000');
    expect(rows[0]?.querySelector('[data-standing-usage]')?.getAttribute('title')).toBe(
      '已用 37%：1,860/5,000 字符',
    );
    expect(rows[1]?.querySelector('[data-standing="over"]')?.textContent).toContain('3,600/3,000');
    expect(rows[2]?.querySelector('[data-standing]')).toBeNull();
  });

  it('parses standing limits and usage from the bridge', async () => {
    expect(
      parseBotSummary({
        slug: 'ada',
        displayName: 'Ada',
        standingLimits: { soul: 8000, coreMemory: 1200 },
      })?.standingLimits,
    ).toEqual({ soul: 8000, coreMemory: 1200 });
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        snapshot: {
          head: null,
          files: ['MEMORY.md'],
          provisional: false,
          standing: [
            { path: 'MEMORY.md', role: 'coreMemory', chars: 12, limit: 3000 },
            { path: 'bad', role: 'other', chars: 1, limit: 1 },
          ],
        },
      },
    }));
    const snapshot = await loadMemorySnapshot(call, 'channel-1');
    expect(snapshot.standing).toEqual([
      { path: 'MEMORY.md', role: 'coreMemory', chars: 12, limit: 3000 },
    ]);
  });

  it('saves new limits, explains their size and rejects out-of-range values', async () => {
    const setStandingLimits = vi.fn(
      async (_slug: string, limits: BotSummary['standingLimits']) => ({
        ...bot,
        ...(limits === undefined ? {} : { standingLimits: limits }),
      }),
    );
    const actions = { setStandingLimits } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          'ul',
          null,
          createElement(StandingLimitsRow, { bot, actions, t: zhTranslate }),
        ),
      ),
    );
    expect(host.textContent).toContain('SOUL.md 5,000 · MEMORY.md 3,000');
    await act(async () => host.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
    const limit = (file: string): HTMLInputElement => {
      const label = [...host.querySelectorAll('label')].find((candidate) =>
        candidate.textContent?.includes(file),
      )!;
      return document.getElementById(label.htmlFor) as HTMLInputElement;
    };
    const button = (name: string): HTMLButtonElement =>
      [...host.querySelectorAll<HTMLButtonElement>('button')].find(
        (candidate) => candidate.textContent === name,
      )!;
    const save = (): HTMLButtonElement => button(zhTranslate('standingLimits.save'));
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
      zhTranslate('standingLimits.title'),
    );
    expect(limit('SOUL.md').value).toBe('5000');
    expect(limit('MEMORY.md').value).toBe('3000');
    expect(host.textContent).toContain('约 5,000 个汉字，或约 830 个英文单词');
    expect(save().disabled).toBe(true);
    expect(button(zhTranslate('standingLimits.reset')).disabled).toBe(true);

    const type = async (input: HTMLInputElement, value: string): Promise<void> => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    await type(limit('MEMORY.md'), '100');
    expect(host.textContent).toContain('请输入 500 到 50,000 之间的整数');
    expect(limit('MEMORY.md').getAttribute('aria-invalid')).toBe('true');
    expect(save().disabled).toBe(true);
    await act(async () => host.querySelector('form')!.requestSubmit());
    expect(setStandingLimits).not.toHaveBeenCalled();

    await type(limit('SOUL.md'), '6000');
    await act(async () => button(zhTranslate('standingLimits.reset')).click());
    expect(limit('SOUL.md').value).toBe('5000');
    expect(limit('MEMORY.md').value).toBe('3000');

    await type(limit('MEMORY.md'), '1200');
    expect(limit('MEMORY.md').hasAttribute('aria-invalid')).toBe(false);
    expect(save().disabled).toBe(false);
    await act(async () => host.querySelector('form')!.requestSubmit());
    expect(setStandingLimits).toHaveBeenCalledWith('ada', { soul: 5000, coreMemory: 1200 });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.textContent).toContain('SOUL.md 5,000 · MEMORY.md 1,200');
    expect(host.textContent).toContain(zhTranslate('standingLimits.customized'));
    act(() => root.unmount());
    host.remove();
  });

  it('keeps the dialog open and shows the bridge error when saving fails', async () => {
    const setStandingLimits = vi.fn(async () => {
      throw new Error('limits refused');
    });
    const actions = { setStandingLimits } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          'ul',
          null,
          createElement(StandingLimitsRow, { bot, actions, t: zhTranslate }),
        ),
      ),
    );
    await act(async () => host.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
    const label = [...host.querySelectorAll('label')].find((candidate) =>
      candidate.textContent?.includes('SOUL.md'),
    )!;
    const soul = document.getElementById(label.htmlFor) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(soul, '900');
      soul.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => host.querySelector('form')!.requestSubmit());
    expect(setStandingLimits).toHaveBeenCalledWith('ada', { soul: 900, coreMemory: 3000 });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('limits refused');
    await act(async () =>
      [...host.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === zhTranslate('common.cancel'))!
        .click(),
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => root.unmount());
    host.remove();
  });

  it('follows roster updates to the saved limits', async () => {
    const actions = { setStandingLimits: vi.fn() } as unknown as BridgeActions;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (summary: BotSummary) =>
      act(async () =>
        root.render(
          createElement(
            'ul',
            null,
            createElement(StandingLimitsRow, { bot: summary, actions, t: zhTranslate }),
          ),
        ),
      );
    await render(bot);
    expect(host.textContent).toContain('SOUL.md 5,000 · MEMORY.md 3,000');
    await render({ ...bot, standingLimits: { soul: 8000, coreMemory: 3000 } });
    expect(host.textContent).toContain('SOUL.md 8,000 · MEMORY.md 3,000');
    act(() => root.unmount());
    host.remove();
  });
});
