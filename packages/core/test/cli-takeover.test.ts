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

describe('Takeover Handoff commands', () => {
  it('lists, requests, completes and cancels through the Host methods', async () => {
    const takeover = { id: 'req-1', channelId: 'dm-ada', status: 'pending' };
    const live = await host(() => ({ ok: true, value: { takeover, takeovers: [takeover] } }));
    expect((await invoke(['takeovers', 'ada', '--pending'], live.url)).code).toBe(0);
    expect(
      (
        await invoke(
          [
            'takeover-request',
            'ada',
            '--target',
            'browser',
            '--title',
            'Sign in',
            '--body',
            'Please sign in, then press Done.',
            '--minutes',
            '5',
          ],
          live.url,
        )
      ).json,
    ).toEqual({ takeover, takeovers: [takeover] });
    await invoke(['takeover-status', '--channel', 'dm-ada', '--message-id', 'req-1'], live.url);
    await invoke(
      ['takeover-complete', '--channel', 'dm-ada', '--message-id', 'req-1', '--outcome', 'done'],
      live.url,
    );
    await invoke(['takeover-cancel', '--channel', 'dm-ada', '--message-id', 'req-1'], live.url);
    await invoke(
      ['takeover-cancel', '--channel', 'dm-ada', '--message-id', 'req-1', '--bot', 'ada'],
      live.url,
    );
    expect(live.calls).toEqual([
      { method: 'takeoverList', args: { query: { slug: 'ada', pendingOnly: true } } },
      {
        method: 'takeoverRequest',
        args: {
          slug: 'ada',
          input: {
            target: 'browser',
            title: 'Sign in',
            message: 'Please sign in, then press Done.',
            minutes: 5,
          },
        },
      },
      { method: 'takeoverStatus', args: { channelId: 'dm-ada', messageId: 'req-1' } },
      {
        method: 'takeoverComplete',
        args: { channelId: 'dm-ada', messageId: 'req-1', outcome: 'done', surface: 'cli' },
      },
      {
        method: 'takeoverCancel',
        args: { channelId: 'dm-ada', messageId: 'req-1', surface: 'cli' },
      },
      {
        method: 'takeoverCancel',
        args: { channelId: 'dm-ada', messageId: 'req-1', surface: 'cli', bot: 'ada' },
      },
    ]);
  });

  it('refuses incomplete requests before reaching the Host', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    const stderr: string[] = [];
    const code = await runBotCreateCli(
      ['takeover-complete', '--channel', 'dm-ada', '--message-id', 'req-1', '--outcome', 'maybe'],
      {
        env: { DEEPSEEKBOT_HOST: live.url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
        stdout: () => undefined,
        stderr: (text) => stderr.push(text),
      },
    );
    expect(code).not.toBe(0);
    expect(stderr.join('')).toContain('--outcome done');
    expect(live.calls).toEqual([]);
  });
});
