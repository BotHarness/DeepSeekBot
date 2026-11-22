import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, expect, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { requestListener } from './async-listener.js';

const servers: ReturnType<typeof createServer>[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
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
  handler: (method: string, args: Record<string, unknown>) => unknown,
  stallBody = false,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  let logins = 0;
  const server = createServer(
    requestListener(async (req: IncomingMessage, res: ServerResponse) => {
      if (req.method === 'GET') {
        logins += 1;
        if (
          new URL(req.url!, 'http://localhost').searchParams.get('token') !== 'private-test-token'
        ) {
          res.writeHead(403).end();
          return;
        }
        if (logins % 2 === 0) res.setHeader('set-cookie', 'authority=signed; HttpOnly');
        res.writeHead(302, { location: '/' }).end();
        return;
      }
      expect(req.headers.cookie).toBe('authority=signed');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      expect(body.type).toBe('client-request');
      expect(req.url).toBe(`/api/${body.method}`);
      const method = body.method.replace('botharness/', '');
      calls.push({ method, args: body.payload.args });
      res.setHeader('content-type', 'application/json');
      if (stallBody) {
        res.write('{');
        return;
      }
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result:
            method === 'channelDm'
              ? {
                  ok: true,
                  value: {
                    channel: {
                      id: 'dm-' + String(body.payload.args.slug),
                      type: 'dm',
                      name: String(body.payload.args.slug),
                      members: [String(body.payload.args.slug)],
                    },
                  },
                }
              : handler(method, body.payload.args),
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

export async function invoke(
  argv: string[],
  url?: string,
  stdin = '',
  token = 'private-test-token',
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: token },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  const out = stdout.join('');
  expect(out + stderr.join('')).not.toContain('private-test-token');
  return { code, text: out, json: JSON.parse(out) };
}
