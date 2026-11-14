import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import { fetchMessageResource } from '../src/client/message-host.js';
afterEach(() => vi.restoreAllMocks());
it.each([false, true])(
  'uses the encrypted source resource without direct-fetch fallback (failure=%s)',
  async (failure) => {
    const client = createHostClient({
      routes: ['https://source.example.ts.net'],
      credential: 'test-device.test-secret',
      carrier: {
        async request() {
          throw new Error('not used');
        },
        openSocket() {
          throw new Error('not used');
        },
      },
    });
    const host = { client, current: () => true };
    const read = vi.fn(async () => {
      if (failure) throw new Error('channel-authentication-failed');
      return { bytes: new TextEncoder().encode('encrypted attachment'), mime: 'text/plain' };
    });
    vi.spyOn(host.client, 'resource').mockReturnValue({ uri: '', headers: {}, read });
    const direct = vi.spyOn(globalThis, 'fetch');
    const signal = new AbortController().signal;
    const result = fetchMessageResource('/api/botharness/attachment', signal, host);
    if (failure) await expect(result).rejects.toThrow('channel-authentication-failed');
    else expect(await (await result).text()).toBe('encrypted attachment');
    expect(read).toHaveBeenCalledWith(signal);
    expect(direct).not.toHaveBeenCalled();
  },
);
