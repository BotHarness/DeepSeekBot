import { expect, it } from 'vitest';
import { createAppearanceControl } from '../src/appearance/control.js';
import { runConnectionCommand } from '../src/bots/cli-connection.js';

it('requires the original plan revision for public private stop and rejects revision on other actions', async () => {
  let contacts = 0;
  const connect = async () => {
    contacts++;
    return { http: async () => ({ bytes: new TextEncoder().encode('{}') }) };
  };
  for (const value of [undefined, '', 'x'.repeat(201)])
    await expect(
      runConnectionCommand(
        'connection-host',
        ['target', 'stop-route', 'private-tunnel'],
        {
          'client-id': 'client',
          'connection-route-id': 'custom',
          confirm: true,
          ...(value === undefined ? {} : { 'expected-route-revision': value }),
        },
        {},
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    runConnectionCommand(
      'connection-host',
      ['target', 'plan-stop-route', 'private-tunnel'],
      {
        'client-id': 'client',
        'connection-route-id': 'custom',
        'expected-route-revision': 'revision-a',
      },
      {},
      connect,
    ),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(contacts).toBe(0);
});

it('returns the selected Client plan revision unchanged for a later explicit private stop', async () => {
  const calls: unknown[] = [];
  const result = await runConnectionCommand(
    'connection-host',
    ['target', 'plan-stop-route', 'private-tunnel'],
    { 'client-id': 'client', 'connection-route-id': 'custom' },
    {},
    async () => ({
      http: async (_path, body) => {
        calls.push(body);
        return {
          bytes: new TextEncoder().encode(
            JSON.stringify({
              hostId: 'target',
              disconnects: false,
              alternatives: [],
              expectedRevision: 'configuration-a',
            }),
          ),
        };
      },
    }),
  );
  expect(result).toEqual({
    hostId: 'target',
    disconnects: false,
    alternatives: [],
    expectedRevision: 'configuration-a',
  });
  expect(calls).toEqual([
    {
      action: 'request',
      clientId: 'client',
      connection: {
        action: 'plan-operation',
        hostId: 'target',
        operation: { action: 'stop-route', kind: 'private-tunnel', routeId: 'custom' },
      },
    },
  ]);
});

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
    ['target', 'read-operation'],
    {},
    { action: 'read-operation', hostId: 'target' },
  ],
  [
    'connection-host',
    ['target', 'read-previous-operation'],
    {},
    { action: 'read-previous-operation', hostId: 'target' },
  ],
  [
    'connection-host',
    ['target', 'plan-stop-route', 'lan'],
    {},
    {
      action: 'plan-operation',
      operation: { action: 'stop-route', kind: 'lan' },
      hostId: 'target',
    },
  ],
  [
    'connection-host',
    ['target', 'plan-sign-out'],
    {},
    { action: 'plan-operation', operation: { action: 'sign-out' }, hostId: 'target' },
  ],
  [
    'connection-host',
    ['target', 'stop-route', 'private-tunnel'],
    {
      confirm: true,
      'connection-route-id': 'quick',
      'confirm-disconnect': true,
      'expected-route-revision': 'revision-a',
    },
    {
      action: 'stop-route',
      kind: 'private-tunnel',
      routeId: 'quick',
      expectedRevision: 'revision-a',
      hostId: 'target',
      confirm: true,
      confirmDisconnect: true,
    },
  ],
  [
    'connection-host',
    ['target', 'stop-route', 'lan'],
    { confirm: true, handover: 'https://studio.ts.net' },
    {
      action: 'stop-route',
      kind: 'lan',
      hostId: 'target',
      confirm: true,
      handover: 'https://studio.ts.net',
    },
  ],
  [
    'connection-host',
    ['target', 'sign-out'],
    { confirm: true },
    { action: 'sign-out', hostId: 'target', confirm: true },
  ],
  [
    'connection-host',
    ['target', 'select-route', 'automatic'],
    { confirm: true },
    { action: 'select-route', hostId: 'target', route: 'automatic', confirm: true },
  ],
  [
    'connection-host',
    ['target', 'select-route', 'https://studio.ts.net'],
    { confirm: true },
    { action: 'select-route', hostId: 'target', route: 'https://studio.ts.net', confirm: true },
  ],
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
    ['target', 'select-route', 'automatic'],
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
