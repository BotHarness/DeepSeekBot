import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
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

const setups = ['feishu', 'weixin'].map((platform) => ({
  version: 1,
  platform,
  providerId: `dsh-im/${platform}`,
  endpoint: 'dsh-im/app-setup',
  kind: platform === 'feishu' ? 'credentials' : 'qr',
}));
const attempt = (state: string, channel = 'weixin', extra = {}) => ({
  version: 1,
  attemptId: 'attempt-1',
  channel,
  state,
  expiresAt: 123456,
  ...extra,
});
const ready = (channel = 'weixin') => ({
  ...attempt('ready', channel),
  accountRef: 'account-1',
  description: {
    version: 1,
    channel,
    botId: 'account-1',
    connected: true,
    account: { fingerprint: 'a'.repeat(64), name: 'private-profile-name' },
  },
});

async function host(handler: (method: string, payload: Record<string, unknown>) => unknown) {
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  const server = createServer(
    requestListener(async (req, res) => {
      if (req.method === 'GET') {
        expect(new URL(req.url!, 'http://localhost').searchParams.get('token')).toBe(
          'private-host-token',
        );
        res.writeHead(302, { 'set-cookie': 'authority=signed; HttpOnly', location: '/' }).end();
        return;
      }
      expect(req.headers.cookie).toBe('authority=signed');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      expect(body.type).toBe('client-request');
      expect(req.url).toBe(`/api/${body.method}`);
      calls.push({ method: body.method, payload: body.payload });
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: body.rpcId,
          result: handler(body.method, body.payload),
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

async function invoke(argv: string[], url?: string, stdin = '', token = 'private-host-token') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: token },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  const text = stdout.join('') + stderr.join('');
  expect(text).not.toContain('private-host-token');
  expect(text).not.toContain('private-app-secret');
  expect(text).not.toContain('593827');
  expect(text).not.toContain('private-profile-name');
  return { code, json: JSON.parse(stdout[0]!), text };
}

describe('Provider-owned IM application authorization CLI', () => {
  it.each(['pairing-status', 'im-cancel'])(
    'retains an attempt when the Host is down: %s',
    async (command) => {
      const result = await invoke([command, 'attempt-1', '--timeout', '0.1'], 'http://127.0.0.1:1');
      expect(result.json).toMatchObject({
        error: { code: 'host-unreachable' },
        authorization: { attemptId: 'attempt-1' },
      });
    },
  );

  it('retains an attempt when Host authority is missing', async () => {
    const result = await invoke(['pairing-status', 'attempt-1'], 'http://127.0.0.1:1', '', '');
    expect(result.json).toMatchObject({
      error: { code: 'host-unauthorized' },
      authorization: { attemptId: 'attempt-1' },
    });
  });

  it('retains an attempt when Host login refuses its token', async () => {
    const server = createServer((_req, res) => res.writeHead(403).end());
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('missing address');
    const result = await invoke(
      ['pairing-status', 'attempt-1'],
      `http://127.0.0.1:${address.port}`,
    );
    expect(result.json).toMatchObject({
      error: { code: 'host-unauthorized' },
      authorization: { attemptId: 'attempt-1' },
    });
  });

  it.each([
    'private-app-secret',
    'account-private-app-secret',
    'account-private-app-secret%20suffix',
  ])('refuses secret echoes in otherwise valid account identity: %s', async (accountRef) => {
    const value = ready('feishu');
    value.accountRef = accountRef;
    value.description.botId = accountRef;
    const live = await host(() => ({ ok: true, value }));
    const result = await invoke(
      ['im-credentials', 'attempt-1', '--credentials-stdin'],
      live.url,
      JSON.stringify({ appId: 'cli_test', appSecret: 'private-app-secret', domain: 'feishu' }),
    );
    expect(result.json).toMatchObject({
      error: { code: 'host-protocol-error' },
      authorization: { attemptId: 'attempt-1' },
    });
  });

  it('refuses verification echoes in allowed success fields', async () => {
    const value = ready();
    value.accountRef = 'account-593827';
    value.description.botId = value.accountRef;
    const live = await host(() => ({ ok: true, value }));
    const result = await invoke(
      ['im-verify', 'attempt-1', '--verification-stdin'],
      live.url,
      '593827',
    );
    expect(result.json.error.code).toBe('host-protocol-error');
  });

  it('discovers qualified flows without passing Provider endpoint names from argv', async () => {
    const live = await host(() => ({
      ok: true,
      value: {
        setups: [...setups, { ...setups[0], endpoint: 'another-owner', platform: 'slack' }],
      },
    }));
    const result = await invoke(['im-apps'], live.url);
    expect(result.code).toBe(0);
    expect(result.json.providers).toEqual([
      { platform: 'feishu', providerId: 'dsh-im/feishu', kind: 'credentials' },
      { platform: 'weixin', providerId: 'dsh-im/weixin', kind: 'qr' },
    ]);
    expect(live.calls).toEqual([{ method: 'botharness/messagingApps', payload: { args: {} } }]);
  });

  it('starts a native QR attempt and resumes the same attempt in another invocation', async () => {
    const qrDataUrl = 'data:image/png;base64,YWJj';
    const live = await host((method, payload) => ({
      ok: true,
      value:
        method === 'botharness/messagingApps'
          ? { setups }
          : payload['method'] === 'setup.start'
            ? attempt('pending', 'weixin', { qrDataUrl, appSecret: 'private-app-secret' })
            : ready(),
    }));
    const started = await invoke(['im-authorize', 'weixin'], live.url);
    expect(started.json.authorization.qrDataUrl).toBe(qrDataUrl);
    const polled = await invoke(['pairing-status', started.json.authorization.attemptId], live.url);
    expect(polled.json.authorization).toMatchObject({
      state: 'ready',
      accountRef: 'account-1',
      fingerprint: 'a'.repeat(64),
    });
    expect(live.calls.slice(1)).toEqual([
      {
        method: 'dsh-im/app-setup',
        payload: { method: 'setup.start', payload: { channel: 'weixin' } },
      },
      {
        method: 'dsh-im/app-setup',
        payload: { method: 'setup.poll', payload: { attemptId: 'attempt-1' } },
      },
    ]);
  });

  it('submits credentials only to the native purpose-bound payload and projects the result', async () => {
    const live = await host(() => ({ ok: true, value: ready('feishu') }));
    const result = await invoke(
      ['im-credentials', 'attempt-1', '--credentials-stdin'],
      live.url,
      JSON.stringify({ appId: 'cli_test', appSecret: 'private-app-secret', domain: 'feishu' }),
    );
    expect(result.code).toBe(0);
    expect(live.calls).toEqual([
      {
        method: 'dsh-im/app-setup',
        payload: {
          method: 'setup.credentials',
          payload: {
            attemptId: 'attempt-1',
            appId: 'cli_test',
            appSecret: 'private-app-secret',
            domain: 'feishu',
          },
        },
      },
    ]);
  });

  it('keeps verification stdin out of output even when a Provider error echoes it', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'unexpected-593827', message: 'private-app-secret 593827' },
    }));
    const result = await invoke(
      ['im-verify', 'attempt-1', '--verification-stdin'],
      live.url,
      '593827\n',
    );
    expect(live.calls[0]?.payload).toEqual({
      method: 'setup.verify',
      payload: { attemptId: 'attempt-1', verifyCode: '593827' },
    });
    expect(result.json).toMatchObject({
      error: { code: 'setup-failed' },
      authorization: { attemptId: 'attempt-1' },
    });
  });

  it.each([
    ['im-credentials', 'attempt-1', 'private-app-secret'],
    ['im-verify', 'attempt-1', '593827'],
    ['im-authorize', 'weixin', '--app-secret', 'private-app-secret'],
    ['im-verify', 'attempt-1', '--verify-code=593827'],
  ])('refuses secret arguments before contacting the Host: %j', async (...argv) => {
    const live = await host(() => ({ ok: true, value: {} }));
    expect((await invoke(argv, live.url)).json.error.code).toBe('secret-in-argv');
    expect(live.calls).toHaveLength(0);
  });

  it.each([
    'not-json',
    '{"appId":"cli_test","appSecret":"private-app-secret","domain":"invalid"}',
    '{"appId":"cli_test","appSecret":"private-app-secret","domain":"feishu","extra":true}',
  ])('refuses malformed credential stdin without mutation', async (stdin) => {
    const live = await host(() => ({ ok: true, value: {} }));
    expect(
      (await invoke(['im-credentials', 'attempt-1', '--credentials-stdin'], live.url, stdin)).json
        .error.code,
    ).toBe('usage');
    expect(live.calls).toHaveLength(0);
  });

  it('leaves Human verification actionable rather than polling indefinitely', async () => {
    const live = await host(() => ({ ok: true, value: attempt('needs_verification') }));
    const result = await invoke(['pairing-status', 'attempt-1', '--wait'], live.url);
    expect(result.code).toBe(0);
    expect(result.json.authorization.next[0]).toContain('--verification-stdin');
    expect(live.calls).toHaveLength(1);
  });

  it('polls pending to ready without starting another authorization', async () => {
    let calls = 0;
    const live = await host(() => ({
      ok: true,
      value: ++calls === 1 ? attempt('scanned') : ready(),
    }));
    expect(
      (await invoke(['pairing-status', 'attempt-1', '--wait'], live.url)).json.authorization.state,
    ).toBe('ready');
    expect(live.calls.map((call) => call.payload['method'])).toEqual(['setup.poll', 'setup.poll']);
  });

  it('returns a resumable attempt on the command deadline', async () => {
    const live = await host(() => ({ ok: true, value: attempt('pending') }));
    const result = await invoke(
      ['pairing-status', 'attempt-1', '--wait', '--timeout', '0.05'],
      live.url,
    );
    expect(result.json).toMatchObject({
      error: { code: 'authorization-timeout' },
      authorization: { attemptId: 'attempt-1' },
    });
  });

  it('rejects a platform change while waiting on the same attempt', async () => {
    let calls = 0;
    const live = await host(() => ({
      ok: true,
      value: ++calls === 1 ? attempt('pending') : ready('feishu'),
    }));
    expect(
      (await invoke(['pairing-status', 'attempt-1', '--wait'], live.url)).json.error.code,
    ).toBe('host-protocol-error');
  });

  it.each(['expired', 'failed', 'cancelled'])('classifies terminal %s attempts', async (state) => {
    const live = await host(() => ({ ok: true, value: attempt(state) }));
    expect((await invoke(['pairing-status', 'attempt-1'], live.url)).json.error.code).toBe(
      `authorization-${state}`,
    );
  });

  it('cancels explicitly without treating an acknowledgement as a polling failure', async () => {
    const live = await host(() => ({ ok: true, value: attempt('cancelled') }));
    expect((await invoke(['im-cancel', 'attempt-1'], live.url)).code).toBe(0);
    expect(live.calls[0]?.payload['method']).toBe('setup.cancel');
  });

  it.each([
    attempt('pending', 'weixin', { attemptId: 'another-attempt' }),
    attempt('pending', 'weixin', { qrDataUrl: 'https://private-app-secret.invalid' }),
    attempt('ready'),
    { ...ready(), description: { ...ready().description, channel: 'feishu' } },
  ])('refuses malformed or uncorrelated Provider responses: %j', async (value) => {
    const live = await host(() => ({ ok: true, value }));
    expect((await invoke(['pairing-status', 'attempt-1'], live.url)).json.error.code).toBe(
      'host-protocol-error',
    );
  });

  it('keeps Provider expiry coded across independent invocations', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'setup-expired', message: 'private-app-secret' },
    }));
    expect((await invoke(['pairing-status', 'attempt-1'], live.url)).json.error.code).toBe(
      'setup-expired',
    );
  });

  it('refuses unsupported Providers before starting an attempt', async () => {
    const live = await host(() => ({ ok: true, value: { setups: [] } }));
    expect((await invoke(['im-authorize', 'weixin'], live.url)).json.error.code).toBe(
      'capability-unavailable',
    );
    expect(live.calls).toHaveLength(1);
  });
});
