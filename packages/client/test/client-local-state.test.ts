// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/client/ds/button.js', async () => ({
  Button: (await import('@deepseek-ai/dsh-client-ui-primitives')).Button,
}));
vi.mock('../src/client/ds/input.js', async () => ({
  Input: (await import('@deepseek-ai/dsh-client-ui-primitives')).Input,
}));
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  IconChevronDownOutlineRegular: () => null,
  Button: ({ children }: { children: string }) => createElement('button', null, children),
  Input: ({
    className,
    value,
    onChange,
  }: {
    className: string;
    value: string;
    onChange: (event: { currentTarget: { value: string } }) => void;
  }) =>
    createElement(
      'button',
      { className, onClick: () => onChange({ currentTarget: { value: 'team' } }) },
      value || 'search',
    ),
}));

vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children }: { children: ReactElement }) => createElement('section', null, children),
}));

import { createChannelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { useChannelSidebar } from '../src/client/channel-sidebar-view.js';
import { useDelayedSearch } from '../src/client/delayed-search.js';
import { HiddenChannelsModal } from '../src/client/hidden-channels.js';
import { zhTranslate } from '../src/client/locale.js';
import { createStore } from '../src/client/store.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function SearchHarness(): ReactElement {
  const { query, delayedQuery, updateQuery, cancelOnUnmount } = useDelayedSearch(180, (value) =>
    value.trim().toLowerCase(),
  );
  return createElement(
    'div',
    { ref: cancelOnUnmount },
    createElement('button', { onClick: () => updateQuery(' FIRST ') }, 'first'),
    createElement('button', { onClick: () => updateQuery(' SECOND ') }, 'second'),
    createElement('output', { 'data-query': query }, delayedQuery),
  );
}

describe('event-owned delayed search', () => {
  it('keeps the input current and ignores a replaced query', async () => {
    vi.useFakeTimers();
    await act(async () => root.render(createElement(SearchHarness)));
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    expect(host.querySelector('output')?.dataset['query']).toBe(' FIRST ');
    expect(host.querySelector('output')?.textContent).toBe('');
    await act(async () => vi.advanceTimersByTime(100));
    await act(async () => host.querySelectorAll<HTMLButtonElement>('button')[1]?.click());
    await act(async () => vi.advanceTimersByTime(100));
    expect(host.querySelector('output')?.textContent).toBe('');
    await act(async () => vi.advanceTimersByTime(80));
    expect(host.querySelector('output')?.textContent).toBe('second');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending query when the owner unmounts', async () => {
    vi.useFakeTimers();
    await act(async () => root.render(createElement(SearchHarness)));
    await act(async () => host.querySelector<HTMLButtonElement>('button')?.click());
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root.render(null));
    expect(vi.getTimerCount()).toBe(0);
  });
});

it('filters hidden Channels only after the current query delay', async () => {
  vi.useFakeTimers();
  const channel = (id: string, name: string) => ({
    id,
    type: 'group' as const,
    name,
    members: [],
    createdAt: '2026-09-29T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z',
  });
  await act(async () =>
    root.render(
      createElement(HiddenChannelsModal, {
        items: [{ channel: channel('a', 'Team A') }, { channel: channel('b', 'Other') }],
        t: zhTranslate,
        onRestore: vi.fn(),
        onOpen: vi.fn(),
        onClose: vi.fn(),
      }),
    ),
  );
  expect(host.textContent).toContain('Other');
  await act(async () => host.querySelector<HTMLButtonElement>('.bh-hidden-search')?.click());
  expect(host.textContent).toContain('Other');
  await act(async () => vi.advanceTimersByTime(180));
  expect(host.textContent).toContain('Team A');
  expect(host.textContent).not.toContain('Other');
});

function SidebarHarness({ channelId }: { channelId: string }): ReactElement {
  const controller = useChannelSidebar(
    { ...createStore().getSnapshot(), selection: { kind: 'channel', channelId } },
    sidebarPrefs,
  );
  return createElement(
    'button',
    { 'data-mode': controller.mode, onClick: controller.toggle },
    controller.scopeKey,
  );
}

const sidebarPrefs = createChannelSidebarPrefs(undefined);

it('closes the narrow sidebar immediately across rapid Channel changes', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  const render = async (channelId: string): Promise<void> => {
    await act(async () => root.render(createElement(SidebarHarness, { channelId })));
  };
  await render('group-a');
  await act(async () => host.querySelector('button')?.click());
  expect(host.querySelector('button')?.dataset['mode']).toBe('overlay');
  await render('group-b');
  expect(host.querySelector('button')?.dataset['mode']).toBe('hidden');
  await render('group-a');
  expect(host.querySelector('button')?.dataset['mode']).toBe('hidden');
});
