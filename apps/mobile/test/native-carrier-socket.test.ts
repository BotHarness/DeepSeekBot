import { afterEach, describe, expect, it, vi } from 'vitest';

import { openWebSocket } from '../src/host/web-socket';

const constructed: unknown[][] = [];
class FakeSocket {
  constructor(...args: unknown[]) {
    constructed.push(args);
  }
}

afterEach(() => {
  constructed.length = 0;
  vi.unstubAllGlobals();
});

describe('phone sockets', () => {
  it('opens a socket with only its URL when there are no headers, as browsers require', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    openWebSocket('ws://127.0.0.1:4000/botharness-device/channel', {});
    expect(constructed).toEqual([['ws://127.0.0.1:4000/botharness-device/channel']]);
  });

  it('passes headers to the native socket when there are some', () => {
    vi.stubGlobal('WebSocket', FakeSocket);
    openWebSocket('wss://host.example/botharness-device/channel', { authorization: 'Device x' });
    expect(constructed).toEqual([
      [
        'wss://host.example/botharness-device/channel',
        undefined,
        { headers: { authorization: 'Device x' } },
      ],
    ]);
  });
});
