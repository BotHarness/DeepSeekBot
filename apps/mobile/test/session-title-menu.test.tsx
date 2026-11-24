// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const dialog = vi.hoisted(() => ({ showActionMenu: vi.fn() }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/app-dialog', () => dialog);
vi.mock('../src/ui/chat/session-place-line', () => ({ SessionPlaceLine: () => null }));
vi.mock('../src/ui/chat/chat-title-capsule', () => ({
  ChatTitleCapsule: (props: {
    title: string;
    kind: 'button' | 'heading';
    accessibilityLabel: string;
    accessibilityHint?: string;
    testID: string;
    onPress?(): void;
  }) => (
    <button
      data-testid={props.testID}
      data-kind={props.kind}
      aria-label={props.accessibilityLabel}
      aria-description={props.accessibilityHint}
      onClick={props.onPress}
    >
      {props.title}
    </button>
  ),
}));

import { SessionTitleMenu } from '../src/ui/chat/session-title-menu';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('opens the Session options from the name capsule, titled with the full name', async () => {
  const run = vi.fn();
  const view = document.createElement('div');
  const root = createRoot(view);
  const title = 'Investigate the flaky release build on the staging computer';
  await act(async () =>
    root.render(
      <SessionTitleMenu
        title={title}
        hint="Session options"
        menu={{
          label: 'Session options',
          testID: 'session-options',
          items: [
            { label: 'Model choice', testID: 'session-model-choice', icon: 'model', run },
            { label: 'Stop', testID: 'session-stop', icon: 'stop', run, disabled: true },
          ],
        }}
      />,
    ),
  );
  const capsule = view.querySelector<HTMLElement>('[data-testid="session-header-title"]')!;
  expect(capsule.getAttribute('aria-label')).toBe(title);
  expect(capsule.getAttribute('aria-description')).toBe('Session options');
  expect(capsule.dataset['kind']).toBe('button');
  await act(async () => capsule.click());
  expect(dialog.showActionMenu).toHaveBeenCalledExactlyOnceWith(title, [
    { text: 'Model choice', icon: 'model', onPress: run },
  ]);
  act(() => root.unmount());
});

it('names the Host and folder for screen readers and puts the full path in the menu', async () => {
  dialog.showActionMenu.mockClear();
  const run = vi.fn();
  const view = document.createElement('div');
  const root = createRoot(view);
  await act(async () =>
    root.render(
      <SessionTitleMenu
        title="Launch plan"
        place={{
          hostIcon: { kind: 'symbol', id: 'laptop' },
          hostName: 'Studio Mac',
          folder: 'app-5187',
          path: '/Users/me/worktrees/app-5187',
        }}
        hint="Session options"
        menu={{
          label: 'Session options',
          testID: 'session-options',
          items: [{ label: 'Model choice', testID: 'session-model-choice', icon: 'model', run }],
        }}
      />,
    ),
  );
  const capsule = view.querySelector<HTMLElement>('[data-testid="session-header-title"]')!;
  expect(capsule.getAttribute('aria-label')).toBe('Launch plan, Studio Mac, app-5187');
  await act(async () => capsule.click());
  expect(dialog.showActionMenu).toHaveBeenCalledExactlyOnceWith(
    'Launch plan\nStudio Mac\n/\u200bUsers/\u200bme/\u200bworktrees/\u200bapp-\u200b5187',
    [{ text: 'Model choice', icon: 'model', onPress: run }],
  );
  act(() => root.unmount());
});
