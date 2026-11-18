// @vitest-environment jsdom
import { act, createContext, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { View } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const listeners = new Map<string, Set<() => void>>();
  return {
    push: vi.fn(),
    listeners,
    emit(event: string) {
      for (const listener of listeners.get(event) ?? []) listener();
    },
  };
});
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaInsetsContext: createContext(undefined),
}));
vi.mock('expo-router', () => {
  const navigation = {
    goBack: vi.fn(),
    setOptions: vi.fn(),
    addListener(event: string, listener: () => void) {
      const set = state.listeners.get(event) ?? new Set();
      set.add(listener);
      state.listeners.set(event, set);
      return () => set.delete(listener);
    },
  };
  const Stack = Object.assign(({ children }: { children?: ReactNode }) => <>{children}</>, {
    Screen: () => null,
  });
  return {
    Stack,
    router: { push: state.push },
    useRouter: () => ({ back: vi.fn() }),
    useNavigation: () => navigation,
    useIsFocused: () => true,
  };
});
vi.mock('../src/ui/primitives/sheet-header', () => ({ sheetStackHeader: () => () => null }));
vi.mock('../src/ui/chat/profile-presentation', () => ({ profileRootHeader: () => undefined }));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ client: {} }),
}));
vi.mock('../src/host/human-profile', () => ({
  useHumanIdentity: () => ({ identity: { profileSetup: 'pending' }, mount: () => {} }),
}));

import { PROFILE_SETUP_SETTLE_MS, useProfileSetupPrompt } from '../src/host/profile-setup-prompt';
import { SheetStack } from '../src/ui/primitives/sheet-stack';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Prompt() {
  const { prompt } = useProfileSetupPrompt();
  return <View ref={prompt} />;
}

let root: Root;
let element: HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  state.push.mockClear();
  state.listeners.clear();
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
});

afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  vi.useRealTimers();
});

it('opens the profile setup prompt only after a dismissed sign-in sheet unmounts', async () => {
  await act(async () =>
    root.render(
      <SheetStack>
        <View />
      </SheetStack>,
    ),
  );
  await act(async () => state.emit('blur'));
  await act(async () =>
    root.render(
      <>
        <SheetStack>
          <View />
        </SheetStack>
        <Prompt />
      </>,
    ),
  );
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS * 2));
  expect(state.push).not.toHaveBeenCalled();
  await act(async () => root.render(<Prompt />));
  expect(state.push).toHaveBeenCalledExactlyOnceWith('/settings/profile-setup');
});
