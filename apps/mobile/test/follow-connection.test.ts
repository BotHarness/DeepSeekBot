import { expect, it, vi } from 'vitest';
import type { HostClient } from '@botharness/host-client/client';
import { followConnection } from '../src/host/follow-connection';

const fakeClient = () => {
  const listeners = new Set<() => void>();
  let status = 'connecting';
  const client = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => ({ connection: { status } }),
  } as unknown as HostClient;
  const report = (next: string) => {
    status = next;
    for (const listener of listeners) listener();
  };
  return { client, report, listeners };
};

it('retries a load that fails after the Host reported connected while it was pending', async () => {
  const { client, report, listeners } = fakeClient();
  let reject: (error: Error) => void = () => undefined;
  const run = vi
    .fn<() => Promise<unknown>>()
    .mockImplementationOnce(() => new Promise((_, no) => (reject = no)))
    .mockResolvedValue(undefined);
  const unfollow = followConnection(client, run);
  expect(run).toHaveBeenCalledTimes(1);
  report('connected');
  expect(run).toHaveBeenCalledTimes(1);
  reject(new Error('offline'));
  await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  await Promise.resolve();
  report('connected');
  expect(run).toHaveBeenCalledTimes(2);
  unfollow();
  expect(listeners.size).toBe(0);
});

it('waits for the next connected report after a failure with none pending', async () => {
  const { client, report } = fakeClient();
  const run = vi
    .fn<() => Promise<unknown>>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(undefined);
  followConnection(client, run);
  await Promise.resolve();
  await Promise.resolve();
  expect(run).toHaveBeenCalledTimes(1);
  report('connecting');
  expect(run).toHaveBeenCalledTimes(1);
  report('connected');
  expect(run).toHaveBeenCalledTimes(2);
});
