// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const back = vi.hoisted(() => ({ handlers: [] as (() => boolean)[] }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
vi.mock('@expo/ui/jetpack-compose', () => ({
  Host: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ testID: (testID: string) => ({ testID }) }));
vi.mock('../src/cloud/available', () => ({ cloudAvailable: true }));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../src/ui/shell/back-owner', () => ({
  holdBack: (handler: () => boolean) => {
    back.handlers.push(handler);
    return { remove: () => back.handlers.splice(back.handlers.indexOf(handler), 1) };
  },
}));
vi.mock('expo', () => ({
  requireNativeView:
    () =>
    (props: {
      items: { key: string; label: string; path: string }[];
      expanded: boolean;
      direct?: boolean;
      available: boolean;
      label: string;
      closeLabel: string;
      onToggle(event: { nativeEvent: { expanded: boolean } }): void;
      onPick(event: { nativeEvent: { key: string } }): void;
    }) =>
      createElement(
        'section',
        { 'data-expanded': String(props.expanded), 'data-direct': String(props.direct === true) },
        createElement('button', {
          'aria-label': props.expanded ? props.closeLabel : props.label,
          onClick: () =>
            (props.available || props.expanded) &&
            props.onToggle({ nativeEvent: { expanded: !props.expanded } }),
        }),
        props.expanded
          ? props.items.map((item) =>
              createElement(
                'button',
                {
                  key: item.key,
                  'data-menu-item': '',
                  'data-path': item.path,
                  onClick: () => props.onPick({ nativeEvent: { key: item.key } }),
                },
                item.label,
              ),
            )
          : null,
      ),
}));

import { CreationMenuButton } from '../src/ui/shell/creation-menu-button.android';
import { SessionCreateFab } from '../src/ui/shell/session-create-fab.android';
import { creationTargets } from '../src/host/creation-targets';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
import { haptic } from '../src/ui/haptics';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
const pick = vi.fn();
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  back.handlers.length = 0;
  vi.clearAllMocks();
});
function render(scope = 'all', busy = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const targets = creationTargets({ hostId: 'mac', name: 'Mac' }, []);
  act(() =>
    root.render(
      <CreationMenuButton scope={scope} targets={targets} size={56} busy={busy} onPick={pick} />,
    ),
  );
}
const items = () =>
  [...host.querySelectorAll<HTMLElement>('[data-menu-item]')].map((item) => item.textContent);
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLElement>('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent === label,
  );
  expect(button, label).toBeDefined();
  act(() => button!.click());
}

it('opens the native FAB menu and closes it before going to the scoped destination', () => {
  render(computerEnvironmentKey('mac'));
  for (const [label, action] of [
    [t.chatsCreate.blank, 'bot'],
    [t.chatsCreate.zip, 'zip'],
    [t.chatsCreate.marketplace, 'marketplace'],
    [t.chatsCreate.git, 'git'],
  ]) {
    click(t.createHere);
    expect(items()).toEqual([t.chatsCreate.group, t.botCreation.title]);
    expect(
      [...host.querySelectorAll('[data-menu-item]')].every((item) =>
        item.getAttribute('data-path'),
      ),
    ).toBe(true);
    click(t.botCreation.title);
    expect(items()).toEqual([
      t.back,
      t.chatsCreate.blank,
      t.chatsCreate.marketplace,
      t.chatsCreate.zip,
      t.chatsCreate.git,
    ]);
    click(label!);
    expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
    expect(pick).toHaveBeenLastCalledWith(action, expect.objectContaining({ hostId: 'mac' }));
  }
  expect(haptic).toHaveBeenCalledTimes(4);
});

it('keeps All explicit and joins without a Computer', () => {
  render();
  click(t.createHere);
  click(t.botCreation.title);
  click(t.chatsCreate.blank);
  expect(pick).toHaveBeenLastCalledWith('bot', undefined);
  click(t.createHere);
  click(t.chatsCreate.join);
  expect(pick).toHaveBeenLastCalledWith('join', undefined);
});

it('closes from the toggle and from system Back without navigating', () => {
  render();
  click(t.createHere);
  expect(back.handlers).toHaveLength(1);
  click(t.close);
  expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
  expect(back.handlers).toHaveLength(0);
  click(t.createHere);
  act(() => void back.handlers[0]!());
  expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
  expect(pick).not.toHaveBeenCalled();
  expect(haptic).toHaveBeenCalledTimes(2);
});

it('blocks the toggle while preparation is pending', () => {
  render('all', true);
  click(t.createHere);
  expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
  expect(haptic).not.toHaveBeenCalled();
});

it('returns from the Bot creation choices before closing on system Back without selecting a source', () => {
  render();
  click(t.createHere);
  click(t.botCreation.title);
  expect(items()).toEqual([
    t.back,
    t.chatsCreate.blank,
    t.chatsCreate.marketplace,
    t.chatsCreate.zip,
    t.chatsCreate.git,
  ]);
  expect(pick).not.toHaveBeenCalled();
  act(() => void back.handlers[0]!());
  expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('true');
  expect(items()).toContain(t.botCreation.title);
  expect(items()).not.toContain(t.chatsCreate.zip);
  act(() => void back.handlers[0]!());
  expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
  expect(pick).not.toHaveBeenCalled();
});

it('returns through the submenu Back row and cancels through Close without importing', () => {
  render();
  click(t.createHere);
  click(t.botCreation.title);
  click(t.back);
  expect(items()).toContain(t.botCreation.title);
  click(t.botCreation.title);
  click(t.close);
  expect(pick).not.toHaveBeenCalled();
  click(t.createHere);
  expect(items()).toContain(t.botCreation.title);
});

it('keeps All import choices destination-free until the existing import flow chooses a Computer', () => {
  render();
  for (const [label, action] of [
    [t.chatsCreate.zip, 'zip'],
    [t.chatsCreate.git, 'git'],
  ]) {
    click(t.createHere);
    click(t.botCreation.title);
    click(label!);
    expect(pick).toHaveBeenLastCalledWith(action, undefined);
  }
});

it('uses the native FAB in direct mode for Sessions', () => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const open = vi.fn();
  act(() => root.render(<SessionCreateFab onPress={open} />));
  expect(host.querySelector('section')?.getAttribute('data-direct')).toBe('true');
  click(t.hostSessions.create);
  expect(open).toHaveBeenCalledTimes(1);
  expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
  expect(items()).toEqual([]);
  expect(back.handlers).toHaveLength(0);
});
