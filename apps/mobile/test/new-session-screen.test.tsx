// @vitest-environment jsdom
import { act, useLayoutEffect, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const fixture = vi.hoisted(() => ({
  replace: vi.fn(),
  call: vi.fn(),
  scope: 'all',
  member: false,
  folder: undefined as undefined | { path: string; title: string; workspaceId?: string },
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('expo-router', () => ({
  Redirect: () => null,
  Stack: { Screen: () => null },
  useFocusEffect: (work: () => void | (() => void)) => useLayoutEffect(work, [work]),
  useRouter: () => ({ replace: fixture.replace }),
}));
vi.mock('../src/ui/interface-preferences', async (original) => ({
  ...(await original<typeof import('../src/ui/interface-preferences')>()),
  useSessionsTab: () => true,
}));
vi.mock('../src/host/native-conversation-filter', () => ({
  useConversationFilter: () => [fixture.scope, () => {}],
}));
vi.mock('../src/host/native-host-look', () => ({ useHostLook: () => ({}) }));
vi.mock('../src/host/host-session', () => {
  const host = (hostId: string, hostName: string) => ({
    saved: {
      hostId,
      hostName,
      routes: [],
      deviceId: `${hostId}-device`,
      credential: 'test-fixture',
      ...(fixture.member
        ? {
            member: {
              humanId: 'member-1',
              displayName: 'Test Member',
              username: 'test-member',
              fingerprint: 'a'.repeat(64),
              mustChangePassword: false,
            },
          }
        : {}),
    },
    snapshot: { connection: { status: 'connected' } },
    client: {
      hostId,
      call: (method: string, args: unknown) => fixture.call(hostId, method, args),
    },
  });
  return {
    useHostSession: () => host('studio', 'Studio'),
    useHostSessions: () => [host('studio', 'Studio'), host('laptop', 'Laptop')],
    useHostSnapshot: () => ({ connection: { status: 'connected' } }),
  };
});
vi.mock('../src/features/sessions/last-session-folder', () => ({
  lastSessionFolder: () => fixture.folder,
  rememberSessionFolder: vi.fn(),
}));
vi.mock('../src/features/sessions/session-drawer-button', () => ({
  SessionDrawerButton: () => <button aria-label="Show Sessions" />,
}));
vi.mock('../src/ui/primitives/keyboard-frame', () => ({
  KeyboardChatFrame: ({ children, composer }: { children: ReactNode; composer: ReactNode }) => (
    <div>
      {children}
      {composer}
    </div>
  ),
}));
vi.mock('../src/ui/chat/composer', () => ({
  Composer: (props: {
    value: string;
    disabled: boolean;
    onChange(text: string): void;
    onSend(): void;
    above: ReactNode;
  }) => (
    <div>
      {props.above}
      <button data-testid="type" onClick={() => props.onChange('Map the repository')} />
      <button data-testid="send" disabled={props.disabled} onClick={props.onSend} />
    </div>
  ),
}));
vi.mock('../src/ui/chat/session-model-composer', () => ({
  useSessionModelControl: () => ({ visible: false, state: { override: null, default: null } }),
  SessionModelChip: () => null,
  SessionModelPicker: () => null,
}));
vi.mock('../src/ui/chat/folder-picker-sheet', () => ({
  FolderPickerSheet: ({
    pick,
  }: {
    pick: { onPick(folder: { path: string; title: string; workspaceId?: string }): void };
  }) => (
    <button
      data-testid="pick-workspace"
      onClick={() => pick.onPick({ path: '/work/app', title: 'app', workspaceId: 'ws-1' })}
    />
  ),
}));
vi.mock('../src/ui/chat/sheet', () => ({
  SHEET_GROUP: 'sheet',
  Sheet: ({ visible, children }: { visible: boolean; children: ReactNode }) =>
    visible ? <div role="dialog">{children}</div> : null,
}));
vi.mock('../src/ui/primitives/settings-row', () => ({
  SettingsGroupItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  SettingsRow: (props: {
    testID?: string;
    title: string;
    control?: { kind: string; text?: string };
    onPress?(): void;
  }) => (
    <button
      data-testid={props.testID}
      disabled={props.onPress === undefined}
      onClick={props.onPress}
    >
      {props.title}
      {props.control?.text === undefined ? '' : `: ${props.control.text}`}
    </button>
  ),
}));

import { NewSessionScreen } from '../src/features/sessions/new-session-screen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  fixture.replace.mockReset();
  fixture.call.mockReset();
  fixture.scope = 'all';
  fixture.member = false;
  fixture.folder = undefined;
});

async function render() {
  const view = document.createElement('div');
  root = createRoot(view);
  await act(async () => root!.render(<NewSessionScreen />));
  const click = (id: string) =>
    act(async () => view.querySelector<HTMLElement>(`[data-testid="${id}"]`)!.click());
  return { view, click };
}

it('creates and opens a native Session in the chosen Workspace of the preselected Computer', async () => {
  fixture.call.mockResolvedValue({ sessionId: 'created', requestId: 'prompt-1' });
  const { view, click } = await render();
  expect(view.querySelector('[data-testid="new-session-computer"]')?.textContent).toBe(
    'Computer: Studio',
  );
  expect(view.querySelector('[data-testid="new-session-folder"]')?.textContent).toBe(
    'Folder: Choose a folder',
  );
  await click('type');
  expect(view.querySelector<HTMLButtonElement>('[data-testid="send"]')!.disabled).toBe(true);
  await click('new-session-folder');
  await click('pick-workspace');
  expect(view.querySelector('[data-testid="new-session-folder"]')?.textContent).toBe('Folder: app');
  await click('send');
  expect(fixture.call).toHaveBeenCalledExactlyOnceWith('studio', 'sessionCreate', {
    workspaceId: 'ws-1',
    text: 'Map the repository',
  });
  expect(fixture.replace).toHaveBeenCalledWith({
    pathname: '/session/[id]',
    params: { id: 'created', hostId: 'studio', source: 'native', title: 'Map the repository' },
  });
});

it('starts on the scope’s Computer and lets this Session use another one', async () => {
  fixture.scope = JSON.stringify(['computer', 'laptop']);
  fixture.folder = { path: '/home/me/notes', title: 'notes' };
  fixture.call.mockResolvedValue({ sessionId: 'created', requestId: 'prompt-1' });
  const { view, click } = await render();
  expect(view.querySelector('[data-testid="new-session-computer"]')?.textContent).toBe(
    'Computer: Laptop',
  );
  await click('new-session-computer');
  await click('new-session-computer-studio');
  expect(view.querySelector('[data-testid="new-session-computer"]')?.textContent).toBe(
    'Computer: Studio',
  );
  await click('type');
  await click('send');
  expect(fixture.call).toHaveBeenCalledWith('studio', 'sessionCreate', {
    cwd: '/home/me/notes',
    text: 'Map the repository',
  });
});

it('keeps the draft and shows the Host refusal when creation fails', async () => {
  fixture.folder = { path: '/work/app', title: 'app' };
  fixture.call.mockRejectedValue(new Error('Host Owner permission is required'));
  const { view, click } = await render();
  await click('type');
  await click('send');
  expect(view.querySelector('[role="alert"]')?.textContent).toContain(
    'Couldn’t start the Session.',
  );
  expect(fixture.replace).not.toHaveBeenCalled();
});

it('tells a member that only the Host Owner can start Sessions', async () => {
  fixture.member = true;
  const { view } = await render();
  expect(view.textContent).toContain('Only the Host Owner can start Sessions on this computer.');
  expect(view.querySelector('[data-testid="send"]')).toBeNull();
});
