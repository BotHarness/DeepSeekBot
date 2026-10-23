// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
}));
vi.mock('../src/cloud/available', () => ({ cloudAvailable: true }));
vi.mock('../src/ui/shell/icons', () => ({ PlusIcon: () => null }));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxSize: () => ({}),
  testID: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', () => {
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const DropdownMenu = ({
    expanded,
    onDismissRequest,
    children,
  }: {
    expanded: boolean;
    onDismissRequest(): void;
    children: ReactNode;
  }) =>
    expanded
      ? createElement(
          'section',
          null,
          createElement('button', { 'aria-label': 'dismiss', onClick: onDismissRequest }),
          children,
        )
      : null;
  DropdownMenu.Trigger = () => null;
  DropdownMenu.Items = pass;
  const DropdownMenuItem = ({
    children,
    onClick,
    enabled,
  }: {
    children: ReactNode;
    onClick(): void;
    enabled?: boolean;
  }) =>
    createElement(
      'button',
      { onClick, disabled: enabled === false, 'data-menu-item': '' },
      children,
    );
  DropdownMenuItem.Text = pass;
  return { Box: pass, Host: pass, Text: pass, DropdownMenu, DropdownMenuItem };
});
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
  vi.clearAllMocks();
});
function render(scope = 'all', busy = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <CreationMenuButton
        scope={scope}
        targets={creationTargets({ hostId: 'mac', name: 'Mac' }, []).map((t) => ({
          ...t,
          channelCreation: false,
        }))}
        size={64}
        busy={busy}
        onPick={pick}
      />,
    ),
  );
}
function click(label: string) {
  const b = [...host.querySelectorAll('button')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent === label,
  );
  expect(b, label).toBeDefined();
  act(() => b!.click());
}
it('shows four native items without a title and closes before selecting the scoped destination', () => {
  render(computerEnvironmentKey('mac'));
  for (const [label, action] of [
    [t.botCreation.blank, 'bot'],
    [t.botCreation.fromZip, 'zip'],
    [t.marketplace.browse, 'marketplace'],
    [t.botCreation.fromGit, 'git'],
  ]) {
    click(t.createHere);
    expect([...host.querySelectorAll('[data-menu-item]')].map((e) => e.textContent)).toEqual([
      t.botCreation.blank,
      t.botCreation.fromZip,
      t.marketplace.browse,
      t.botCreation.fromGit,
    ]);
    click(label!);
    expect(host.querySelector('section')).toBeNull();
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
it('dismisses without navigation or extra feedback and can reopen', () => {
  render();
  click(t.createHere);
  click(t.createHere);
  expect(haptic).toHaveBeenCalledOnce();
  click('dismiss');
  expect(pick).not.toHaveBeenCalled();
  click(t.createHere);
  expect(haptic).toHaveBeenCalledTimes(2);
});
it('blocks the trigger while preparation is pending', () => {
  render('all', true);
  click(t.createHere);
  expect(host.querySelector('section')).toBeNull();
  expect(haptic).not.toHaveBeenCalled();
});
