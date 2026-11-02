import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

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

async function host(
  handler: (method: string, args: Record<string, unknown>) => unknown,
  stallBody = false,
) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  let logins = 0;
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
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
        result: handler(method, body.payload.args),
      }),
    );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { url: `http://127.0.0.1:${address.port}`, calls };
}

async function invoke(argv: string[], url?: string, stdin = '', token = 'private-test-token') {
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

describe('Agent control commands', () => {
  it('turns Browser and Computer Access on or off through the live Host', async () => {
    const live = await host((method, args) => ({
      ok: true,
      value: { bot: { slug: args['slug'], method } },
    }));
    expect((await invoke(['browser-access-set', 'ada', '--enabled'], live.url)).json).toEqual({
      bot: { slug: 'ada', method: 'browserAccessSet' },
    });
    await invoke(['computer-access-set', 'ada', '--disabled'], live.url);
    expect(live.calls).toEqual([
      { method: 'browserAccessSet', args: { slug: 'ada', enabled: true } },
      { method: 'computerAccessSet', args: { slug: 'ada', enabled: false } },
    ]);
    for (const argv of [
      ['browser-access-set', 'ada'],
      ['browser-access-set', 'ada', '--enabled', '--disabled'],
      ['computer-access-set', '--enabled'],
    ])
      expect((await invoke(argv, live.url)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(2);
  });

  it('reads and sets the access preset and refuses danger without explicit acknowledgement', async () => {
    const live = await host((method, args) => ({
      ok: true,
      value: { preset: { botSlug: args['slug'], mode: args['mode'] ?? 'workspace-write' } },
    }));
    expect((await invoke(['access', 'ada'], live.url)).json.preset.botSlug).toBe('ada');
    const refused = await invoke(['access-set', 'ada', '--mode', 'danger-full-access'], live.url);
    expect(refused.code).not.toBe(0);
    expect(refused.json.error.code).toBe('usage');
    expect(refused.json.error.message).toContain('--acknowledge-risk');
    expect(
      (
        await invoke(
          ['access-set', 'ada', '--mode', 'workspace-write', '--scope', 'everything'],
          live.url,
        )
      ).json.error.code,
    ).toBe('usage');
    await invoke(
      [
        'access-set',
        'ada',
        '--mode',
        'danger-full-access',
        '--scope',
        'assignments',
        '--acknowledge-risk',
      ],
      live.url,
    );
    await invoke(['access-set', 'ada', '--mode', 'workspace-write'], live.url);
    expect(live.calls).toEqual([
      { method: 'assignmentAccessGet', args: { slug: 'ada' } },
      {
        method: 'assignmentAccessSet',
        args: {
          slug: 'ada',
          mode: 'danger-full-access',
          scope: 'assignments',
          acknowledgeRisk: true,
        },
      },
      { method: 'assignmentAccessSet', args: { slug: 'ada', mode: 'workspace-write' } },
    ]);
  });

  it('reads one settings namespace and patches it against its current revision', async () => {
    const live = await host((method, args) =>
      method === 'settings/describe'
        ? {
            ok: true,
            value: {
              namespaces: [
                { ns: 'other', revision: 1, value: {} },
                {
                  ns: 'botharness-client',
                  revision: 7,
                  value: { assignmentConcurrencyLimit: 3 },
                  schema: { large: true },
                },
              ],
            },
          }
        : {
            ok: true,
            value: { ns: args['ns'], revision: 8, value: { assignmentConcurrencyLimit: 4 } },
          },
    );
    expect((await invoke(['settings', 'botharness-client'], live.url)).json).toEqual({
      ns: 'botharness-client',
      revision: 7,
      value: { assignmentConcurrencyLimit: 3 },
    });
    expect((await invoke(['settings', 'missing'], live.url)).json.error.code).toBe(
      'unknown-settings',
    );
    const set = await invoke(
      ['settings-set', 'botharness-client', '--patch-stdin'],
      live.url,
      '{"assignmentConcurrencyLimit":4}',
    );
    expect(set.json).toEqual({
      ns: 'botharness-client',
      revision: 8,
      value: { assignmentConcurrencyLimit: 4 },
    });
    expect(live.calls.at(-1)).toEqual({
      method: 'settings/update',
      args: {
        ns: 'botharness-client',
        patch: { assignmentConcurrencyLimit: 4 },
        expectedRevision: 7,
      },
    });
    const before = live.calls.length;
    for (const [argv, stdin] of [
      [['settings-set', 'botharness-client'], '{}'],
      [['settings-set', 'botharness-client', '--patch-stdin'], '[1]'],
      [['settings-set', 'botharness-client', '--patch-stdin'], 'not json'],
    ] as const)
      expect((await invoke([...argv], live.url, stdin)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(before);
  });

  it('preserves the explicitly reviewed revision and refuses changed values without updating', async () => {
    let revision = 7;
    let value = 3;
    const live = await host((method, args) => ({
      ok: true,
      value:
        method === 'settings/describe'
          ? {
              namespaces: [
                { ns: 'botharness-client', revision, value: { assignmentConcurrencyLimit: value } },
              ],
            }
          : { revision: revision + 1, value: args['patch'] },
    }));
    const args = [
      'settings-set',
      'botharness-client',
      '--patch-stdin',
      '--expected-revision',
      '7',
      '--previous-value',
      '{"assignmentConcurrencyLimit":3}',
    ];
    expect((await invoke(args, live.url, '{"assignmentConcurrencyLimit":4}')).code).toBe(0);
    expect(live.calls.at(-1)?.args['expectedRevision']).toBe(7);
    revision = 8;
    expect((await invoke(args, live.url, '{"assignmentConcurrencyLimit":4}')).json.error.code).toBe(
      'stale-setting',
    );
    revision = 7;
    value = 6;
    expect((await invoke(args, live.url, '{"assignmentConcurrencyLimit":4}')).json.error.code).toBe(
      'stale-setting',
    );
    expect(live.calls.filter((call) => call.method === 'settings/update')).toHaveLength(1);
  });

  it('creates a native workspace and groups with explicit or empty initial membership', async () => {
    const live = await host((method, args) => ({ ok: true, value: { method, args } }));
    await invoke(['workspace-create', '/srv/bots/workspace'], live.url);
    await invoke(['group-create', 'Skill Lab', '--member', 'bot-a', '--member', 'bot-b'], live.url);
    expect(live.calls).toEqual([
      { method: 'workspace/create', args: { request: { path: '/srv/bots/workspace' } } },
      { method: 'channelCreate', args: { name: 'Skill Lab', members: ['bot-a', 'bot-b'] } },
    ]);
    expect((await invoke(['workspace-create', 'relative/dir'], live.url)).json.error.code).toBe(
      'usage',
    );
    expect((await invoke(['group-create', 'Empty'], live.url)).code).toBe(0);
    expect(live.calls.at(-1)).toEqual({
      method: 'channelCreate',
      args: { name: 'Empty', members: [] },
    });
    expect(live.calls).toHaveLength(3);
  });
});
