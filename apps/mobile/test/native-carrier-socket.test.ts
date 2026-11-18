import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('expo-crypto', () => ({ getRandomBytes: (size: number) => new Uint8Array(size) }));
vi.mock('../src/host/native-lan-socket', () => ({
  localNetworkStatus: async () => 'granted',
  openLanSocket: () => {
    throw new Error('lan');
  },
}));
vi.mock('../src/host/app-version', () => ({ installedAppVersion: () => undefined }));

const { nativeCarrier } = await import('../src/host/native-carrier');

const constructed: unknown[][] = [];
class FakeSocket {
  bufferedAmount = 0;
  constructor(...args: unknown[]) {
    constructed.push(args);
  }
  send() {}
  close() {}
}

afterEach(() => {
  constructed.length = 0;
  vi.unstubAllGlobals();
});

const events = { open: () => {}, message: () => {}, closed: () => {} };

describe('native carrier sockets', () => {
  it('opens a socket with only its URL when there are no headers, as browsers require', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    nativeCarrier().openSocket!('ws://127.0.0.1:4000/botharness-device/channel', events);
    expect(constructed).toEqual([['ws://127.0.0.1:4000/botharness-device/channel']]);
  });

  it('passes headers to the native socket when there are some', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    nativeCarrier().openSocket!('wss://host.example/botharness-device/channel', events, {
      authorization: 'Device x',
    });
    expect(constructed).toEqual([
      [
        'wss://host.example/botharness-device/channel',
        undefined,
        { headers: { authorization: 'Device x' } },
      ],
    ]);
  });
});
