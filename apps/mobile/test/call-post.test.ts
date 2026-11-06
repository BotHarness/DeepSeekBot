import { afterEach, expect, it, vi } from 'vitest';
import { createCallPost } from '../src/host/call-post';
import { createHostClient, type HostClient } from '../src/host/client';
import type { HostResponse } from '../src/host/carrier';

let client: HostClient | undefined;
afterEach(() => {
  client?.stop();
  vi.useRealTimers();
});

function delayedHost(delay: number) {
  vi.useFakeTimers();
  client = createHostClient({
    credential: 'synthetic',
    routes: ['https://studio.tailnet-example.ts.net'],
    carrier: {
      openSocket: vi.fn(),
      request: (_url, { signal }) =>
        new Promise<HostResponse>((resolve, reject) => {
          const abort = () => {
            clearTimeout(timer);
            reject(new Error('cancelled'));
          };
          const timer = setTimeout(() => {
            signal.removeEventListener('abort', abort);
            resolve({ status: 200, text: async () => JSON.stringify({ ok: true }) });
          }, delay);
          signal.addEventListener('abort', abort, { once: true });
        }),
    },
  });
  return createCallPost(client);
}

it('allows connection recovery plus media startup before an open reply', async () => {
  const post = delayedHost(12_000);
  const result = post({ kind: 'open', slug: 'mira', media: 'webrtc' }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(12_000);
  expect(await result).toEqual({ ok: true });
});

it('still bounds a call that never finishes opening', async () => {
  const post = delayedHost(30_000);
  let settled = false;
  const result = post({ kind: 'open', slug: 'mira', media: 'webrtc' })
    .catch((error) => error)
    .finally(() => {
      settled = true;
    });
  await vi.advanceTimersByTimeAsync(19_999);
  expect(settled).toBe(false);
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toMatchObject({ message: 'The Host did not answer in time.' });
});

it('keeps the ordinary command deadline for readiness', async () => {
  const post = delayedHost(12_000);
  const result = post({ kind: 'readiness', slug: 'mira' }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(await result).toMatchObject({ message: 'The Host did not answer in time.' });
});
