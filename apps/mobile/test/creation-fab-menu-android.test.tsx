// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const back = vi.hoisted(() => ({ handlers: [] as (() => boolean)[] }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));
vi.mock('react-native-reanimated', () => ({ useReducedMotion: () => true }));
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
      available: boolean;
      label: string;
      closeLabel: string;
      onToggle(event: { nativeEvent: { expanded: boolean } }): void;
      onPick(event: { nativeEvent: { key: string } }): void;
    }) =>
      createElement(
        'section',
        { 'data-expanded': String(props.expanded) },
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
  const targets = creationTargets({ hostId: 'mac', name: 'Mac' }, []).map((target) => ({
    ...target,
    channelCreation: false,
  }));
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
    [t.botCreation.blank, 'bot'],
    [t.botCreation.fromZip, 'zip'],
    [t.marketplace.browse, 'marketplace'],
    [t.botCreation.fromGit, 'git'],
  ]) {
    click(t.createHere);
    expect(items()).toEqual([
      t.botCreation.blank,
      t.botCreation.fromZip,
      t.marketplace.browse,
      t.botCreation.fromGit,
    ]);
    expect(
      [...host.querySelectorAll('[data-menu-item]')].every((item) =>
        item.getAttribute('data-path'),
      ),
    ).toBe(true);
    click(label!);
    expect(host.querySelector('section')?.getAttribute('data-expanded')).toBe('false');
    expect(pick).toHaveBeenLastCalledWith(action, expect.objectContaining({ hostId: 'mac' }));
  }
  expect(haptic).toHaveBeenCalledTimes(4);
});

it('keeps All explicit and joins without a Computer', () => {
  render();
  click(t.createHere);
  click(t.botCreation.blank);
  expect(pick).toHaveBeenLastCalledWith('bot', undefined);
  click(t.createHere);
  click(t.cloudJoin.title);
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
