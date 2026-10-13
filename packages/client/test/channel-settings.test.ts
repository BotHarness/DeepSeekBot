// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({
    open,
    title,
    className,
    children,
  }: {
    open: boolean;
    title: string;
    className?: string;
    children?: ReactNode;
  }) =>
    open
      ? createElement('div', { role: 'dialog', 'aria-label': title, className }, children)
      : null,
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({ open, anchor, children }: { open: boolean; anchor: ReactNode; children: ReactNode }) =>
    createElement('div', null, anchor, open ? children : null),
  MenuItemButton: ({ onSelect, children }: { onSelect(): void; children: ReactNode }) =>
    createElement('button', { role: 'menuitem', onClick: onSelect }, children),
  MenuSurface: ({ children, ...props }: { children: ReactNode }) =>
    createElement('div', props, children),
}));
import { ChannelSettingsDialog } from '../src/client/channel-settings.js';
import {
  ChannelSettings,
  channelSettingsSections,
  isChannelSettingsSection,
} from '../src/client/channel-settings-state.js';
import { ChannelSidebarTabs } from '../src/client/channel-sidebar-tabs.js';
import {
  createChannelSidebarRegistry,
  resolveChannelSidebarTabs,
  type ChannelSidebarEntry,
  type ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import {
  channelSidebarScopeKey,
  createChannelSidebarPrefs,
  type ChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeActions } from '../src/client/actions.js';
import { createStore, type ClientState } from '../src/client/store.js';

const entry = (
  id: string,
  order: number,
  extra: Partial<ChannelSidebarEntry> = {},
): ChannelSidebarEntry => ({
  id,
  label: id,
  order,
  scope: 'personabot',
  component: () => createElement('div', { 'data-body': id }, 'body-' + id),
  ...extra,
});

const dmState = (): ClientState => {
  const base = createStore().getSnapshot();
  const channel = {
    id: 'dm-ada',
    type: 'dm' as const,
    name: 'Ada',
    members: ['ada'],
    botSlug: 'ada',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
  return {
    ...base,
    selection: { kind: 'bot', slug: 'ada' },
    channels: [channel],
    conversation: { ...base.conversation, channel },
  } as ClientState;
};

let root: Root;
let host: HTMLDivElement;
let storage: Map<string, string>;
let prefs: ChannelSidebarPrefs;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  storage = new Map();
  prefs = createChannelSidebarPrefs({
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Channel settings', () => {
  it('keeps settings sections out of the sidebar and lists only visible ones', () => {
    const entries = [
      entry('sessions', 1),
      entry('wake-policy', 2, { surface: 'settings' }),
      entry('hidden-setting', 3, { surface: 'settings', visible: () => false }),
    ];
    expect(entries.filter(isChannelSettingsSection).map((item) => item.id)).toEqual([
      'wake-policy',
      'hidden-setting',
    ]);
    expect(channelSettingsSections(entries, dmState()).map((item) => item.id)).toEqual([
      'wake-policy',
    ]);
  });

  it('keeps the sidebar tab row free of a settings gear when no entry has view settings', () => {
    act(() =>
      root.render(
        createElement(ChannelSidebarTabs, {
          tabs: resolveChannelSidebarTabs([], [entry('sessions', 1)]),
          entryProps: {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug: 'ada',
            actions: {},
            t: zhTranslate,
          } as unknown as ChannelSidebarEntryProps,
          scopeKey: channelSidebarScopeKey('personabot', 'dm-ada', 'ada'),
          prefs,
        }),
      ),
    );
    expect(host.querySelector('[aria-label="Channel sidebar 设置"]')).toBeNull();
  });

  it('switches sections and remembers the last one per scope', () => {
    const registry = createChannelSidebarRegistry();
    registry.register(entry('sessions', 1));
    registry.register(entry('wake-policy', 2, { surface: 'settings', label: '唤醒策略' }));
    registry.register(entry('external-identities', 3, { surface: 'settings', label: '外部身份' }));
    const controller = new ChannelSettings();
    const render = () =>
      act(() =>
        root.render(
          createElement(ChannelSettingsDialog, {
            registry,
            state: dmState(),
            actions: {} as BridgeActions,
            t: zhTranslate,
            controller,
            prefs,
          }),
        ),
      );
    render();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => controller.open());
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-label')).toBe('Ada 的设置');
    const caption = dialog.querySelector('.bh-channel-settings-caption')!;
    expect(caption.getAttribute('aria-label')).toBe('Ada 的设置');
    expect(caption.querySelector('.bh-channel-settings-caption-title')?.textContent).toBe('Ada');
    expect(caption.querySelector('.bh-channel-settings-caption-kind')?.textContent).toBe('设置');
    expect(dialog.querySelector('.bh-channel-settings-caption-avatar')).not.toBeNull();
    expect(
      [...dialog.querySelectorAll('[data-settings-section]')].map((n) => n.textContent),
    ).toEqual(['唤醒策略', '外部身份']);
    expect(dialog.querySelector('[data-body]')?.getAttribute('data-body')).toBe('wake-policy');
    act(() =>
      dialog
        .querySelector<HTMLButtonElement>('[data-settings-section="external-identities"]')!
        .click(),
    );
    expect(host.querySelector('[data-body]')?.getAttribute('data-body')).toBe(
      'external-identities',
    );
    expect(host.querySelector('[data-body="sessions"]')).toBeNull();
    act(() => controller.close());
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    act(() => controller.open());
    expect(host.querySelector('[data-body]')?.getAttribute('data-body')).toBe(
      'external-identities',
    );
    act(() => controller.open('wake-policy'));
    expect(host.querySelector('[data-body]')?.getAttribute('data-body')).toBe('wake-policy');
  });
});
