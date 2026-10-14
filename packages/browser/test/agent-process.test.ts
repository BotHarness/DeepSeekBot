import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  version: '0.38.2',
  spawnFails: false,
  packageMissing: false,
  streamEnabled: false,
  backendError: '',
  actions: [] as string[],
  removed: vi.fn(async () => undefined),
  kill: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('node:fs', () => ({ existsSync: (path: string) => !path.endsWith('driver.stream') }));
vi.mock('node:fs/promises', () => ({
  mkdtemp: async () => '/tmp/bh767-private-ipc',
  chmod: async () => undefined,
  readFile: async () => state.version,
  rm: state.removed,
}));
vi.mock('node:child_process', () => ({ spawn: state.spawn }));
vi.mock('node:module', async (original) => {
  const actual = await original<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: (from: string) => {
      const require = actual.createRequire(from);
      return Object.assign((id: string) => require(id), require, {
        resolve: (id: string) => {
          if (state.packageMissing) throw new Error(`Cannot find module '${id}'`);
          return require.resolve(id);
        },
      });
    },
  };
});
vi.mock('node:net', () => ({
  createConnection: () => {
    const socket = new EventEmitter();
    Object.assign(socket, {
      destroy: () => socket.emit('close'),
      write: (line: string) => {
        const { action } = JSON.parse(line) as { action: string };
        state.actions.push(action);
        const data =
          action === 'stream_disable'
            ? { disabled: true }
            : action === 'stream_status'
              ? { enabled: state.streamEnabled }
              : {};
        const response =
          state.backendError === ''
            ? { success: true, data }
            : { success: false, error: state.backendError };
        queueMicrotask(() => socket.emit('data', Buffer.from(JSON.stringify(response) + '\n')));
      },
    });
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  },
}));
import { createAgentBrowserProcess } from '../src/runtime/agent-process.js';

beforeEach(() => {
  vi.clearAllMocks();
  state.version = '0.38.2';
  state.spawnFails = false;
  state.packageMissing = false;
  state.streamEnabled = false;
  state.actions = [];
  state.backendError = '';
  state.spawn.mockImplementation(() => {
    const child = new EventEmitter();
    const proc = Object.assign(child, {
      pid: state.spawnFails ? undefined : 987654,
      exitCode: null,
      signalCode: null as string | null,
      killed: false,
      kill: state.kill.mockImplementation(() => {
        proc.killed = true;
        proc.signalCode = 'SIGTERM';
        queueMicrotask(() => child.emit('exit'));
        return true;
      }),
    });
    if (state.spawnFails)
      queueMicrotask(() => child.emit('error', new Error('synthetic missing binary')));
    return proc;
  });
});

describe('owned candidate process startup boundary', () => {
  it('disables the independent stream before attaching Chrome and excludes inherited credentials', async () => {
    const driver = createAgentBrowserProcess(() => undefined);
    await driver.start('ws://127.0.0.1:1234/owned');
    expect(state.actions).toEqual(['stream_disable', 'launch', 'stream_status']);
    const options = state.spawn.mock.calls[0]![2] as { env: Record<string, string> };
    expect(
      Object.keys(options.env).every((key) =>
        /^(PATH|SystemRoot|WINDIR|ComSpec|TMP|TEMP|TMPDIR|AGENT_BROWSER_)/u.test(key),
      ),
    ).toBe(true);
    expect(options.env['AGENT_BROWSER_CDP']).toBeUndefined();
    await driver.stop();
    expect(driver.isRunning()).toBe(false);
    expect(state.kill).toHaveBeenCalledWith('SIGTERM');
    expect(state.removed).toHaveBeenCalledWith('/tmp/bh767-private-ipc', {
      recursive: true,
      force: true,
    });
  });
  it('cleans up a failed spawn without waiting for an exit event that cannot arrive', async () => {
    state.spawnFails = true;
    const driver = createAgentBrowserProcess(() => undefined);
    await expect(driver.start('ws://127.0.0.1:1234/owned')).rejects.toThrow();
    expect(state.kill).not.toHaveBeenCalled();
    expect(state.removed).toHaveBeenCalled();
  });
  it('explains that the optional agent-browser package must be added before the driver can start', async () => {
    state.packageMissing = true;
    const driver = createAgentBrowserProcess(() => undefined);
    await expect(driver.start('ws://127.0.0.1:1234/owned')).rejects.toThrow(
      'agent-browser 0.38.2 is not installed in this Profile',
    );
    expect(state.spawn).not.toHaveBeenCalled();
    expect(driver.isRunning()).toBe(false);
  });
  it('rejects an unexpected native binary version before any browser command', async () => {
    state.version = '0.0.0';
    const driver = createAgentBrowserProcess(() => undefined);
    await expect(driver.start('ws://127.0.0.1:1234/owned')).rejects.toThrow('pinned driver');
    expect(state.actions).toEqual([]);
    expect(driver.isRunning()).toBe(false);
    expect(state.removed).toHaveBeenCalled();
  });
  it('refuses an independently enabled interaction service and disposes its owned process', async () => {
    state.streamEnabled = true;
    const driver = createAgentBrowserProcess(() => undefined);
    await expect(driver.start('ws://127.0.0.1:1234/owned')).rejects.toThrow('unexpectedly enabled');
    expect(driver.isRunning()).toBe(false);
    expect(state.kill).toHaveBeenCalled();
  });
  it('does not forward page dialog content into Tool or Audit errors', async () => {
    const driver = createAgentBrowserProcess(() => undefined);
    await driver.start('ws://127.0.0.1:1234/owned');
    state.backendError = 'Blocked by dialog: private-page-sentinel';
    await expect(driver.command('click')).rejects.toThrow(
      new Error('agent-browser click failed; observe the page before deciding whether to retry'),
    );
    await driver.stop();
  });
  it('removes a dead owned daemon directory before explicitly starting another', async () => {
    const driver = createAgentBrowserProcess(() => undefined);
    await driver.start('ws://127.0.0.1:1234/owned');
    state.spawn.mock.results[0]!.value.exitCode = 1;
    expect(driver.isRunning()).toBe(false);
    await driver.start('ws://127.0.0.1:1234/owned');
    expect(state.removed).toHaveBeenCalledTimes(1);
    expect(state.spawn).toHaveBeenCalledTimes(2);
    await driver.stop();
  });
});
