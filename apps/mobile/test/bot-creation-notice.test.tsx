// @vitest-environment jsdom
import { act, createElement, type CSSProperties, type ReactNode, type Ref } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { CreationSnapshot } from '../src/host/bot-creation';

const fixture = vi.hoisted(() => ({
  path: '/',
  keyboard: false,
  appState: 'active',
  onState: undefined as undefined | ((state: string) => void),
  offState: vi.fn(),
  offHost: vi.fn(),
  resume: vi.fn(async () => {}),
  open: vi.fn(async (_stillHere: () => boolean) => false),
  push: vi.fn(),
  state: {
    loaded: true,
    busy: false,
    record: {
      kind: 'submitted',
      mutationStarted: true,
      operation: {
        hostId: 'private-host-uuid',
        deviceId: 'phone',
        operationKey: 'operation-123',
        input: { displayName: 'New Bot' },
      },
    },
  } as CreationSnapshot,
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  View: (props: {
    children?: ReactNode;
    ref?: Ref<HTMLDivElement>;
    style?: CSSProperties;
    testID?: string;
  }) =>
    createElement(
      'div',
      { ref: props.ref, style: props.style, 'data-testid': props.testID },
      props.children,
    ),
  AppState: {
    get currentState() {
      return fixture.appState;
    },
    addEventListener: (_event: string, onState: (state: string) => void) => {
      fixture.onState = onState;
      return { remove: fixture.offState };
    },
  },
}));
vi.mock('expo-router', () => ({ usePathname: () => fixture.path, router: { push: fixture.push } }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ left: 0, right: 0, bottom: 34 }),
}));
vi.mock('react-native-keyboard-controller', () => ({ useKeyboardState: () => fixture.keyboard }));
vi.mock('../src/host/native-bot-creation', () => ({
  useBotCreation: () => fixture.state,
  botCreation: {
    ready: Promise.resolve(),
    getSnapshot: () => fixture.state,
    resume: fixture.resume,
  },
}));
vi.mock('../src/host/host-session', () => ({
  hostSession: {
    getState: () => ({ saved: {} }),
    subscribe: () => fixture.offHost,
  },
}));
vi.mock('../src/ui/design/theme', () => ({
  useDesignTheme: () => ({ layer: { raised: { fill: 'white' } } }),
}));
vi.mock('../src/ui/primitives/text', () => ({
  Text: ({ children }: { children: ReactNode }) => createElement('span', null, children),
}));
vi.mock('../src/ui/primitives/button', () => ({
  Button: ({ label, onPress }: { label: string; onPress(): void }) =>
    createElement('button', { onClick: onPress }, label),
}));
vi.mock('../src/ui/shell/open-created-bot', () => ({ openCreatedBot: fixture.open }));
import { BotCreationNotice } from '../src/ui/shell/bot-creation-notice';
import { creationCopy, creationError } from '../src/ui/shell/bot-creation-copy';
import { t } from '../src/ui/strings';

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  fixture.path = '/';
  fixture.keyboard = false;
  fixture.appState = 'active';
  fixture.state = { ...fixture.state, receipt: undefined };
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
});

it('never renders a global creation footer on Home, with or without the keyboard', async () => {
  await act(async () => root.render(<BotCreationNotice />));
  expect(container.querySelector('[data-testid="create-bot-notice"]')).toBeNull();
  expect(container.querySelector('button')).toBeNull();
  fixture.keyboard = true;
  await act(async () => root.render(<BotCreationNotice />));
  expect(container.textContent).toBe('');
});

it('owns recovery subscriptions even when its notice is hidden and releases them on unmount', async () => {
  fixture.path = '/create-bot';
  await act(async () => root.render(<BotCreationNotice />));
  expect(container.textContent).toBe('');
  expect(fixture.resume).toHaveBeenCalled();
  await act(() => root.render(null));
  expect(fixture.offState).toHaveBeenCalledOnce();
  expect(fixture.offHost).toHaveBeenCalledOnce();
});

it('uses canonical localized copy and keeps unknown refusal codes out of visible errors', () => {
  expect(creationCopy).toBe(t.botCreation);
  expect(creationError('private-internal-code')).toBe(t.botCreation.refused);
  expect(creationError('private-internal-code')).not.toContain('private-internal-code');
});

it.each(['git-clone-failed', 'git-clone-timeout', 'git-not-found'])(
  'explains the actual Git refusal %s',
  (code) => {
    expect(creationError(code)).not.toBe(t.botCreation.refused);
    expect(creationError(code)).not.toContain(code);
  },
);
