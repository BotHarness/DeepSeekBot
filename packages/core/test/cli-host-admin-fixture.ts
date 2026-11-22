import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, expect } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

export async function host(
  handler: (method: string, args: Record<string, unknown>) => unknown | Promise<unknown>,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const server = createServer(
    requestListener(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET') {
        if (
          new URL(req.url!, 'http://localhost').searchParams.get('token') !== 'private-test-token'
        ) {
          res.writeHead(403).end();
          return;
        }
        res.setHeader('set-cookie', 'authority=signed; HttpOnly');
        res.writeHead(302, { location: '/' }).end();
        return;
      }
      expect(req.headers.cookie).toBe('authority=signed');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      const method = body.method.replace('botharness/', '');
      calls.push({ method, args: body.payload.args });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: await handler(method, body.payload.args),
        }),
      );
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

export async function invoke(argv: string[], url: string, stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(stdout.join('')), stderr };
}

export const ok = (value: unknown) => ({ ok: true, value });
