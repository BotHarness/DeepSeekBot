import { expect, it, vi } from 'vitest';
import { spawn } from 'node:child_process';
import { createTailnetNotificationReader, watchTailnet } from '../src/devices/bot-tailnet-watch.js';

it.each(['immediate', 'after-error'] as const)(
  'never signals a subprocess that failed to start when disposed %s',
  async (timing) => {
    const child = spawn(`${process.execPath}.botharness-missing`, [], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const kill = vi.spyOn(child, 'kill').mockReturnValue(false);
    const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
    const stopped = vi.fn();
    const stop = watchTailnet(
      () => {},
      stopped,
      () => child,
    );
    try {
      if (timing === 'after-error') await closed;
      await stop();
      await closed;
      expect(kill).not.toHaveBeenCalled();
      if (timing === 'after-error')
        expect(stopped).toHaveBeenCalledWith('tailnet-watch-unavailable');
      else expect(stopped).not.toHaveBeenCalled();
    } finally {
      kill.mockRestore();
    }
  },
);

it('does not finish disposal until its owned subprocess has exited', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  let exited = false;
  child.once('close', () => {
    exited = true;
  });
  const stop = watchTailnet(
    () => {},
    () => {},
    () => child,
  );
  try {
    await stop();
    expect(exited).toBe(true);
    await stop();
  } finally {
    if (!exited) {
      const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
      child.kill();
      await closed;
    }
  }
});

it('retains a removal followed by re-addition in the same native stream chunk', () => {
  const changes: unknown[] = [];
  const reader = createTailnetNotificationReader((change) => changes.push(change));
  const first = JSON.stringify(
    {
      InitialStatus: {
        Self: { ID: 'self-stable', NodeID: 1 },
        Peer: { key: { ID: 'peer-stable', NodeID: 2, Online: true } },
      },
    },
    null,
    2,
  );
  reader(first.slice(0, 37));
  reader(first.slice(37));
  reader('{"PeersRemoved":[2]}\n{"PeersChanged":[{"ID":2,"StableID":"peer-stable"}]}');
  expect(changes).toEqual([
    { removedNodeIds: [], selfNodeId: 'self-stable' },
    { removedNodeIds: ['peer-stable'] },
  ]);
});

it('distinguishes offline patches and stopped service from membership withdrawal', () => {
  const changes: unknown[] = [];
  const reader = createTailnetNotificationReader((change) => changes.push(change));
  reader(JSON.stringify({ PeersChanged: [{ ID: 2, StableID: 'peer-stable', Online: false }] }));
  reader('{"State":4,"PeerChangedPatch":[{"NodeID":2,"Online":false}]}');
  expect(changes).toEqual([]);
  reader('{"State":2}');
  expect(changes).toEqual([{ removedNodeIds: [], selfNodeId: null }]);
  reader('{"InitialStatus":{"BackendState":"NeedsLogin"}}');
  expect(changes).toHaveLength(2);
  expect(changes[1]).toEqual({ removedNodeIds: [], selfNodeId: null });
});

it('handles escaped braces and emits only bounded identity facts', () => {
  const changes: unknown[] = [];
  const reader = createTailnetNotificationReader((change) => changes.push(change));
  reader(
    JSON.stringify({
      SelfChange: { StableID: 'new-self', Name: 'private } " name' },
      Prefs: { PrivateKey: 'not emitted' },
    }),
  );
  expect(changes).toEqual([{ removedNodeIds: [], selfNodeId: 'new-self' }]);
  expect(() => reader('not json')).toThrow('tailnet-watch-invalid');
});

it('rejects an oversized native notification before retaining more data', () => {
  const reader = createTailnetNotificationReader(() => {});
  expect(() => reader('{"oversized":"' + 'x'.repeat(2 * 1024 * 1024))).toThrow(
    'tailnet-watch-limit',
  );
});
