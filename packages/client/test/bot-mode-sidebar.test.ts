// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconPanelLeftOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    Tooltip: ({ children }: { children: ReactNode }) => children,
    isDarwinDesktop: () => false,
  };
});
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { createElement: h } = await import('react');
  const { store } = await import('../src/client/store.js');
  const { useSyncExternalStore } = await import('react');
  return {
    useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot),
    BotSidebar: ({ wide }: { wide: boolean }) =>
      h('div', { 'data-roster': wide ? 'wide' : 'rail' }),
  };
});
vi.mock('../src/client/onboarding-checklist-view.js', () => ({
  OnboardingLauncher: () => null,
}));

import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { BotModeSidebar, type BotModeSidebarProps } from '../src/client/bot-mode-sidebar.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { en, type BotHarnessTranslate } from '../src/client/locale.js';
import { store } from '../src/client/store.js';

const t = ((key: keyof typeof en, params?: Record<string, string>) =>
  en[key].replace(
    /\{(\w+)\}/g,
    (_, name: string) => params?.[name] ?? '',
  )) as unknown as BotHarnessTranslate;

const useBotModePrefs = ((selector: (value: BotModePrefsSnapshot) => unknown) =>
  selector({ botIcon: 'mascot' } as BotModePrefsSnapshot)) as never;

let container: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  container = undefined;
  root = undefined;
});

function render(overrides: Partial<BotModeSidebarProps> = {}) {
  const calls = {
    exitBotMode: vi.fn(),
    toggleSidebar: vi.fn(),
    openBotSettings: vi.fn(),
    openActivityCenter: vi.fn(async () => undefined),
    refreshHumanInboxStatus: vi.fn(async () => undefined),
  };
  const props: BotModeSidebarProps = {
    collapsed: false,
    width: 280,
    actions: {
      openActivityCenter: calls.openActivityCenter,
      refreshHumanInboxStatus: calls.refreshHumanInboxStatus,
    } as never,
    useBotModePrefs,
    setSortMode: () => undefined,
    setSectionSortMode: () => undefined,
    exitBotMode: calls.exitBotMode,
    toggleSidebar: calls.toggleSidebar,
    openBotSettings: calls.openBotSettings,
    t,
    ...overrides,
  };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(createElement(BotModeSidebar, props)));
  const button = (name: string): HTMLButtonElement => {
    const found = container?.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
    if (found == null) throw new Error(`missing button ${name}`);
    return found;
  };
  return { calls, button, container };
}

