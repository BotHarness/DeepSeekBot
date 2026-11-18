// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { View } from 'react-native';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  shown: false,
  client: {} as object | undefined,
  setup: 'pending' as string | undefined,
  push: vi.fn(),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({
  router: { push: state.push },
  useIsFocused: () => state.shown,
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({ client: state.client }),
}));
vi.mock('../src/host/human-profile', () => ({
  useHumanIdentity: () => ({ identity: { profileSetup: state.setup }, mount: () => {} }),
}));

import { PROFILE_SETUP_SETTLE_MS, useProfileSetupPrompt } from '../src/host/profile-setup-prompt';
import { sheetClosing } from '../src/ui/primitives/sheet-closing';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe() {
  const { prompt } = useProfileSetupPrompt();
  return <View ref={prompt} />;
}

let root: Root;
let element: HTMLElement;
const render = () => act(async () => root.render(<Probe />));

beforeEach(() => {
  vi.useFakeTimers();
  state.shown = false;
  state.client = {};
  state.setup = 'pending';
  state.push.mockClear();
  element = document.createElement('div');
  document.body.append(element);
  root = createRoot(element);
});

afterEach(async () => {
  await act(async () => root.unmount());
  element.remove();
  vi.useRealTimers();
});

it('waits until no sheet covers the shell and the sheet has had time to close', async () => {
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS * 2));
  expect(state.push).not.toHaveBeenCalled();
  state.shown = true;
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS - 1));
  expect(state.push).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(state.push).toHaveBeenCalledExactlyOnceWith('/settings/profile-setup');
});

it('does not prompt when another sheet opens before the shell settles, then prompts once it is shown again', async () => {
  state.shown = true;
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS / 2));
  state.shown = false;
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS * 2));
  expect(state.push).not.toHaveBeenCalled();
  state.shown = true;
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS));
  expect(state.push).toHaveBeenCalledOnce();
  state.shown = false;
  await render();
  state.shown = true;
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS));
  expect(state.push).toHaveBeenCalledOnce();
});

it('waits for a dismissed sign-in sheet to unmount before prompting', async () => {
  const release = sheetClosing();
  state.shown = true;
  await render();
  await act(async () => vi.advanceTimersByTime(PROFILE_SETUP_SETTLE_MS * 2));
  expect(state.push).not.toHaveBeenCalled();
  await act(async () => release());
  expect(state.push).toHaveBeenCalledExactlyOnceWith('/settings/profile-setup');
});
