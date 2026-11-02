import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot } from './helpers.js';

it('reads and writes the admitted device copy with secrets only in a file, and reports coded refusals', async () => {
  const calls: Array<{ method: string | undefined; url: string | undefined; body: string }> = [];
  let refused = false;
  const server = createServer(async (req, res) => {
    expect(req.headers.authorization).toBe('Device paired.private-secret');
    expect(req.headers.cookie).toBeUndefined();
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() });
    res.writeHead(refused ? 401 : 200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        refused
          ? { code: 'device-revoked' }
          : {
              registered: false,
              preferences: { approval: false, question: true, 'private-input': true, reply: true },
            },
      ),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  const file = join(createTempRoot('device-cli-'), 'pairing.json');
  writeFileSync(
    file,
    JSON.stringify({
      hostId: 'host',
      hostName: 'Host',
      deviceId: 'paired',
      credential: 'paired.private-secret',
      routes: [`http://127.0.0.1:${address.port}`],
    }),
  );
  const preferences = { approval: false, question: true, 'private-input': true, reply: true };
  const run = async (args: string[], input = '') => {
    const output: string[] = [];
    const errors: string[] = [];
    const code = await runBotCreateCli(['device-notifications', '--device-file', file, ...args], {
      env: {},
      readStdin: async () => input,
      stdout: (text) => output.push(text),
      stderr: (text) => errors.push(text),
    });
    expect(output).toHaveLength(1);
    expect(output[0]).not.toContain('private-secret');
    expect(errors.join('')).not.toContain('private-secret');
    return { code, value: JSON.parse(output[0]!) };
  };
  try {
    expect((await run([])).value.preferences).toEqual(preferences);
    expect((await run(['--preferences-stdin'], JSON.stringify(preferences))).code).toBe(0);
    expect(calls[1]).toEqual({
      method: 'POST',
      url: '/botharness-device/push/preferences',
      body: JSON.stringify({ preferences }),
    });
    expect((await run(['--preferences-stdin'], '{}')).code).toBe(1);
    refused = true;
    expect((await run([])).value).toMatchObject({ error: { code: 'device-revoked' } });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
