import { expect, it, vi } from 'vitest';
import { accountHostAdded, pairAccountSelection } from '../src/host/account-pairing';
import type { ConnectHost } from '../src/host/connect-account';
import type { SavedHost } from '../src/host/hosts';
import type { PairingFailure } from '../src/host/pairing';
const a: ConnectHost = {
  id: 'ha',
  name: 'Same name',
  hostname: 'ha.deepseekbot.dev',
  online: true,
};
const b: ConnectHost = { ...a, id: 'hb', hostname: 'hb.deepseekbot.dev' };
it('identifies added computers by exact saved origin, never name or hostname substring', () => {
  const saved: SavedHost = {
    hostId: 'actual-a',
    hostName: a.name,
    routes: ['https://ha.deepseekbot.dev/'],
    deviceId: 'd',
    credential: 'fixture',
  };
  expect(accountHostAdded(a, [saved])).toBe(true);
  expect(accountHostAdded(b, [saved])).toBe(false);
  expect(
    accountHostAdded(a, [
      { ...saved, routes: ['https://ha.deepseekbot.dev.evil.invalid', 'invalid'] },
    ]),
  ).toBe(false);
});
it('waits for each full pairing before starting the next and deduplicates selection', async () => {
  let finish!: () => void;
  const wait = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const pair = vi.fn(async (host: ConnectHost) => {
    if (host.id === a.id) await wait;
    return undefined;
  });
  const result = vi.fn();
  const done = pairAccountSelection({
    hosts: [a, a, b],
    signal: new AbortController().signal,
    pair,
    result,
  });
  expect(pair).toHaveBeenCalledTimes(1);
  finish();
  await done;
  expect(pair.mock.calls.map(([host]) => host.id)).toEqual(['ha', 'hb']);
  expect(result.mock.calls.map(([, value]) => value)).toEqual(['added', 'added']);
});
it('preserves success and continues a refused connection without attempting offline hosts', async () => {
  const pair = vi.fn(async (host: ConnectHost): Promise<PairingFailure | undefined> =>
    host.id === a.id ? 'unreachable' : undefined,
  );
  const result = vi.fn();
  await pairAccountSelection({
    hosts: [a, { ...a, id: 'off', online: false }, b],
    signal: new AbortController().signal,
    pair,
    result,
  });
  expect(pair).toHaveBeenCalledTimes(2);
  expect(result.mock.calls.map(([, value]) => value)).toEqual([
    'unreachable',
    'host-offline',
    'added',
  ]);
});
it.each(['cancelled', 'host-key-confirmation-required'] as const)(
  'stops the queue after %s',
  async (reason) => {
    const pair = vi.fn(async () => reason),
      result = vi.fn();
    await pairAccountSelection({
      hosts: [a, b],
      signal: new AbortController().signal,
      pair,
      result,
    });
    expect(pair).toHaveBeenCalledTimes(1);
    expect(result).toHaveBeenCalledWith(a, reason);
  },
);
it('does not start another computer or report stale success after screen dismissal', async () => {
  const controller = new AbortController(),
    result = vi.fn();
  const pair = vi.fn(async () => {
    controller.abort();
    return undefined;
  });
  await pairAccountSelection({ hosts: [a, b], signal: controller.signal, pair, result });
  expect(pair).toHaveBeenCalledTimes(1);
  expect(result).not.toHaveBeenCalled();
});
