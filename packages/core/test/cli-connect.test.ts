import { describe, expect, it, vi } from 'vitest';
import { runConnectCommand } from '../src/bots/cli-connect.js';
const reply = (value: unknown) => ({
  bytes: new TextEncoder().encode(JSON.stringify(value)),
});
describe('connect CLI', () => {
  it('claims private connectivity only with explicit confirmation and a stdin setup key', async () => {
    const http = vi.fn(async () => reply({ ok: true, status: { state: 'connecting' } }));
    const connect = vi.fn(async () => ({ http }));
    await expect(
      runConnectCommand(
        'private-connect',
        [],
        { hostname: 'https://relay.example.com', 'token-stdin': true },
        {},
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
    const result = await runConnectCommand(
      'private-connect',
      [],
      { hostname: 'https://relay.example.com', 'token-stdin': true, confirm: true },
      { readStdin: async () => 'a'.repeat(64) },
      connect,
    );
    expect(http).toHaveBeenCalledWith('/api/botharness/devices/private', {
      origin: 'https://relay.example.com',
      bootstrap: 'a'.repeat(64),
      confirm: true,
    });
    expect(JSON.stringify(result)).not.toContain('a'.repeat(64));
  });
  it('enables a Quick or Named private tunnel only with --confirm and reads the token from stdin', async () => {
    const http = vi.fn(async () => reply({ ok: true, status: { state: 'starting' } }));
    const connect = vi.fn(async () => ({ http }));
    for (const values of [
      { quick: true },
      { quick: true, hostname: 'bot.example.com', confirm: true },
      { hostname: 'bot.example.com', confirm: true },
      { confirm: true },
    ])
      await expect(
        runConnectCommand('private-tunnel-enable', [], values, {}, connect),
      ).rejects.toMatchObject({ code: 'usage' });
    expect(connect).not.toHaveBeenCalled();
    await runConnectCommand(
      'private-tunnel-enable',
      [],
      { quick: true, confirm: true },
      {},
      connect,
    );
    expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
      action: 'enable',
      mode: 'quick',
      confirm: true,
    });
    const result = await runConnectCommand(
      'private-tunnel-enable',
      [],
      { hostname: 'bot.example.com', 'token-stdin': true, confirm: true },
      { readStdin: async () => ' connector-token \n' },
      connect,
    );
    expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
      action: 'enable',
      mode: 'named',
      hostname: 'bot.example.com',
      token: 'connector-token',
      confirm: true,
    });
    expect(JSON.stringify(result)).not.toContain('connector-token');
    await runConnectCommand('private-tunnel-disable', [], { confirm: true }, {}, connect);
    expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
      action: 'disable',
      confirm: true,
    });
  });
  it('registers a bring-your-own ingress origin only with --origin and --confirm', async () => {
    const http = vi.fn(async () => reply({ ok: true, status: { state: 'verifying' } }));
    const connect = vi.fn(async () => ({ http }));
    for (const [command, values] of [
      ['private-ingress-enable', { confirm: true }],
      ['private-ingress-enable', { origin: 'https://bot.example.com' }],
      ['private-ingress-enable', { origin: 'https://bot.example.com', quick: true, confirm: true }],
      ['private-ingress-disable', { confirm: true, lan: true }],
    ] as const)
      await expect(runConnectCommand(command, [], values, {}, connect)).rejects.toMatchObject({
        code: 'usage',
      });
    expect(connect).not.toHaveBeenCalled();
    await runConnectCommand(
      'private-ingress-enable',
      [],
      { origin: 'https://bot.example.com', lan: true, confirm: true },
      {},
      connect,
    );
    expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
      action: 'enable',
      mode: 'ingress',
      origin: 'https://bot.example.com',
      lan: true,
      confirm: true,
    });
    await runConnectCommand('private-ingress-disable', [], { confirm: true }, {}, connect);
    expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
      action: 'disable',
      confirm: true,
    });
  });
  it('lists linked computers through the on-demand route', async () => {
    const http = vi.fn(async () => reply({ hosts: [] }));
    expect(
      await runConnectCommand('connect-account-hosts', [], {}, {}, async () => ({ http })),
    ).toEqual({ hosts: [] });
    expect(http).toHaveBeenCalledWith('/api/botharness/devices/account-hosts');
  });
  it('requires explicit confirmation before connecting and uses the same owner route', async () => {
    const http = vi.fn(async () => reply({ ok: true, status: { state: 'signed-in' } }));
    const connect = vi.fn(async () => ({ http }));
    await expect(
      runConnectCommand('connect-account-revoke', ['hother'], {}, {}, connect),
    ).rejects.toMatchObject({ code: 'confirm-required' });
    expect(connect).not.toHaveBeenCalled();
    await runConnectCommand('connect-account-revoke', ['hother'], { confirm: true }, {}, connect);
    expect(http).toHaveBeenCalledWith('/api/botharness/devices/account-hosts/revoke', {
      hostId: 'hother',
      confirm: true,
    });
  });
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
        connect: {
          state: 'off',
          account: { state: 'error', issue: 'relay-unavailable', recovery: 'sign-in' },
          encryption: {
            protocol: 'connect-noise-xk-v1',
            required: true,
            state: 'disconnected',
            fingerprint: 'public-fingerprint',
          },
        },
      }),
    );
    expect(
      await runConnectCommand('connect-status', [], {}, {}, async () => ({
        http,
      })),
    ).toEqual({
      connect: {
        state: 'off',
        account: { state: 'error', issue: 'relay-unavailable', recovery: 'sign-in' },
        encryption: {
          protocol: 'connect-noise-xk-v1',
          required: true,
          state: 'disconnected',
          fingerprint: 'public-fingerprint',
        },
      },
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

it('manages a named private route with explicit identity and never includes its token in output', async () => {
  const http = vi.fn(async () => reply({ ok: true, routeId: 'custom' }));
  const connect = vi.fn(async () => ({ http }));
  const result = await runConnectCommand(
    'private-route',
    ['replace', 'custom'],
    { hostname: 'bot.example.com', 'token-stdin': true, confirm: true },
    { readStdin: async () => 'private-test-token' },
    connect,
  );
  expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
    action: 'replace',
    routeId: 'custom',
    confirm: true,
    mode: 'named',
    hostname: 'bot.example.com',
    token: 'private-test-token',
  });
  expect(JSON.stringify(result)).not.toContain('private-test-token');
  for (const action of ['start', 'stop', 'remove']) {
    await runConnectCommand('private-route', [action, 'quick'], { confirm: true }, {}, connect);
    expect(http).toHaveBeenLastCalledWith('/api/botharness/devices/private-tunnel', {
      action,
      routeId: 'quick',
      confirm: true,
    });
  }
});