describe('Bot mode sidebar', () => {
  it('leads out of Bot mode and drives the DSH column from its own controls', () => {
    const { calls, button, container: node } = render();

    expect(calls.refreshHumanInboxStatus).toHaveBeenCalledTimes(1);
    expect(node.querySelector('[data-roster]')?.getAttribute('data-roster')).toBe('wide');
    expect(node.textContent).toContain('DeepSeekBot');
    expect(node.textContent).not.toContain('Bot mode');
    expect(node.querySelectorAll('button[aria-label="Exit Bot mode"]')).toHaveLength(1);
    const logo = button('Exit Bot mode');
    expect(logo.classList.contains('bh-mode-sidebar-logo')).toBe(true);
    expect(logo.getAttribute('data-bh-tour')).toBe('bot-mode');
    expect(logo.hasAttribute('data-exit')).toBe(false);
    act(() => logo.dispatchEvent(new MouseEvent('pointerover', { bubbles: true })));
    expect(logo.getAttribute('data-exit')).toBe('true');
    act(() => logo.dispatchEvent(new MouseEvent('pointerout', { bubbles: true })));
    expect(logo.hasAttribute('data-exit')).toBe(false);

    act(() => button('Exit Bot mode').click());
    act(() => button('Collapse sidebar').click());
    act(() => button('Bot settings').click());
    act(() => button('Activity Center').click());

    expect(calls.exitBotMode).toHaveBeenCalledTimes(1);
    expect(calls.toggleSidebar).toHaveBeenCalledTimes(1);
    expect(calls.openBotSettings).toHaveBeenCalledTimes(1);
    expect(calls.openActivityCenter).toHaveBeenCalledTimes(1);
  });

  it('renders the compact rail while DSH collapses the column', () => {
    const { button, container: node } = render({ collapsed: true, width: 56 });

    expect(node.querySelector('.bh-mode-sidebar')?.getAttribute('data-collapsed')).toBe('true');
    expect(node.querySelector('[data-roster]')?.getAttribute('data-roster')).toBe('rail');
    expect(button('Open sidebar')).toBeTruthy();
    expect(button('Exit Bot mode').classList.contains('bh-mode-sidebar-logo')).toBe(true);
    expect(node.textContent).not.toContain('DeepSeekBot');
  });

  it('shows one pinned card per Dock panel and toggles it in the mounted dock', () => {
    const dockPanels = createDockPanelRegistry();
    dockPanels.register({
      id: 'activity-center',
      title: 'Activity Center',
      icon: 'bell',
      scope: 'global',
      order: -100,
      component: () => null,
    });
    dockPanels.register({ id: 'todo', title: 'To-do', scope: 'global', component: () => null });
    act(() => store.setHumanInbox({ unreadCount: 3, hasAction: true }));
    const { calls, container: node } = render({ dockPanels });
    const card = (id: string): HTMLButtonElement =>
      node.querySelector<HTMLButtonElement>(`[data-pinned-panel="${id}"]`)!;

    expect(node.querySelector('[role="group"][aria-label="Panels"]')).not.toBeNull();
    expect(
      [...node.querySelectorAll('[data-pinned-panel]')].map((el) =>
        el.getAttribute('data-pinned-panel'),
      ),
    ).toEqual(['activity-center', 'todo']);
    expect(card('activity-center').getAttribute('data-bh-tour')).toBe('inbox');
    expect(card('activity-center').getAttribute('aria-label')).toBe(
      'Activity Center · 3 unread · Needs my action',
    );
    expect(card('activity-center').querySelector('[data-pinned-panel-count]')?.textContent).toBe(
      '3',
    );

    expect(card('todo').getAttribute('aria-disabled')).toBe('true');
    act(() => card('todo').click());
    act(() => card('activity-center').click());
    expect(calls.openActivityCenter).toHaveBeenCalledTimes(1);

    const opened: string[] = [];
    let detach = () => {};
    act(() => {
      detach = dockPanels.attach({
        open: (id) => {
          opened.push(`open:${id}`);
          dockPanels.reportOpen([...dockPanels.openPanels(), id]);
        },
        close: (id) => {
          opened.push(`close:${id}`);
          dockPanels.reportOpen(dockPanels.openPanels().filter((open) => open !== id));
        },
      });
    });
    expect(card('todo').hasAttribute('aria-disabled')).toBe(false);
    act(() => card('activity-center').click());
    expect(card('activity-center').getAttribute('aria-pressed')).toBe('true');
    act(() => card('activity-center').click());
    act(() => card('todo').click());
    expect(opened).toEqual(['open:activity-center', 'close:activity-center', 'open:todo']);
    expect(card('activity-center').getAttribute('aria-pressed')).toBe('false');
    expect(card('todo').getAttribute('data-open')).toBe('true');
    expect(calls.openActivityCenter).toHaveBeenCalledTimes(1);
    act(() => detach());
    act(() => store.setHumanInbox({ unreadCount: 0, hasAction: false }));
  });

  it('stacks the pinned cards as icons on the collapsed rail', () => {
    const dockPanels = createDockPanelRegistry();
    dockPanels.register({
      id: 'activity-center',
      title: 'Activity Center',
      icon: 'bell',
      scope: 'global',
      component: () => null,
    });
    act(() => store.setHumanInbox({ unreadCount: 2, hasAction: false }));
    const { container: node } = render({ dockPanels, collapsed: true, width: 56 });
    const card = node.querySelector('[data-pinned-panel="activity-center"]')!;
    expect(card.querySelector('[data-pinned-panel-count]')).toBeNull();
    expect(card.querySelector('[data-pinned-panel-dot]')).not.toBeNull();
    act(() => store.setHumanInbox({ unreadCount: 0, hasAction: false }));
  });
});
