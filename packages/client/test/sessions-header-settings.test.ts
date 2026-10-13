// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Item = { id: string; type?: string; label?: string; text?: string };
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: ({
      children,
      onClick,
      disabled,
      type,
    }: PropsWithChildren<{ onClick?(): void; disabled?: boolean; type?: 'submit' }>) =>
      createElement('button', { onClick, disabled, type: type ?? 'button' }, children),
    Input: (props: Record<string, unknown>) => createElement('input', props),
    Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
    Modal: ({ children, title }: PropsWithChildren<{ title: string }>) =>
      createElement('div', { role: 'dialog', 'aria-label': title }, children),
    StateDot: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    Menu: ({
      anchor,
      items,
      onSelect,
    }: {
      anchor: ReactNode;
      items: readonly Item[];
      onSelect(id: string): void;
    }) =>
      createElement(
        'div',
        null,
        anchor,
        items.map((item) =>
          item.type === undefined
            ? createElement(
                'button',
                { key: item.id, role: 'menuitem', onClick: () => onSelect(item.id) },
                item.label,
              )
            : createElement('span', { key: item.id }, item.text),
        ),
      ),
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import type { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import type { ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';
import { channelSettings } from '../src/client/channel-settings-state.js';
import { zhTranslate } from '../src/client/locale.js';

let root: Root;
let host: HTMLDivElement;
const save = vi.fn(async (_limit: number) => true);
const snapshot = { assignmentConcurrencyLimit: 4, status: 'ready', mode: 'host' };
const prefs = {
  source: {
    subscribe: () => () => {},
    getSnapshot: () => snapshot,
  },
  setAssignmentConcurrencyLimit: save,
} as unknown as BotModePrefs;
const actions = {
  modelPlanState: async () => ({ plan }),
} as unknown as BridgeActions;

let plan: unknown = {
  orchestrator: { model: 'deepseek-v4', reasoningEffort: 'high' },
  assignmentDefault: { model: 'deepseek-v4-flash' },
};
async function render(slug = 'plan-qa') {
  const Header = createChannelSidebarBuiltins(zhTranslate, prefs).find(
    (entry) => entry.id === 'sessions',
  )!.headerAction!;
  await act(async () => {
    root.render(
      createElement(Header, {
        scope: 'personabot',
        channelId: 'dm-' + slug,
        botSlug: slug,
        actions,
        t: zhTranslate,
      } as unknown as ChannelSidebarEntryProps),
    );
  });
}
function item(label: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('[role=menuitem]')].find(
    (node) => node.textContent === label,
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  channelSettings.close();
});

describe('Sessions header settings', () => {
  it('shows both default models and opens the Model settings', async () => {
    await render();
    expect(item('主模型 · deepseek-v4 · high')).toBeDefined();
    act(() => item('执行模型 · deepseek-v4-flash')!.click());
    expect(channelSettings.getSnapshot()).toEqual({ open: true, sectionId: 'model' });
  });
  it('says the Bot inherits the global models when it has no plan', async () => {
    plan = undefined;
    await render('no-plan-qa');
    expect(item('主模型 · 继承全局')).toBeDefined();
    expect(item('执行模型 · 继承全局')).toBeDefined();
  });
  it('edits the shared Assignment concurrency limit in a dialog', async () => {
    await render();
    expect(host.querySelector('[role=dialog]')).toBeNull();
    act(() => item('同时最多 4 个…')!.click());
    const dialog = host.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Assignment 并发上限');
    expect(dialog.querySelector('input')?.value).toBe('4');
  });
});
