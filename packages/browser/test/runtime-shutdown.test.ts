import { spawn } from 'node:child_process';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createBotBrowserRuntime } from '../src/runtime/browser.js';
import { fakeChild, fakeClient } from './support/runtime.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

const spawnMock = vi.mocked(spawn);

beforeEach(() => {
  spawnMock.mockReset();
});

describe('local process shutdown ownership', () => {
  async function runningChild() {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const events: string[] = [];
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-shutdown-test',
      browserPath: '/test/chrome',
      fileExists: () => true,
      connect: async () => fakeClient(),
      onEvent: (event) => events.push(event),
    });
    const ready = runtime.ensure();
    child.ready();
    await ready;
    return { child, runtime, events };
  }

  it('does not release the profile when exit precedes inherited stdio closure', async () => {
    const { child, runtime, events } = await runningChild();
    child.proc.kill.mockImplementation(() => {
      child.proc.exitCode = 0;
      child.proc.emit('exit', 0);
      return true;
    });
    let settled = false;
    const stopped = runtime.stop().then(() => {
      settled = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(events).not.toContain('stopped');
    child.proc.emit('close', 0);
    await stopped;
    expect(events).toContain('stopped');
  });

  it('does not equate sending SIGKILL with confirmed process closure', async () => {
    vi.useFakeTimers();
    try {
      const { child, runtime, events } = await runningChild();
      child.proc.kill.mockImplementation(() => true);
      let settled = false;
      const stopped = runtime.stop().then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(4000);
      expect(child.proc.kill).toHaveBeenCalledWith('SIGKILL');
      expect(settled).toBe(false);
      expect(events).not.toContain('stopped');
      child.proc.emit('close', null, 'SIGKILL');
      await stopped;
      expect(events).toContain('stopped');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retains an unconfirmed child after the bounded shutdown deadline', async () => {
    vi.useFakeTimers();
    try {
      const { child, runtime, events } = await runningChild();
      child.proc.kill.mockImplementation(() => true);
      const stopped = runtime.stop().then(
        () => undefined,
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(6000);
      expect(await stopped).toMatchObject({
        message: 'Browser process did not close after shutdown',
      });
      expect(events).not.toContain('stopped');
      expect(events).toContain('phase=stop outcome=error reason=process-close-unconfirmed');
      child.proc.emit('close', null, 'SIGKILL');
      await runtime.stop();
      expect(events).toContain('stopped');
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for a failed connection child to close before launching its replacement', async () => {
    const first = fakeChild();
    const retry = fakeChild();
    first.proc.kill.mockImplementation(() => true);
    spawnMock.mockReturnValueOnce(first.proc as never).mockImplementationOnce(() => {
      queueMicrotask(() => retry.ready());
      return retry.proc as never;
    });
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-shutdown-test',
      browserPath: '/test/chrome',
      fileExists: () => true,
      connect: vi
        .fn()
        .mockRejectedValueOnce(new Error('Connection unavailable'))
        .mockResolvedValueOnce(fakeClient()),
    });
    const failed = expect(runtime.ensure()).rejects.toThrow('Connection unavailable');
    first.ready();
    await failed;
    const pending = runtime.ensure();
    await Promise.resolve();
    await Promise.resolve();
    expect(spawnMock).toHaveBeenCalledTimes(1);
    first.proc.emit('close', 0);
    await pending;
    expect(spawnMock).toHaveBeenCalledTimes(2);
    await runtime.stop();
  });
});

describe('Container profile shutdown', () => {
  it('requests graceful Chrome close before releasing transport and owned execution even after a close error', async () => {
    const order: string[] = [];
    let active = false;
    const runtime = createBotBrowserRuntime({
      userDataDir: '/qa/container',
      execution: {
        start: async () => {
          active = true;
          return { endpoint: 'ws://127.0.0.1:1/owned', binary: 'pinned-image' };
        },
        isRunning: () => active,
        stop: async () => {
          order.push('container-stop');
          active = false;
        },
      },
      connect: async () => ({
        send: async (method) => {
          order.push(method);
          throw new Error('already disconnected');
        },
        close: () => {
          order.push('transport-close');
        },
        subscribe: () => () => undefined,
      }),
    });
    await runtime.ensure();
    await runtime.stop();
    expect(order).toEqual(['Browser.close', 'transport-close', 'container-stop']);
    expect(runtime.isRunning()).toBe(false);
  });
  it('still releases owned execution after a debugger that never acknowledges close', async () => {
    vi.useFakeTimers();
    const stopExecution = vi.fn(async () => undefined);
    const close = vi.fn();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/qa/container',
      execution: {
        start: async () => ({ endpoint: 'ws://127.0.0.1:1/owned', binary: 'pinned-image' }),
        isRunning: () => true,
        stop: stopExecution,
      },
      connect: async () => ({
        send: () => new Promise(() => undefined),
        close,
        subscribe: () => () => undefined,
      }),
    });
    try {
      await runtime.ensure();
      const stopped = runtime.stop();
      await vi.advanceTimersByTimeAsync(1_999);
      expect(stopExecution).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await stopped;
      expect(close).toHaveBeenCalledOnce();
      expect(stopExecution).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});
