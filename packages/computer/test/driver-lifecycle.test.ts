import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createCuaDriver, createMcpCuaDriver } from '../src/tool/driver.js';
import { fail, ok } from './support/docker-provider.js';
import { deferred } from './local-video-owner-fixture.js';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  listTools: vi.fn(async () => ({ tools: [] })),
  callTool: vi.fn(),
  close: vi.fn(async () => undefined),
  created: vi.fn(),
}));
vi.mock('@modelcontextprotocol/client', () => ({
  Client: class {
    constructor() {
      mocks.created();
    }
    connect = mocks.connect;
    listTools = mocks.listTools;
    callTool = mocks.callTool;
    close = mocks.close;
  },
}));
vi.mock('@modelcontextprotocol/client/stdio', () => ({
  StdioClientTransport: class {},
}));

beforeEach(() => vi.clearAllMocks());
function driver(beforeOpen?: () => Promise<void>, retryReadOnly = true) {
  return createMcpCuaDriver({
    ensure: async () => ({ status: 'present', arch: 'test' }),
    transport: { command: 'unused', args: [], env: {} },
    retryReadOnly,
    ...(beforeOpen === undefined ? {} : { beforeOpen }),
  });
}

describe('Computer MCP process lifecycle', () => {
  it('shares one Container installation and connection while preparing', async () => {
    const installing = deferred<void>();
    const install = deferred<void>();
    const connecting = deferred<void>();
    const connect = deferred<void>();
    let installed = false;
    const run = vi.fn(async (args: readonly string[]) => {
      if (args.includes('uname')) return ok('aarch64');
      if (args.includes('--version')) return installed ? ok('cua-driver') : fail('missing');
      installing.resolve();
      await install.promise;
      installed = true;
      return ok();
    });
    mocks.connect.mockImplementationOnce(async () => {
      connecting.resolve();
      await connect.promise;
    });
    const container = createCuaDriver({ containerName: 'test', runner: { run } });

    expect(container.desktopPreparation?.()).toBe('idle');
    expect(container.prepareDesktop?.()).toBe(false);
    await installing.promise;
    const tools = container.tools();
    expect(container.desktopPreparation?.()).toBe('preparing');
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(container.prepareDesktop?.()).toBe(false);
    install.resolve();

    await connecting.promise;
    expect(container.prepareDesktop?.()).toBe(false);
    connect.resolve();
    await tools;
    expect(container.prepareDesktop?.()).toBe(true);
    expect(container.desktopPreparation?.()).toBe('ready');
    expect(run.mock.calls.filter(([args]) => args.includes('sh'))).toHaveLength(1);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    await container.close();
    expect(container.desktopPreparation?.()).toBe('idle');
  });

  it('surfaces a failed Container preparation instead of retrying it silently', async () => {
    const install = new Error('download failed');
    const run = vi.fn().mockRejectedValueOnce(install);
    const container = createCuaDriver({ containerName: 'test', runner: { run } });
    expect(container.prepareDesktop?.()).toBe(false);
    await expect(container.tools()).rejects.toBe(install);
    expect(container.desktopPreparation?.()).toBe('failed');
    expect(() => container.prepareDesktop?.()).toThrow('download failed');
    await container.close();
  });

  it.each(['session_ended', 'permission_denied', 'stale_element_token'])(
    'leaves %s renewal/refusal to the owning driver without replaying a Local observation',
    async (code) => {
      const refused = {
        isError: true,
        content: [{ type: 'text', text: 'driver refusal' }],
        structuredContent: { refusal: { code } },
      };
      mocks.callTool.mockResolvedValueOnce(refused);
      const connection = driver(undefined, false);
      expect(await connection.call('get_window_state', { pid: 42, window_id: 7 })).toBe(refused);
      expect(mocks.callTool).toHaveBeenCalledExactlyOnceWith(
        {
          name: 'get_window_state',
          arguments: { pid: 42, window_id: 7 },
        },
        undefined,
      );
      expect(mocks.close).not.toHaveBeenCalled();
      expect(mocks.created).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['get_window_state', 'click', 'type_text'])(
    'does not replay %s after a Local transport error',
    async (name) => {
      mocks.callTool.mockRejectedValueOnce(new Error('transport ended'));
      const connection = driver(undefined, false);
      await expect(connection.call(name, {})).rejects.toThrow('transport ended');
      expect(mocks.callTool).toHaveBeenCalledTimes(1);
      expect(mocks.created).toHaveBeenCalledTimes(1);
    },
  );

  it('does not retry an old observation after a target change closes its process', async () => {
    let rejectCall: ((error: Error) => void) | undefined;
    const observed = new Promise<void>((resolve) => {
      mocks.callTool.mockImplementationOnce(() => {
        resolve();
        return new Promise((_resolve, reject) => {
          rejectCall = reject;
        });
      });
    });
    const connection = driver();
    const call = connection.call('get_window_state', {});
    await observed;
    await connection.close();
    rejectCall?.(new Error('old process closed'));
    await expect(call).rejects.toThrow('old process closed');
    expect(mocks.created).toHaveBeenCalledTimes(1);
    expect(mocks.callTool).toHaveBeenCalledTimes(1);
  });

  it('verifies the executable again before reopening and refuses tampered files', async () => {
    const verify = vi.fn(async () => undefined);
    const connection = driver(verify);
    await connection.tools();
    await connection.close();
    verify.mockRejectedValueOnce(new Error('checksum mismatch'));
    await expect(connection.tools()).rejects.toThrow('checksum mismatch');
    expect(verify).toHaveBeenCalledTimes(2);
    expect(mocks.created).toHaveBeenCalledTimes(1);
  });

  it('does not spawn if closed while the executable check is still pending', async () => {
    let finish: (() => void) | undefined;
    const connection = driver(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const tools = connection.tools();
    const closed = connection.close();
    finish?.();
    await expect(tools).rejects.toThrow('cancelled');
    await closed;
    expect(mocks.created).not.toHaveBeenCalled();
  });
});
