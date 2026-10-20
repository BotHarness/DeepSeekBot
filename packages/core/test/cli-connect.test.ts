import { describe, expect, it, vi } from 'vitest';
import { runConnectCommand } from '../src/bots/cli-connect.js';
const reply = (value: unknown) => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
});
describe('connect CLI', () => {
  it('enables with the token from stdin and never puts it in arguments', async () => {
    const http = vi.fn(async () =>
      reply({ state: 'starting', hostname: 'studio.deepseekbot.dev' }),
    );
    expect(
      await runConnectCommand(
        'connect-enable',
        [],
        { hostname: 'studio.deepseekbot.dev', 'token-stdin': true },
        { readStdin: async () => ' tok3n\n' },
        async () => ({ http }),
      ),
    ).toEqual({ state: 'starting', hostname: 'studio.deepseekbot.dev' });
    expect(http.mock.calls[0]).toEqual([
      '/api/botharness/devices/connect',
      { action: 'enable', hostname: 'studio.deepseekbot.dev', token: 'tok3n' },
    ]);
  });
  it('reads status from the devices snapshot without the device list', async () => {
    const http = vi.fn(async () =>
      reply({
        host: {},
        devices: [{ id: 'd' }],
        routes: { routes: [] },
        connect: { state: 'off' },
      }),
    );
    expect(
      await runConnectCommand('connect-status', [], {}, {}, async () => ({
        http,
      })),
    ).toEqual({
      connect: { state: 'off' },
      routes: { routes: [] },
    });
    expect(http.mock.calls[0]).toEqual(['/api/botharness/devices']);
  });
  it('disables through the same route', async () => {
    const http = vi.fn(async () => reply({ state: 'off' }));
    await runConnectCommand('connect-disable', [], {}, {}, async () => ({
      http,
    }));
    expect(http.mock.calls[0]).toEqual(['/api/botharness/devices/connect', { action: 'disable' }]);
  });
  it('refuses incomplete input before connecting', async () => {
    const connect = vi.fn();
    for (const [command, values] of [
      ['connect-enable', { hostname: 'studio.deepseekbot.dev' }],
      ['connect-enable', { 'token-stdin': true }],
      ['connect-status', { hostname: 'studio.deepseekbot.dev' }],
    ] as const)
      await expect(
        runConnectCommand(command, [], values, { readStdin: async () => 't' }, connect),
      ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      runConnectCommand(
        'connect-enable',
        [],
        { hostname: 'studio.deepseekbot.dev', 'token-stdin': true },
        { readStdin: async () => '  ' },
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
  });
});
