// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/keyboard-form', async () => ({
  KeyboardFormScroll: (await import('./react-native-shim')).ScrollView,
}));
const native = vi.hoisted(() => ({ pick: vi.fn(), scan: vi.fn() }));
vi.mock('expo-camera', () => ({
  Camera: { scanFromURLAsync: native.scan },
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: false }, vi.fn()],
}));
vi.mock('expo-image-picker', () => ({ launchImageLibraryAsync: native.pick }));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (focus: () => (() => void)) => useEffect(focus, [focus]),
}));
const pairing = vi.hoisted(() => ({
  busy: false,
  error: undefined,
  method: 'qr',
  canRetry: false,
  connectionName: '',
  setConnectionName: vi.fn(),
  pair: vi.fn(),
  abort: vi.fn(),
  forget: vi.fn(),
}));
vi.mock('../src/ui/shell/use-pairing', () => ({ usePairing: () => pairing }));
vi.mock('../src/ui/shell/pairing-verification', () => ({ PairingVerification: () => null }));

import PairScreen from '../app/pair/tailscale';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  native.pick.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///qr.png' }] });
  native.scan.mockResolvedValue([{ data: 'deepseekbot://pair?p=example' }]);
  pairing.pair.mockResolvedValue(undefined);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  host.remove();
  vi.resetAllMocks();
});

async function choose() {
  await act(async () => root!.render(<PairScreen />));
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="pair-choose-image"]')!.click());
}

it('pairs from a local QR image without camera permission', async () => {
  await choose();
  expect(native.scan).toHaveBeenCalledWith('file:///qr.png', ['qr']);
  expect(pairing.pair).toHaveBeenCalledExactlyOnceWith('deepseekbot://pair?p=example', 'qr');
  expect(host.textContent).toContain(t.allowCamera);
});

it('cancels the picker without starting pairing or showing an error', async () => {
  native.pick.mockResolvedValue({ canceled: true, assets: null });
  await choose();
  expect(native.scan).not.toHaveBeenCalled();
  expect(pairing.pair).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it.each([
  [[], 'no-code'],
  [[{ data: 'one' }, { data: 'two' }], 'multiple-codes'],
] as const)('explains unusable image contents and allows another choice (%s)', async (codes, error) => {
  native.scan.mockResolvedValue(codes);
  await choose();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(t.pairImage[error]);
  expect(pairing.pair).not.toHaveBeenCalled();
  native.scan.mockResolvedValue([{ data: 'deepseekbot://pair?p=retry' }]);
  await act(async () => host.querySelector<HTMLButtonElement>('[data-testid="pair-choose-image"]')!.click());
  expect(pairing.pair).toHaveBeenCalledExactlyOnceWith('deepseekbot://pair?p=retry', 'qr');
});

it('deduplicates repeated detections of the same code', async () => {
  native.scan.mockResolvedValue([{ data: ' same ' }, { data: 'same' }]);
  await choose();
  expect(pairing.pair).toHaveBeenCalledExactlyOnceWith('same', 'qr');
});

it.each(['pick', 'scan'] as const)('shows a recoverable native %s failure', async (operation) => {
  native[operation].mockRejectedValue(new Error('native error'));
  await choose();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe(t.pairImage['read-failed']);
  expect(pairing.pair).not.toHaveBeenCalled();
});

it('ignores another tap while reading and ignores the result after leaving', async () => {
  let finish!: (codes: { data: string }[]) => void;
  native.scan.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await choose();
  const button = host.querySelector<HTMLButtonElement>('[data-testid="pair-choose-image"]')!;
  expect(button.disabled).toBe(true);
  await act(async () => button.click());
  expect(native.pick).toHaveBeenCalledTimes(1);
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => finish([{ data: 'deepseekbot://pair?p=late' }]));
  expect(pairing.pair).not.toHaveBeenCalled();
  expect(pairing.abort).toHaveBeenCalled();
});

it('does not decode a picker result returned after leaving', async () => {
  let finish!: (value: unknown) => void;
  native.pick.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  await choose();
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => finish({ canceled: false, assets: [{ uri: 'file:///late.png' }] }));
  expect(native.scan).not.toHaveBeenCalled();
  expect(pairing.pair).not.toHaveBeenCalled();
});
