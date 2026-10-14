import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

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

type Call = { method: string; args: unknown };

async function host(answer: (call: Call) => unknown) {
  const calls: Call[] = [];
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url!, 'http://localhost');
    if (req.method === 'GET' && url.searchParams.has('token')) {
      res.setHeader('set-cookie', 'authority=signed; HttpOnly');
      res.writeHead(302, { location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    const parsed = JSON.parse(Buffer.concat(chunks).toString());
    const call = { method: parsed.method.replace('botharness/', ''), args: parsed.payload.args };
    calls.push(call);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ type: 'server-response', rpcId: parsed.rpcId, result: answer(call) }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url: string, stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return { code, json: JSON.parse(stdout.join('')) };
}

describe('Harness Bot tool runner commands', () => {
  it('lists the direct tools and runs one as a Bot with args from stdin', async () => {
    const live = await host((call) =>
      call.method === 'botTools'
        ? {
            ok: true,
            value: {
              sessionId: 'direct',
              tools: [{ name: 'channel_list', description: 'List', inputSchema: {} }],
            },
          }
        : {
            ok: true,
            value: { slug: 'ada', tool: 'channel_list', sessionId: 'direct', result: {} },
          },
    );
    expect(await invoke(['bot-tools'], live.url)).toEqual({
      code: 0,
      json: {
        sessionId: 'direct',
        tools: [{ name: 'channel_list', description: 'List', inputSchema: {} }],
      },
    });
    expect(
      await invoke(['bot-tool', 'ada', 'channel_list', '--args-stdin'], live.url, '{"limit":2}'),
    ).toEqual({
      code: 0,
      json: { slug: 'ada', tool: 'channel_list', sessionId: 'direct', result: {} },
    });
    expect(live.calls).toEqual([
      { method: 'botTools', args: {} },
      { method: 'botToolRun', args: { slug: 'ada', tool: 'channel_list', args: { limit: 2 } } },
    ]);
  });

  it('exits non-zero with the Host code when the runner refuses the tool', async () => {
    const live = await host(() => ({
      ok: false,
      error: {
        code: 'tool-not-direct',
        message: 'create_assignment cannot run outside a Bot turn',
      },
    }));
    const refused = await invoke(['bot-tool', 'ada', 'create_assignment'], live.url);
    expect(refused.code).not.toBe(0);
    expect(refused.json.error).toMatchObject({ code: 'tool-not-direct' });
  });

  it('rejects malformed calls before contacting the Host', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    for (const [argv, stdin] of [
      [['bot-tool', 'ada'], ''],
      [['bot-tools', 'ada'], ''],
      [['bot-tool', 'ada', 'channel_list', '--args-stdin'], '[1]'],
      [['bot-tool', 'ada', 'channel_list', '--args-stdin'], 'not json'],
    ] as const) {
      const result = await invoke([...argv], live.url, stdin);
      expect(result.code).not.toBe(0);
      expect(result.json.error.code).toBe('usage');
    }
    expect(live.calls).toEqual([]);
  });
});
