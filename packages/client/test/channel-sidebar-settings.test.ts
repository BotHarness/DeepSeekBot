// @vitest-environment jsdom
import { type Root } from 'react-dom/client';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
}));
import { ChannelSidebarSettings } from '../src/client/channel-sidebar-settings.js';
import { TerminologySettings } from './support/terminology-settings.js';
import {
  channelSidebarPrefs,
  createChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; container: HTMLDivElement }[] = [];
const props = {
  scope: 'personabot',
  channelId: 'dm-qa',
  botSlug: 'settings-qa',
  actions: {},
  t: (key: string) => key,
} as unknown as ChannelSidebarEntryProps;
function mount(slug: string | null = 'settings-qa', settings = true) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() =>
    root.render(
      createElement(ChannelSidebarSettings, {
        entryProps:
          slug === null
            ? { ...props, scope: 'channel', channelId: 'group-qa', botSlug: undefined }
            : { ...props, botSlug: slug },
        entries: settings
          ? [
              {
                id: 'memory',
                label: 'Memory',
                scope: 'personabot',
                component: () => null,
                settings: TerminologySettings,
              },
            ]
          : [],
      }),
    ),
  );
  return container;
}
function click(container: HTMLElement, label: string) {
  const button = [
    ...(label === 'sidebar.settings' ? container : document.body).querySelectorAll<HTMLElement>(
      'button, [role="menuitem"]',
    ),
  ].find((n) => n.textContent === label || n.getAttribute('aria-label') === label);
  expect(button).toBeDefined();
  act(() => button!.click());
}
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  act(() => channelSidebarPrefs.setMemoryTerminology('memory'));
  localStorage.clear();
});

describe('registered Channel sidebar display settings', () => {
  it('keeps terminology shared across Bots and restores it from browser storage', () => {
    const first = mount('memory-qa-one');
    const second = mount('memory-qa-two');
    click(first, 'sidebar.settings');
    click(first, 'entry.memoryEvolution · memory.terminology');
    click(first, 'memory.terms.git');
    click(first, 'sidebar.settings');
    click(second, 'sidebar.settings');
    click(second, 'entry.memoryEvolution · memory.terminology');
    expect(channelSidebarPrefs.getSnapshot().memoryTerminology).toBe('git');
    expect(createChannelSidebarPrefs(localStorage).getSnapshot().memoryTerminology).toBe('git');
    const selected = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (n) => n.textContent === 'memory.terms.git',
    );
    expect(selected?.querySelector('svg')).not.toBeNull();
  });
  it('offers a disabled empty state when current visible entries have no settings', () => {
    const container = mount(null, false);
    click(container, 'sidebar.settings');
    const item = document.body.querySelector('[role=menuitem]');
    expect(item?.textContent).toBe('sidebar.settings.empty');
    expect(item?.getAttribute('aria-disabled')).toBe('true');
    expect(container.textContent).not.toContain('sessions.all');
  });
});
