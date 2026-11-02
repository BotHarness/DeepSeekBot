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