it('refuses ambiguous route mutations before opening a Host connection', async () => {
  const connect = vi.fn();
  for (const args of [[], ['stop'], ['remove', 'unknown'], ['add', 'custom']]) {
    await expect(
      runConnectCommand('private-route', args, { confirm: true }, {}, connect),
    ).rejects.toMatchObject({ code: 'usage' });
  }
  await expect(
    runConnectCommand('private-route', ['stop', 'quick'], {}, {}, connect),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(connect).not.toHaveBeenCalled();
});

it('lists the same public route statuses exposed by the Host', async () => {
  const routes = [{ id: 'quick', enabled: true, state: 'connected' }];
  const http = vi.fn(async () => reply({ privateRoutes: routes }));
  expect(
    await runConnectCommand('private-route', ['list'], {}, {}, async () => ({ http })),
  ).toEqual({ routes });
  expect(http).toHaveBeenCalledWith('/api/botharness/devices');
});
it('runs the same Host-owned public connectivity check without publishing credentials', async () => {
  const health = {
    state: 'failed',
    stage: 'public',
    code: 'dns',
    checkedAt: '2026-11-14T00:00:00.000Z',
    elapsedMs: 10,
  };
  const http = vi.fn(async () => reply({ health }));
  expect(await runConnectCommand('connect-check', [], {}, {}, async () => ({ http }))).toEqual({
    health,
  });
  expect(http.mock.calls[0]).toEqual(['/api/botharness/devices/connect-health', {}]);
});
