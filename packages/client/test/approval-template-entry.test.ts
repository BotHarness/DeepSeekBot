// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ApprovalTemplateEntry } from '../src/client/approval-template-entry.js';
import { zhTranslate as t } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Menu: ({
    items,
    onSelect,
  }: {
    items: { id: string; label: ReactNode }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      { role: 'menu' },
      items.map((item) =>
        createElement(
          'button',
          {
            key: item.id,
            role: 'menuitem',
            onClick: () => onSelect(item.id),
          },
          item.label,
        ),
      ),
    ),
}));
vi.mock('../src/client/avatar.js', () => ({ PersonaBotAvatar: () => null }));
vi.mock('../src/client/channel-sidebar-icon.js', () => ({ ChannelSidebarIcon: () => null }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it('keeps a failed selection read unknown instead of claiming the Bot is Off', async () => {
  const actions = {
    approvalTemplates: async () => {
      throw new Error('Approval template selection could not be read.');
    },
    setBotApprovalTemplate: vi.fn(async () => {}),
  };
  await act(async () =>
    root.render(
      createElement(ApprovalTemplateEntry, {
        botSlug: 'ada',
        actions,
        disabled: false,
        t,
      }),
    ),
  );
  const choice = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(choice?.textContent).toContain('读取失败');
  expect(choice?.textContent).not.toContain(t('autoApproval.off'));
  expect(choice?.disabled).toBe(true);
  expect(host.textContent).not.toContain(t('autoApproval.hintOff'));
  expect(actions.setBotApprovalTemplate).not.toHaveBeenCalled();
});

it('still displays Off after a successful explicit empty-selection read', async () => {
  const actions = {
    approvalTemplates: async () => ({ templates: [], selected: null, globalDefault: null }),
    setBotApprovalTemplate: vi.fn(async () => {}),
  };
  await act(async () =>
    root.render(
      createElement(ApprovalTemplateEntry, {
        botSlug: 'ada',
        actions,
        disabled: false,
        t,
      }),
    ),
  );
  const choice = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(choice?.textContent).toContain(t('autoApproval.off'));
  expect(host.textContent).toContain(t('autoApproval.hintOff'));
});

it('preserves a missing specific template name in the selector', async () => {
  const actions = {
    approvalTemplates: async () => ({
      templates: [],
      selected: 'night-shift',
      globalDefault: null,
    }),
    setBotApprovalTemplate: vi.fn(async () => {}),
  };
  await act(async () =>
    root.render(
      createElement(ApprovalTemplateEntry, { botSlug: 'ada', actions, disabled: false, t }),
    ),
  );
  const choice = host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(choice?.textContent).toContain('night-shift');
  expect(choice?.textContent).toContain('不可用');
  expect(actions.setBotApprovalTemplate).not.toHaveBeenCalled();
});

it('does not display Off or replay a mutation when saving succeeds and readback fails', async () => {
  let reads = 0;
  let saved: string | null = null;
  const actions = {
    approvalTemplates: async () => {
      reads++;
      if (reads > 1) throw new Error('refresh failed');
      return {
        templates: [
          { name: 'cautious', title: 'Cautious', description: '', builtIn: true, usedBy: [] },
        ],
        selected: null,
        globalDefault: null,
      };
    },
    setBotApprovalTemplate: vi.fn(async (_slug: string, name: string | null) => {
      saved = name;
    }),
  };
  await act(async () =>
    root.render(
      createElement(ApprovalTemplateEntry, { botSlug: 'ada', actions, disabled: false, t }),
    ),
  );
  const trigger = () => host.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
  await act(async () => trigger().click());
  const option = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (button) => button.textContent === t('autoApproval.template.cautious'),
  );
  if (!option) throw new Error('Missing Cautious option');
  await act(async () => option.click());
  expect(saved).toBe('cautious');
  expect(actions.setBotApprovalTemplate).toHaveBeenCalledExactlyOnceWith('ada', 'cautious');
  expect(reads).toBe(2);
  expect(trigger().textContent).toContain('读取失败');
  expect(trigger().textContent).not.toContain(t('autoApproval.off'));
  expect(trigger().disabled).toBe(true);
  expect(host.textContent).not.toContain(t('autoApproval.hintOff'));
});
