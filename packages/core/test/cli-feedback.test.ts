import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

it('previews feedback through the live authenticated Host and refuses submission without confirmation', async () => {
  const seen: string[] = [];
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      res.writeHead(302, { location: '/', 'set-cookie': 'owner=test; HttpOnly' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('owner=test');
    seen.push(req.url ?? '');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ token: 'preview-reference', canSubmit: true }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  const output: string[] = [];
  const io = {
    env: {
      DEEPSEEKBOT_HOST: `http://127.0.0.1:${address.port}`,
      DEEPSEEKBOT_HOST_TOKEN: 'test-secret',
    },
    readStdin: async () => JSON.stringify({ channelId: 'dm', messageId: 'm30' }),
    stdout: (value: string) => output.push(value),
    stderr() {},
  };
  try {
    const code = await runBotCreateCli(['feedback-preview'], io);
    expect(code, output.join('')).toBe(0);
    expect(seen).toEqual(['/api/botharness/message-feedback/preview']);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? '{}').token).toBe('preview-reference');
    expect(await runBotCreateCli(['feedback-submit'], io)).toBe(2);
    expect(seen).toHaveLength(1);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
