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
    const args = method.startsWith('dsh-im/') ? body.payload : body.payload.args;
    calls.push({ method, args });
    res.setHeader('content-type', 'application/json');
    if (stallBody) {
      res.write('{');
      return;
    }
    res.end(
      JSON.stringify({
        type: 'server-response',
        rpcId: body.rpcId,
        result: handler(method, args),
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

const APPS = {
  apps: [
    {
      ref: 'discord_1',
      platform: 'discord',
      name: 'Mascot',
      fingerprint: 'f'.repeat(64),
      connected: true,
      providerId: 'dsh-im/discord',
    },
  ],
  setups: [],
};

const SNAPSHOT = {
  accounts: APPS.apps,
  identities: [
    {
      id: '11111111-1111-4111-8111-111111111111',
      botSlug: 'ada',
      providerId: 'dsh-im/discord',
      platform: 'discord',
      accountRef: 'discord_1',
      fingerprint: 'f'.repeat(64),
      name: 'Mascot',
      enabled: true,
      revision: 2,
      availability: 'available',
      reception: 'receiving',
      grantCount: 1,
    },
  ],
  grants: [{ secret: 'not printed' }],
};

describe('Agent IM commands', () => {
  it('adds a token app from stdin and never echoes the credential', async () => {
    const live = await host((method, args) => ({
      ok: true,
      value: {
        state: 'connected',
        bots: [
          {
            botId: 'discord_1',
            state: 'connected',
            connected: true,
            bot: { name: 'Mascot', idMasked: '12••34' },
            error: null,
            stats: { messagesReceived: 0, messagesReplied: 0 },
            tokenRef: 'DSH_DISCORD_BOT_TOKEN_1',
            echo: JSON.stringify(args),
          },
        ],
      },
    }));
    const added = await invoke(
      ['im-app-add', 'discord', '--credentials-stdin'],
      live.url,
      '{"token":"discord-secret-token-value"}',
    );
    expect(added.text).not.toContain('discord-secret-token-value');
    expect(added.text).not.toContain('tokenRef');
    expect(added.json).toEqual({
      platform: 'discord',
      state: 'connected',
      apps: [
        {
          id: 'discord_1',
          name: 'Mascot',
          state: 'connected',
          connected: true,
          error: null,
          stats: { messagesReceived: 0, messagesReplied: 0 },
        },
      ],
    });
    expect(live.calls).toEqual([
      {
        method: 'dsh-im/discord',
        args: { method: 'bot.bind-credentials', payload: { token: 'discord-secret-token-value' } },
      },
    ]);
    await invoke(['im-app-status', 'discord'], live.url);
    await invoke(['im-app-remove', 'discord', '--app', 'discord_1'], live.url);
    expect(live.calls.slice(1)).toEqual([
      { method: 'dsh-im/discord', args: { method: 'connection.status', payload: {} } },
      {
        method: 'dsh-im/discord',
        args: { method: 'bot.delete', payload: { botId: 'discord_1', confirm: true } },
      },
    ]);
    for (const [argv, stdin] of [
      [['im-app-add', 'feishu', '--credentials-stdin'], '{"token":"x"}'],
      [['im-app-add', 'discord'], '{"token":"x"}'],
      [['im-app-add', 'discord', '--credentials-stdin'], 'nope'],
      [['im-app-remove', 'discord'], ''],
    ] as const)
      expect((await invoke([...argv], live.url, stdin)).json.error.code).toBe('usage');
    expect(live.calls).toHaveLength(3);
  });

  it('binds, inspects and unbinds an app for a Bot by its app reference', async () => {
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'messagingApps'
          ? APPS
          : method === 'messagingSnapshot'
            ? SNAPSHOT
            : { identity: { id: 'new' } },
    }));
    await invoke(['im-bind', 'ada', '--app', 'discord_1'], live.url);
    expect(live.calls.slice(0, 2)).toEqual([
      { method: 'messagingApps', args: {} },
      {
        method: 'messagingIdentity',
        args: {
          slug: 'ada',
          input: {
            kind: 'bind',
            providerId: 'dsh-im/discord',
            accountRef: 'discord_1',
            fingerprint: 'f'.repeat(64),
          },
        },
      },
    ]);
    const status = await invoke(['im-status', 'ada'], live.url);
    expect(status.json).toEqual({
      apps: [{ ref: 'discord_1', platform: 'discord', name: 'Mascot', connected: true }],
      bindings: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          app: 'discord_1',
          platform: 'discord',
          name: 'Mascot',
          enabled: true,
          availability: 'available',
          reception: 'receiving',
          conversations: 1,
        },
      ],
    });
    await invoke(['im-unbind', 'ada', '--app', 'discord_1'], live.url);
    expect(live.calls.at(-1)).toEqual({
      method: 'messagingIdentity',
      args: {
        slug: 'ada',
        input: { kind: 'unbind', id: '11111111-1111-4111-8111-111111111111', expectedRevision: 2 },
      },
    });
    expect((await invoke(['im-bind', 'ada', '--app', 'missing'], live.url)).json.error.code).toBe(
      'unknown-app',
    );
    expect((await invoke(['im-unbind', 'ada', '--app', 'missing'], live.url)).json.error.code).toBe(
      'unknown-binding',
    );
  });

  it("connects an external group conversation to a Channel through the Bot's binding", async () => {
    const live = await host((method) => ({
      ok: true,
      value: method === 'messagingSnapshot' ? SNAPSHOT : { updated: true, ingests: [] },
    }));
    await invoke(
      [
        'channel-connect',
        'group-skill-lab',
        '--bot',
        'ada',
        '--conversation',
        '1559627569060516002',
      ],
      live.url,
    );
    await invoke(['channel-ingests', 'group-skill-lab'], live.url);
    expect(live.calls).toEqual([
      { method: 'messagingSnapshot', args: { slug: 'ada' } },
      {
        method: 'channelIngest',
        args: {
          channelId: 'group-skill-lab',
          input: {
            kind: 'add',
            bindingId: '11111111-1111-4111-8111-111111111111',
            conversation: { kind: 'group', id: '1559627569060516002' },
          },
        },
      },
      { method: 'channelIngests', args: { channelId: 'group-skill-lab' } },
    ]);
    expect(
      (await invoke(['channel-connect', 'group-skill-lab', '--bot', 'ada'], live.url)).json.error
        .code,
    ).toBe('usage');
  });
});
