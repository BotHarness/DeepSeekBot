import { expect, it, vi } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createTailnetNotificationReader,
  spawnOwnedProcess,
  watchTailnet,
} from '../src/devices/bot-tailnet-watch.js';
import { createTempRoot } from './helpers.js';

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    const state = execFileSync('ps', ['-o', 'stat=', '-p', String(pid)], {
      encoding: 'utf8',
    }).trim();
    return state !== '' && !state.startsWith('Z');
  } catch {
    return false;
  }
}

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

it.skipIf(process.platform === 'win32')(
  'stops a wrapper-launched watcher and the process it started when disposed',
  async () => {
    const pidFile = join(createTempRoot('botharness-tailnet-wrapper-'), 'inner.pid');
    const inner = `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); setInterval(() => {}, 1000);`;
    const wrapper = `"${process.execPath}" -e "${inner.replaceAll('"', '\\"')}"\nexit $?`;
    const stop = watchTailnet(
      () => {},
      () => {},
      () => spawnOwnedProcess('/bin/sh', ['-c', wrapper]),
    );
    let innerPid: number | undefined;
    try {
      await vi.waitFor(
        () => {
          innerPid = Number(readFileSync(pidFile, 'utf8'));
          expect(innerPid).toBeGreaterThan(0);
        },
        { timeout: 5000 },
      );
      await stop();
      await vi.waitFor(() => expect(alive(innerPid!)).toBe(false), { timeout: 5000 });
    } finally {
      if (innerPid !== undefined && alive(innerPid)) process.kill(innerPid, 'SIGKILL');
    }
  },
  10_000,
);

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
