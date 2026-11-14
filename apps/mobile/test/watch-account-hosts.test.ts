import { expect, it, vi } from 'vitest';
import { watchAccountHosts } from '../src/host/watch-account-hosts';
import type { ConnectHost } from '../src/host/connect-account';

const first: ConnectHost = {
  id: 'first',
  hostname: 'first.deepseekbot.dev',
  name: 'First',
  online: false,
};
const second: ConnectHost = {
  id: 'second',
  hostname: 'second.deepseekbot.dev',
  name: 'Second',
  online: true,
};
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

it('refreshes an unpaired workspace directory on foreground and keeps usable cached entries during a failed refresh', async () => {
  let refresh = () => {};
  const update = vi.fn();
  const hosts = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, value: [first] })
    .mockResolvedValueOnce({ ok: true, value: [second] })
    .mockResolvedValueOnce({ ok: false, code: 'relay-unavailable' });
  const remove = vi.fn();
  const failed = vi.fn();
  const watcher = watchAccountHosts({
    account: { actionKey: async () => 'owner', hosts },
    update,
    failed,
    onResume: (callback) => {
      refresh = callback;
      return remove;
    },
  });
  await settle();
  expect(update).toHaveBeenLastCalledWith([first]);
  refresh();
  await settle();
  expect(update).toHaveBeenLastCalledWith([second]);
  refresh();
  await settle();
  expect(update).toHaveBeenLastCalledWith([second]);
  expect(failed).toHaveBeenLastCalledWith(
    expect.objectContaining({ code: 'relay-unavailable', phase: 'environment-list' }),
  );
  watcher.close();
  refresh();
  await settle();
  expect(hosts).toHaveBeenCalledTimes(3);
  expect(remove).toHaveBeenCalledOnce();
});

it('drops a directory response from a different or signed-out account', async () => {
  let refresh = () => {};
  let owner: string | null = 'first-owner';
  let complete: (value: { ok: true; value: ConnectHost[] }) => void = () => {};
  const update = vi.fn();
  const watcher = watchAccountHosts({
    account: {
      actionKey: async () => owner,
      hosts: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
    update,
    failed: vi.fn(),
    onResume: (callback) => {
      refresh = callback;
      return () => {};
    },
  });
  await settle();
  owner = null;
  complete({ ok: true, value: [first] });
  await settle();
  expect(update).not.toHaveBeenCalledWith([first]);
  expect(update).toHaveBeenLastCalledWith([]);
  refresh();
  await settle();
  watcher.close();
});

it('coalesces foreground bursts and ignores responses after the workspace closes', async () => {
  let refresh = () => {};
  let complete: (value: { ok: true; value: ConnectHost[] }) => void = () => {};
  const update = vi.fn();
  const hosts = vi.fn(
    () =>
      new Promise<{ ok: true; value: ConnectHost[] }>((resolve) => {
        complete = resolve;
      }),
  );
  const watcher = watchAccountHosts({
    account: { actionKey: async () => 'owner', hosts },
    update,
    failed: vi.fn(),
    onResume: (callback) => {
      refresh = callback;
      return () => {};
    },
  });
  await settle();
  for (let i = 0; i < 20; i++) refresh();
  complete({ ok: true, value: [first] });
  await settle();
  expect(hosts).toHaveBeenCalledTimes(2);
  watcher.close();
  complete({ ok: true, value: [second] });
  await settle();
  expect(update).not.toHaveBeenCalledWith([second]);
});

it('clears unverified account data and publishes a bounded diagnostic when credential ownership cannot be read', async () => {
  let refresh = () => {};
  let unavailable = false;
  const update = vi.fn();
  const failed = vi.fn();
  const watcher = watchAccountHosts({
    account: {
      actionKey: async () => {
        if (unavailable) throw new Error('private keychain detail');
        return 'owner';
      },
      hosts: async () => ({ ok: true, value: [first] }),
    },
    update,
    failed,
    onResume: (callback) => {
      refresh = callback;
      return () => {};
    },
  });
  await settle();
  expect(update).toHaveBeenLastCalledWith([first]);
  unavailable = true;
  refresh();
  await settle();
  expect(update).toHaveBeenLastCalledWith([]);
  expect(failed).toHaveBeenLastCalledWith(
    expect.objectContaining({
      code: 'storage-failure',
      phase: 'account',
      detail: 'app:storage-keychain',
    }),
  );
  expect(JSON.stringify(failed.mock.calls)).not.toContain('private keychain detail');
  watcher.close();
});
