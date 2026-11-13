import { expect, it } from 'vitest';
import { createAppearanceControl } from '../src/appearance/control.js';
import { runConnectionCommand } from '../src/bots/cli-connection.js';

it('dispatches a connection attempt to exactly the selected Client and returns only its status', async () => {
  const relay = createAppearanceControl();
  const request = (body: unknown) =>
    relay.fetch(
      new Request('http://local/api/botharness/appearance-control', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  const registration = await (await request({ action: 'register', platform: 'web' })).json();
  const polling = request({ action: 'poll', ...registration });
  const connection = async () => ({
    http: async (_path: string, body?: Record<string, unknown>) => {
      const response = body ? await request(body) : await relay.fetch(new Request('http://local'));
      return { bytes: new Uint8Array(await response.arrayBuffer()) };
    },
  });
  try {
    const result = runConnectionCommand(
      'connection',
      ['start'],
      { 'client-id': registration.clientId, 'connection-id': 'attempt-1', 'link-file': '-' },
      { readStdin: async () => 'deepseekbot://pair?private-fixture' },
      connection,
    );
    const { command } = await (await polling).json();
    expect(command.connection).toMatchObject({ action: 'start', attemptId: 'attempt-1' });
    await request({
      action: 'reply',
      ...registration,
      requestId: command.id,
      result: { attemptId: 'attempt-1', state: 'verify-host', saved: false },
    });
    expect(await result).toEqual({ attemptId: 'attempt-1', state: 'verify-host', saved: false });
    await expect(
      runConnectionCommand('connection', ['start'], { 'link-file': '-' }, {}, connection),
    ).rejects.toMatchObject({ code: 'usage' });
  } finally {
    relay.dispose();
  }
});

it.each([
  ['connection-hosts', [], {}, { action: 'hosts' }],
  ['connection-host', ['target', 'inspect'], {}, { action: 'inspect-host', hostId: 'target' }],
  [
    'connection-host',
    ['target', 'remove'],
    { confirm: true },
    { action: 'forget-host', hostId: 'target', confirm: true },
  ],
  [
    'connection-host',
    ['target', 'revoke-device', 'phone'],
    { confirm: true },
    { action: 'revoke-device', hostId: 'target', deviceId: 'phone', confirm: true },
  ],
  [
    'connection-host',
    ['target', 'stop-route', 'lan'],
    { confirm: true },
    { action: 'stop-route', hostId: 'target', kind: 'lan', confirm: true },
  ],
] as const)('targets one Client for %s %s', async (command, rest, flags, expected) => {
  const relay = createAppearanceControl();
  const request = (body: unknown) =>
    relay.fetch(
      new Request('http://local/api/botharness/appearance-control', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  const selected = await (await request({ action: 'register', platform: 'web' })).json();
  await request({ action: 'register', platform: 'web' });
  const polling = request({ action: 'poll', ...selected });
  const connect = async () => ({
    http: async (_path: string, body?: Record<string, unknown>) => ({
      bytes: new Uint8Array(await (await request(body)).arrayBuffer()),
    }),
  });
  try {
    const pending = runConnectionCommand(
      command,
      [...rest],
      { 'client-id': selected.clientId, ...flags },
      {},
      connect,
    );
    const { command: delivered } = await (await polling).json();
    expect(delivered.connection).toEqual(expected);
    await request({
      action: 'reply',
      ...selected,
      requestId: delivered.id,
      result: { accepted: true },
    });
    expect(await pending).toEqual({ accepted: true });
  } finally {
    relay.dispose();
  }
});

it('refuses unconfirmed management and unsupported stop kinds before contacting a Host', async () => {
  let contacted = false;
  const connect = async () => {
    contacted = true;
    return { http: async () => ({ bytes: new Uint8Array() }) };
  };
  for (const rest of [
    ['target', 'remove'],
    ['target', 'revoke-device', 'phone'],
    ['target', 'stop-route', 'lan'],
  ])
    await expect(
      runConnectionCommand('connection-host', rest, { 'client-id': 'client' }, {}, connect),
    ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    runConnectionCommand(
      'connection-host',
      ['target', 'stop-route', 'all'],
      { 'client-id': 'client', confirm: true },
      {},
      connect,
    ),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(contacted).toBe(false);
});
