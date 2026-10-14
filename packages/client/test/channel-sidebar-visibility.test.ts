// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({ open, anchor, children }: { open: boolean; anchor: ReactNode; children: ReactNode }) =>
    createElement('div', null, anchor, open ? children : null),
  MenuItemButton: ({
    onSelect,
    children,
    disabled,
  }: {
    onSelect(): void;
    children: ReactNode;
    disabled?: boolean;
  }) => createElement('button', { onClick: onSelect, disabled }, children),
}));
import { ChannelSidebarContents } from '../src/client/channel-sidebar-view.js';
import {
  channelSidebarScopeKey,
  createChannelSidebarPrefs,
  type ChannelSidebarPrefs,
} from '../src/client/channel-sidebar-prefs.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarScope,
} from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
let root: Root;
let host: HTMLDivElement;
let prefs: ChannelSidebarPrefs;
let storage: Map<string, string>;
const entry = (id: string, scope: ChannelSidebarScope = 'personabot'): ChannelSidebarEntry => ({
  id,
  label: id,
  scope,
  component: () => createElement('div', null, 'body-' + id),
});
let entries: ChannelSidebarEntry[];
let registered: ChannelSidebarEntry[];
function render(scope: ChannelSidebarScope = 'personabot', slug = 'ada') {
  const scopeKey = channelSidebarScopeKey(scope, 'dm-' + slug, slug);
  const props = {
    scope,
    channelId: 'dm-' + slug,
    botSlug: scope === 'personabot' ? slug : undefined,
    actions: {},
    t: zhTranslate,
  } as unknown as ChannelSidebarEntryProps;
  act(() =>
    root.render(
      createElement(ChannelSidebarContents, {
        key: scopeKey,
        entries,
        registered,
        entryProps: props,
        prefs,
        controller: {
          isEntryExpanded: (id) => prefs.isEntryExpanded(scopeKey, id),
          toggleEntry: (id) =>
            prefs.setEntryExpanded(scopeKey, id, !prefs.isEntryExpanded(scopeKey, id)),
        },
      }),
    ),
  );
}
const order = () =>
  [...host.querySelectorAll<HTMLElement>('[data-entry-id]')]
    .filter((n) => !n.hidden)
    .map((n) => n.dataset['entryId']);
