import { afterEach, expect, it, vi } from 'vitest';

const expoFetch = vi.hoisted(() => vi.fn<typeof fetch>());

vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('expo-crypto', () => ({ getRandomBytes: () => new Uint8Array(32) }));
vi.mock('expo/fetch', () => ({ fetch: expoFetch }));
vi.mock('../src/host/app-version', () => ({ installedAppVersion: () => undefined }));
vi.mock('../src/host/noise-key-agreement', () => ({ noiseKeyAgreement: undefined }));
vi.mock('../src/host/native-lan-socket', () => ({
  localNetworkStatus: () => 'unknown',
  openLanSocket: vi.fn(),
}));

import { nativeCarrier } from '../src/host/native-carrier';

afterEach(() => {
  expoFetch.mockReset();
  vi.unstubAllGlobals();
});

it('sends strict Host discovery through Expo fetch without redirects or cookies', async () => {
  const globalFetch = vi.fn<typeof fetch>();
  vi.stubGlobal('fetch', globalFetch);
  expoFetch.mockRejectedValueOnce(new Error('redirect refused'));
  const url = 'https://host.example/botharness-device/channel';
  const signal = new AbortController().signal;

  await expect(
    nativeCarrier().request(url, { method: 'GET', redirect: 'error', signal }),
  ).rejects.toThrow('redirect refused');
  expect(expoFetch).toHaveBeenCalledExactlyOnceWith(url, {
    method: 'GET',
    signal,
    credentials: 'omit',
    redirect: 'error',
    headers: {},
  });
  expect(globalFetch).not.toHaveBeenCalled();
});
