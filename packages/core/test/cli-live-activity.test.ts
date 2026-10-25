import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot } from './helpers.js';

it('uses Device credentials from a file and activity tokens from stdin without printing either', async () => {
  const calls: { path: string | undefined; body: string }[] = [];
  let revoked = false;
  const server = createServer(async (request, response) => {
    expect(request.headers.authorization).toBe('Device device.private-credential');
    let body = '';
    for await (const chunk of request) body += String(chunk);
    calls.push({ path: request.url, body });
    response.writeHead(revoked ? 401 : 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(revoked ? { code: 'device-revoked' } : { registered: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('address');
  const file = join(createTempRoot('activity-cli-'), 'pairing.json');
  writeFileSync(
    file,
    JSON.stringify({
      hostId: 'host',
      hostName: 'Computer',
      deviceId: 'device',
      credential: 'device.private-credential',
      routes: [`http://127.0.0.1:${address.port}`],
    }),
  );
  const token = 'a'.repeat(64);
  const run = async (operation: string, body?: unknown) => {
    const out: string[] = [],
      err: string[] = [];
    const code = await runBotCreateCli(
      ['device-activity', operation, '--device-file', file, ...(body ? ['--activity-stdin'] : [])],
      {
        env: {},
        readStdin: async () => JSON.stringify(body),
        stdout: (value) => out.push(value),
        stderr: (value) => err.push(value),
      },
    );
    expect(out).toHaveLength(1);
    expect(out.join('') + err.join('')).not.toContain(token);
    expect(out.join('') + err.join('')).not.toContain('private-credential');
    return { code, value: JSON.parse(out[0]!) };
  };
  try {
    expect((await run('capability')).code).toBe(0);
    expect((await run('register', { token, clientActivityId: 'native-id' })).code).toBe(0);
    expect(calls[1]).toEqual({
      path: '/botharness-device/activity/register',
      body: JSON.stringify({ token, clientActivityId: 'native-id' }),
    });
    expect((await run('stop', { clientActivityId: 'native-id' })).code).toBe(0);
    expect((await run('register')).code).toBe(1);
    revoked = true;
    expect((await run('capability')).value).toMatchObject({ error: { code: 'device-revoked' } });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
