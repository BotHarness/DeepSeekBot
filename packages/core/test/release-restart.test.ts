import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { createProcessRestarter, relaunchArguments } from '../src/release/restart.js';

function fakeHost(argv: string[]) {
  const events = new EventEmitter();
  const host = {
    argv,
    execArgv: ['--enable-source-maps'],
    execPath: '/usr/bin/node',
    env: { DSH_HOME: '/home/dsh' },
    cwd: () => '/work',
    exitCode: undefined as number | string | null | undefined,
    once: (event: string, listener: () => void) => events.once(event, listener),
    prependListener: (event: string, listener: () => void) =>
      events.prependListener(event, listener),
  };
  return { host, events };
}

function fakeTimers() {
  const pending: { callback: () => void; ms: number }[] = [];
  return {
    pending,
    setTimer: (callback: () => void, ms: number) => {
      pending.push({ callback, ms });
      return { unref: () => undefined };
    },
    run(ms: number) {
      for (const timer of pending.filter((entry) => entry.ms === ms)) timer.callback();
    },
  };
}

describe('process restarter', () => {
  it('relaunches dsh web without opening a second browser tab', () => {
    expect(relaunchArguments(['node', '/dsh/bin.js', 'web', '--port', '4310'])).toEqual([
      '/dsh/bin.js',
      'web',
      '--port',
      '4310',
      '--no-open',
    ]);
    expect(relaunchArguments(['node', '/dsh/bin.js', 'web', '--no-open'])).toEqual([
      '/dsh/bin.js',
      'web',
      '--no-open',
    ]);
    expect(relaunchArguments(['node', '/dsh/bin.js', 'acp'])).toEqual(['/dsh/bin.js', 'acp']);
  });

  it('stops the application, then starts the same command once the process drains', () => {
    const { host, events } = fakeHost(['node', '/dsh/bin.js', 'web', '--port', '4310']);
    const timers = fakeTimers();
    const child = Object.assign(new EventEmitter(), { kill: vi.fn() });
    const spawn = vi.fn(() => child as never);
    const exit = vi.fn();
    const restarter = createProcessRestarter({ exit, host, spawn, setTimer: timers.setTimer });

    void restarter.restart(() => undefined);
    void restarter.restart(() => undefined);
    expect(exit).not.toHaveBeenCalled();
    timers.run(300);
    expect(exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(spawn).not.toHaveBeenCalled();

    events.emit('beforeExit');
    events.emit('exit');
    timers.run(8_000);
    expect(spawn).toHaveBeenCalledExactlyOnceWith(
      '/usr/bin/node',
      ['--enable-source-maps', '/dsh/bin.js', 'web', '--port', '4310', '--no-open'],
      { cwd: '/work', env: { DSH_HOME: '/home/dsh' }, stdio: 'inherit' },
    );

    events.emit('SIGTERM');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit', 0, null);
    expect(host.exitCode).toBe(0);
  });

  it('still relaunches when lingering handles keep the old process alive', () => {
    const { host } = fakeHost(['node', '/dsh/bin.js', 'web']);
    const timers = fakeTimers();
    const spawn = vi.fn(() => Object.assign(new EventEmitter(), { kill: vi.fn() }) as never);
    void createProcessRestarter({ exit: vi.fn(), host, spawn, setTimer: timers.setTimer }).restart(
      () => undefined,
    );
    timers.run(300);
    timers.run(8_000);
    expect(spawn).toHaveBeenCalledTimes(1);
  });
});