function click(label: string) {
  act(() => [...host.querySelectorAll('button')].find((b) => b.textContent === label)?.click());
}
function edit() {
  act(() => host.querySelector<HTMLButtonElement>('.bh-sidebar-settings')!.click());
  click('编辑侧边栏');
}
function key(id: string, value: string) {
  act(() =>
    host
      .querySelector<HTMLElement>('[data-order-handle="' + id + '"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })),
  );
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => {
    callback(0);
    return 1;
  });
  storage = new Map();
  prefs = createChannelSidebarPrefs({
    getItem: (k) => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, v),
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  entries = ['memory', 'sessions', 'inbox'].map((id) => entry(id));
  registered = entries;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = order().indexOf(this.dataset['entryId']);
    return new DOMRect(0, Math.max(0, index) * 34, 320, 34);
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function visibility(id: string) {
  const button = host.querySelector<HTMLButtonElement>('[data-visibility-toggle="' + id + '"]');
  expect(button).not.toBeNull();
  act(() => button!.click());
}
describe('Channel sidebar personal item visibility', () => {
  it('keeps a hidden entry hidden during settings preview and restores its allowed expansion when shown', () => {
    entries[0] = {
      ...entries[0]!,
      settings: (props) =>
        createElement('button', { onClick: () => props.onPreview?.() }, 'preview memory'),
    };
    registered = entries;
    prefs.setEntryLayout('personabot', ['memory', 'sessions', 'inbox'], ['memory']);
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    act(() => host.querySelector<HTMLButtonElement>('.bh-sidebar-settings')!.click());
    click('preview memory');
    expect(host.querySelector<HTMLElement>('[data-entry-id="memory"]')!.hidden).toBe(true);
    expect(host.textContent).not.toContain('body-memory');
    act(() => host.querySelector<HTMLButtonElement>('.bh-sidebar-settings')!.click());
    edit();
    visibility('memory');
    click('完成');
    expect(host.textContent).toContain('body-memory');
    expect(prefs.isEntryExpanded('personabot:ada', 'memory')).toBe(true);
  });
  it('keeps visibility controls independent and preserves hidden choices through a whole-row pointer reorder', () => {
    render();
    edit();
    const button = host.querySelector<HTMLButtonElement>('[data-visibility-toggle="memory"]')!;
    const send = (type: string, y: number, target: EventTarget) => {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: 150,
        clientY: y,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      act(() => target.dispatchEvent(event));
    };
    send('pointerdown', 10, button);
    send('pointermove', 100, document);
    send('pointerup', 100, document);
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    expect(host.querySelector('[data-drop-indicator]')).toBeNull();
    const native = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(native, 'dataTransfer', {
      value: { effectAllowed: '', setData: vi.fn() },
    });
    act(() => button.dispatchEvent(native));
    expect(native.defaultPrevented).toBe(true);
    visibility('memory');
    send('pointerdown', 10, host.querySelector('[data-entry-id="memory"]')!);
    send('pointermove', 100, document);
    send('pointerup', 100, document);
    expect(order()).toEqual(['sessions', 'inbox', 'memory']);
    click('完成');
    expect(order()).toEqual(['sessions', 'inbox']);
    expect(prefs.getSnapshot().hiddenEntries.personabot).toEqual(['memory']);
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual(['sessions', 'inbox', 'memory']);
  });
  it('bounds malformed stored visibility and preserves it when existing callers reorder entries', () => {
    storage.set(
      'botharness.channel-sidebar',
      JSON.stringify({
        hiddenEntries: {
          personabot: [
            'memory',
            'memory',
            '',
            null,
            7,
            'x'.repeat(201),
            ...Array.from({ length: 210 }, (_, i) => 'plugin-' + i),
          ],
          channel: 'invalid',
        },
      }),
    );
    prefs = createChannelSidebarPrefs({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    });
    expect(prefs.getSnapshot().hiddenEntries.personabot).toHaveLength(200);
    expect(prefs.getSnapshot().hiddenEntries.personabot.slice(0, 2)).toEqual([
      'memory',
      'plugin-0',
    ]);
    expect(prefs.getSnapshot().hiddenEntries.channel).toEqual([]);
    const notify = vi.fn();
    prefs.subscribe(notify);
    prefs.setEntryOrder('personabot', ['sessions', 'memory', 'inbox']);
    render();
    expect(order()).toEqual(['sessions', 'inbox']);
    expect(prefs.getSnapshot().hiddenEntries.personabot).toHaveLength(200);
    prefs.setEntryLayout(
      'personabot',
      ['sessions', 'memory', 'inbox'],
      prefs.getSnapshot().hiddenEntries.personabot,
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(storage.get('botharness.channel-sidebar')!).hiddenEntries.personabot,
    ).toHaveLength(200);
  });

  it('keeps hidden rows recoverable in the draft, then saves order and visibility together once', () => {
    render();
    edit();
    visibility('memory');
    key('sessions', 'Home');
    expect(order()).toEqual(['sessions', 'memory', 'inbox']);
    expect(host.querySelector('[data-entry-id="memory"]')?.hasAttribute('data-entry-hidden')).toBe(
      true,
    );
    expect(prefs.getSnapshot().hiddenEntries.personabot).toEqual([]);
    const notify = vi.fn();
    prefs.subscribe(notify);
    click('完成');
    expect(order()).toEqual(['sessions', 'inbox']);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(prefs.getSnapshot().hiddenEntries.personabot).toEqual(['memory']);
    expect(prefs.getSnapshot().entryOrders.personabot).toEqual(['sessions', 'memory', 'inbox']);
    edit();
    expect(order()).toEqual(['sessions', 'memory', 'inbox']);
    visibility('memory');
    click('完成');
    expect(order()).toEqual(['sessions', 'memory', 'inbox']);
  });
  it('Cancel and interrupted edits discard visibility along with order', () => {
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    edit();
    visibility('memory');
    key('memory', 'End');
    click('取消');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    expect(host.textContent).toContain('body-memory');
    edit();
    visibility('memory');
    render('personabot', 'bea');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    expect(prefs.getSnapshot().hiddenEntries.personabot).toEqual([]);
  });
  it('retains separate DM/group preferences across reload and treats defaults as a draft', () => {
    render();
    edit();
    visibility('memory');
    click('完成');
    render('personabot', 'bea');
    expect(order()).toEqual(['sessions', 'inbox']);
    entries = ['members', 'settings'].map((id) => entry(id, 'channel'));
    registered = entries;
    render('channel', 'team');
    expect(order()).toEqual(['members', 'settings']);
    edit();
    visibility('members');
    click('完成');
    prefs = createChannelSidebarPrefs({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    });
    render('channel', 'other-team');
    expect(order()).toEqual(['settings']);
    entries = ['memory', 'sessions', 'inbox'].map((id) => entry(id));
    registered = entries;
    render();
    expect(order()).toEqual(['sessions', 'inbox']);
    edit();
    click('恢复默认布局');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    click('取消');
    expect(order()).toEqual(['sessions', 'inbox']);
    edit();
    click('恢复默认布局');
    click('完成');
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    expect(prefs.getSnapshot().hiddenEntries.personabot).toEqual([]);
  });
  it('always keeps settings and hidden rows reachable when every item is hidden', () => {
    render();
    edit();
    for (const id of ['memory', 'sessions', 'inbox']) visibility(id);
    click('完成');
    expect(order()).toEqual([]);
    expect(host.textContent).toContain('所有项目均已隐藏');
    expect(host.querySelector<HTMLButtonElement>('.bh-sidebar-settings')?.disabled).toBe(false);
    edit();
    expect(order()).toEqual(['memory', 'sessions', 'inbox']);
    visibility('sessions');
    click('完成');
    expect(order()).toEqual(['sessions']);
  });
  it('keeps the permission gate mounted for a hidden item without rendering its body', () => {
    let gate: ChannelSidebarEntryProps['setExpandable'];
    entries[0] = {
      ...entries[0]!,
      headerAction: (props) => {
        gate = props.setExpandable;
        return createElement('span', null, 'access');
      },
    };
    registered = entries;
    prefs.setEntryExpanded('personabot:ada', 'memory', true);
    render();
    edit();
    visibility('memory');
    click('完成');
    expect(host.textContent).not.toContain('body-memory');
    act(() => gate?.(false));
    expect(prefs.isEntryExpanded('personabot:ada', 'memory')).toBe(false);
    edit();
    visibility('memory');
    click('完成');
    expect(host.textContent).not.toContain('body-memory');
    expect(
      host.querySelector<HTMLButtonElement>('[data-entry-id="memory"] [data-panel-head]')?.disabled,
    ).toBe(true);
  });
  it('preserves hidden registration identities and loads legacy preferences with every item shown', () => {
    storage.set(
      'botharness.channel-sidebar',
      JSON.stringify({
        entryOrders: { personabot: ['inbox', 'memory', 'sessions'] },
        width: 420,
        memoryTerminology: 'git',
      }),
    );
    prefs = createChannelSidebarPrefs({
      getItem: (k) => storage.get(k) ?? null,
      setItem: (k, v) => storage.set(k, v),
    });
    render();
    expect(order()).toEqual(['inbox', 'memory', 'sessions']);
    edit();
    visibility('memory');
    click('完成');
    entries = entries.filter((e) => e.id !== 'memory');
    registered = entries;
    render();
    edit();
    click('完成');
    entries = [...entries, entry('memory'), entry('new')];
    registered = entries;
    render();
    expect(order()).toEqual(['inbox', 'sessions', 'new']);
    edit();
    expect(order()).toEqual(['inbox', 'memory', 'sessions', 'new']);
    visibility('memory');
    click('完成');
    expect(order()).toEqual(['inbox', 'memory', 'sessions', 'new']);
    expect(prefs.getSnapshot().width).toBe(420);
    expect(prefs.getSnapshot().memoryTerminology).toBe('git');
  });
});
