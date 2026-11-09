import { describe, expect, it, vi } from 'vitest';

import { createUpdateRuns, isUpdateRequestId } from '../src/release/update-runs.js';

const TARGET = { kind: 'plugin' as const, name: '@botharness/vrm-companion', version: '0.2.0' };
const ID = 'req-00000001';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('update runs', () => {
  it('folds the Plugin Manager log and phases of its own request into a bounded run', async () => {
    const runs = createUpdateRuns({ now: () => 0 });
    const gate = deferred<{ status: 'installed'; applied: boolean }>();
    const done = runs.run(TARGET, { requestId: ID, joinable: false }, (handle) => {
      handle.installing();
      return gate.promise;
    })!;
    await Promise.resolve();
    expect(runs.get(ID)).toMatchObject({ id: ID, phase: 'installing', commands: [] });
    runs.state({
      requestId: ID,
      phase: 'installing',
      attempt: { registry: 'https://registry.npmmirror.com/', index: 2, total: 2 },
    });
    runs.log({ requestId: 'someone-else', jobId: 'x', argv: ['pnpm'], text: 'ignored' });
    runs.log({
      requestId: ID,
      jobId: 'job-1',
      argv: ['pnpm', 'add', '@botharness/vrm-companion@0.2.0'],
      cwd: '/profile',
      stream: 'stdout',
      text: '\u001b[32mProgress\u001b[39m: resolved 10\n',
    });
    runs.log({ requestId: ID, jobId: 'job-1', argv: [], stream: 'stdout', text: '', exitCode: 0 });
    runs.state({ requestId: ID, phase: 'applying' });
    expect(runs.get()).toMatchObject({
      phase: 'applying',
      cancellable: false,
      attempt: { index: 2, total: 2 },
      commands: [
        {
          id: 'job-1',
          command: 'pnpm add @botharness/vrm-companion@0.2.0',
          output: 'Progress: resolved 10\n',
          exitCode: 0,
        },
      ],
    });
    gate.resolve({ status: 'installed', applied: true });
    await done;
    expect(runs.get(ID)).toMatchObject({ phase: 'installed', installed: { applied: true } });
    expect(runs.get(ID)?.attempt).toBeUndefined();
  });

  it('keeps only the tail of long output', async () => {
    const runs = createUpdateRuns();
    const gate = deferred<{ status: 'installed'; applied: boolean }>();
    runs.run(TARGET, { requestId: ID, joinable: false }, () => gate.promise);
    runs.log({ requestId: ID, jobId: 'j', argv: ['pnpm'], text: 'a'.repeat(40_000) + 'END' });
    const command = runs.get(ID)!.commands[0]!;
    expect(command.truncated).toBe(true);
    expect(command.output.length).toBe(32_000);
    expect(command.output.endsWith('END')).toBe(true);
    gate.resolve({ status: 'installed', applied: false });
  });

  it('stops a run before pnpm starts without asking the Plugin Manager', async () => {
    const cancelInstall = vi.fn();
    const runs = createUpdateRuns({ canceller: () => ({ cancelInstall }) });
    const check = deferred<void>();
    const done = runs.run(TARGET, { requestId: ID, joinable: false }, async (handle) => {
      await check.promise;
      if (handle.cancelled) return { status: 'failed' as const, reason: 'cancelled' };
      handle.installing();
      return { status: 'installed' as const, applied: false };
    })!;
    expect(await runs.cancel(ID)).toEqual({ status: 'cancelling' });
    expect(runs.get(ID)?.phase).toBe('cancelling');
    check.resolve();
    expect(await done).toEqual({ status: 'failed', reason: 'cancelled' });
    expect(runs.get(ID)).toMatchObject({ phase: 'cancelled', failure: { reason: 'cancelled' } });
    expect(cancelInstall).not.toHaveBeenCalled();
    expect(await runs.cancel(ID)).toEqual({ status: 'not-running' });
  });

  it('asks the Plugin Manager to stop a running install', async () => {
    const install = deferred<{ status: 'failed'; reason: string }>();
    const cancelInstall = vi.fn(async (requestId: string) => {
      expect(requestId).toBe(ID);
      install.resolve({ status: 'failed', reason: 'cancelled' });
      return { status: 'cancelled' };
    });
    const runs = createUpdateRuns({ canceller: () => ({ cancelInstall }) });
    const done = runs.run(TARGET, { requestId: ID, joinable: false }, (handle) => {
      handle.installing();
      return install.promise;
    })!;
    await Promise.resolve();
    expect(await runs.cancel(ID)).toEqual({ status: 'cancelled' });
    await done;
    expect(runs.get(ID)?.phase).toBe('cancelled');
  });

  it('reports a run that is already applying, or a DSH without cancellation', async () => {
    const gate = deferred<{ status: 'installed'; applied: boolean }>();
    const runs = createUpdateRuns({
      canceller: () => ({ cancelInstall: async () => ({ status: 'too-late' }) }),
    });
    runs.run(TARGET, { requestId: ID, joinable: false }, (handle) => {
      handle.installing();
      return gate.promise;
    });
    await Promise.resolve();
    expect(await runs.cancel(ID)).toEqual({ status: 'too-late' });
    expect(runs.get(ID)).toMatchObject({ phase: 'applying', cancellable: false });
    gate.resolve({ status: 'installed', applied: true });

    const plain = createUpdateRuns({ canceller: () => ({}) });
    const other = deferred<{ status: 'installed'; applied: boolean }>();
    plain.run(TARGET, { requestId: ID, joinable: false }, (handle) => {
      handle.installing();
      return other.promise;
    });
    await Promise.resolve();
    expect(await plain.cancel(ID)).toEqual({ status: 'unsupported' });
    other.resolve({ status: 'installed', applied: false });
  });

  it('joins a repeated request for the same target and refuses any other', async () => {
    const runs = createUpdateRuns();
    const gate = deferred<{ status: 'installed'; applied: boolean }>();
    const work = vi.fn(() => gate.promise);
    const first = runs.run(TARGET, { requestId: ID, joinable: true }, work)!;
    const second = runs.run(TARGET, { requestId: 'req-00000002', joinable: true }, work)!;
    expect(runs.run(TARGET, { joinable: false }, work)).toBeUndefined();
    expect(runs.run({ ...TARGET, version: '0.3.0' }, { joinable: true }, work)).toBeUndefined();
    expect(runs.get('req-00000002')?.id).toBe(ID);
    gate.resolve({ status: 'installed', applied: false });
    expect(await second).toEqual(await first);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it('accepts only plain request ids', () => {
    expect(isUpdateRequestId('0b5c1c7e-7d1a-4a43-9d8a-2a1f5c3a9e10')).toBe(true);
    expect(isUpdateRequestId('short')).toBe(false);
    expect(isUpdateRequestId('../../etc/passwd')).toBe(false);
    expect(isUpdateRequestId(42)).toBe(false);
  });
});
