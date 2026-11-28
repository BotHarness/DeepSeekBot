import { createServer } from 'node:http';
import { expect, it } from 'vitest';
import { runBotCreateCli } from '../src/cli/bot-create-cli.js';
import { requestListener } from './async-listener.js';

it('previews feedback through the live authenticated Host and refuses submission without confirmation', async () => {
  const seen: string[] = [];
  const server = createServer(
    requestListener(async (req, res) => {
      if (req.method === 'GET') {
        res.writeHead(302, { location: '/', 'set-cookie': 'owner=test; HttpOnly' }).end();
        return;
      }
      expect(req.headers.cookie).toBe('owner=test');
      seen.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      if (req.url?.endsWith('/submit')) {
        res.writeHead(502).end(
          JSON.stringify({
            error: { code: 'feedback-failed', reason: 'receiver-error', status: 503 },
          }),
        );
        return;
      }
      res.end(JSON.stringify({ token: 'preview-reference', canSubmit: true }));
    }),
  );
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
    output.length = 0;
    expect(await runBotCreateCli(['feedback-submit', '--confirm'], io)).toBe(1);
    expect(seen.at(-1)).toBe('/api/botharness/message-feedback/submit');
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0] ?? '{}')).toEqual({
      error: {
        code: 'feedback-failed',
        message: 'The feedback service could not accept the submission. Try again later.',
        details: { reason: 'receiver-error', status: 503 },
      },
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
