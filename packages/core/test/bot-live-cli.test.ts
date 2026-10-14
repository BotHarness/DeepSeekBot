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

describe('live CLI over the authenticated DSH carrier', () => {
  it('classifies an interrupted response body as a transport failure', async () => {
    const live = await host(() => ({}), true);
    const result = await invoke(['release-info', '--timeout', '0.1'], live.url);
    expect(result.json.error.code).toBe('host-unreachable');
  });
  it('sends once, polls a receipt, and resumes without sending again', async () => {
    let polls = 0;
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'get'
          ? { bot: { displayName: 'Ada' } }
          : method === 'channelSend'
            ? { message: { id: 'human-11111111-1111-4111-8111-111111111111', body: 'hello' } }
            : {
                sourceEventId: 'source',
                state: polls > 1 ? 'handled' : 'running',
                replies: ++polls > 1 ? [{ id: 'reply', body: 'hello back' }] : [],
              },
    }));
    const sent = await invoke(
      [
        'send',
        'ada',
        '--body-stdin',
        '--message-id',
        'human-11111111-1111-4111-8111-111111111111',
        '--compact',
      ],
      live.url,
      'hello',
    );
    expect(sent.code).toBe(0);
    expect(sent.json.receipt).toEqual({
      channelId: 'dm-ada',
      messageId: 'human-11111111-1111-4111-8111-111111111111',
    });
    expect(sent.json.replies[0].body).toBe('hello back');
    expect(sent.text.trim().split('\n')).toHaveLength(1);
    const resumed = await invoke(
      ['send-status', 'ada', '--message-id', 'human-11111111-1111-4111-8111-111111111111'],
      live.url,
    );
    expect(resumed.code).toBe(0);
    expect(live.calls.filter((call) => call.method === 'channelSend')).toEqual([
      {
        method: 'channelSend',
        args: {
          channelId: 'dm-ada',
          body: 'hello',
          messageId: 'human-11111111-1111-4111-8111-111111111111',
        },
      },
    ]);
  });

  it('retains the receipt on timeout and never retries the mutating RPC', async () => {
    const started = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(started);
    const live = await host((method) => {
      if (method === 'channelSendStatus') clock.mockReturnValue(started + 60_001);
      return {
        ok: true,
        value:
          method === 'get'
            ? { bot: { displayName: 'Ada' } }
            : method === 'channelSend'
              ? {}
              : { state: 'running', replies: [] },
      };
    });
    const result = await invoke(
      [
        'send',
        'ada',
        '--body',
        'slow',
        '--message-id',
        'human-22222222-2222-4222-8222-222222222222',
        '--timeout',
        '60',
      ],
      live.url,
    );
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('reply-timeout');
    expect(result.json.receipt.messageId).toBe('human-22222222-2222-4222-8222-222222222222');
    expect(live.calls.filter((call) => call.method === 'channelSend')).toHaveLength(1);
    expect(live.calls.filter((call) => call.method === 'channelSendStatus')).toHaveLength(1);
  });

  it('passes Host decision and question contracts through and preserves coded refusals', async () => {
    const live = await host((method) =>
      method === 'toolApprovalDecide'
        ? {
            ok: false,
            error: {
              code: 'botharness/invalid-input',
              message: 'no longer pending private-test-token',
            },
          }
        : { ok: true, value: { accepted: true } },
    );
    const decided = await invoke(
      ['tool-approval-decide', 'dm-ada', '--message-id', 'approval', '--outcome', 'rejected'],
      live.url,
    );
    expect(decided.json.error.code).toBe('botharness/invalid-input');
    await invoke(
      [
        'tool-approval-decide',
        'dm-ada',
        '--message-id',
        'approval',
        '--outcome',
        'allowed-always-kind',
      ],
      live.url,
    );
    expect(live.calls.at(-1)).toMatchObject({
      method: 'toolApprovalDecide',
      args: { channelId: 'dm-ada', messageId: 'approval', outcome: 'allowed-always-kind' },
    });
    expect(
      (
        await invoke(
          [
            'tool-approval-decide',
            'dm-ada',
            '--message-id',
            'approval',
            '--outcome',
            'allowed-always-all',
          ],
          live.url,
        )
      ).json.error.code,
    ).toBe('usage');
    const answer = { answers: [{ id: 'q1', selected: ['yes'], custom: 'details' }] };
    const answered = await invoke(
      ['user-question-answer', 'dm-ada', '--message-id', 'question', '--answer-stdin'],
      live.url,
      JSON.stringify(answer),
    );
    expect(answered.code).toBe(0);
    expect(live.calls.at(-1)?.args).toEqual({ channelId: 'dm-ada', messageId: 'question', answer });
  });

  it('rejects missing/unsafe origins, malformed answers and expired auth before mutation', async () => {
    expect((await invoke(['send', 'ada', '--body', 'hi'])).json.error.code).toBe('usage');
    expect((await invoke(['release-info'], 'http://example.com')).json.error.code).toBe('usage');
    const live = await host(() => ({ ok: true, value: {} }));
    expect((await invoke(['release-info'], live.url, '', 'expired')).json.error.code).toBe(
      'host-unauthorized',
    );
    expect(
      (
        await invoke(
          ['user-question-answer', 'dm-ada', '--message-id', 'q', '--answer-stdin'],
          live.url,
          '{}',
        )
      ).json.error.code,
    ).toBe('usage');
    expect(live.calls).toEqual([]);
  });

  it('fails closed on a stopped Host with a coded error', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    await new Promise<void>((resolve) => servers.pop()!.close(() => resolve()));
    const result = await invoke(['send', 'ada', '--body', 'hi'], live.url);
    expect(result.code).toBe(1);
    expect(result.json.error.code).toBe('host-unreachable');
  });

  it('submits declared private fields once from stdin and publishes only acceptance', async () => {
    const fields = { api_key: 'SYNTHETIC CLI KEY', api_secret: '  SYNTHETIC secret\n  ' };
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'privateInputStatus'
          ? { status: 'configured', unexpected: fields }
          : { accepted: true, unexpected: fields },
    }));
    const submitted = await invoke(
      ['ask-secret-submit', 'dm-ada', '--message-id', 'private-card', '--values-stdin'],
      live.url,
      JSON.stringify(fields),
    );
    expect(submitted.code).toBe(0);
    expect(submitted.json).toEqual({ accepted: true });
    expect(live.calls).toEqual([
      {
        method: 'privateInputSubmit',
        args: { channelId: 'dm-ada', messageId: 'private-card', values: fields },
      },
    ]);
    expect(
      (await invoke(['ask-secret-status', 'dm-ada', '--message-id', 'private-card'], live.url))
        .json,
    ).toEqual({ status: 'configured' });
    expect(
      (await invoke(['ask-secret-cancel', 'dm-ada', '--message-id', 'private-card'], live.url))
        .json,
    ).toEqual({ accepted: true });
    expect(submitted.text).not.toContain(fields.api_key);
  });

  it('does not echo confidential stdin or server error payloads and never retries submission', async () => {
    const canary = 'SYNTHETIC CLI ERROR CANARY';
    const live = await host(() => ({
      ok: false,
      error: { code: canary, message: canary },
    }));
    const argv = ['ask-secret-submit', 'dm-ada', '--message-id', 'private-card', '--values-stdin'];
    const failed = await invoke(argv, live.url, JSON.stringify({ api_key: canary }));
    expect(failed.code).toBe(1);
    expect(failed.json.error.code).toBe('private-input-not-accepted');
    expect(failed.text).not.toContain(canary);
    expect(live.calls).toHaveLength(1);
    const malformed = await invoke(argv, live.url, '{' + canary);
    expect(malformed.json.error.code).toBe('usage');
    expect(malformed.text).not.toContain(canary);
    const wrongType = await invoke(argv, live.url, JSON.stringify({ api_key: [canary] }));
    expect(wrongType.json.error.code).toBe('usage');
    expect(wrongType.text).not.toContain(canary);
    expect(live.calls).toHaveLength(1);
  });

  it.each(['configured', 'revoked', 'superseded', 'unavailable'])(
    'reports current account %s independently of configured request settlement',
    async (status) => {
      const live = await host((method) => ({
        ok: true,
        value: {
          status: method === 'privateInputStatus' ? 'configured' : status,
          secret: 'CANARY',
        },
      }));
      const account = await invoke(
        ['ask-secret-account-status', 'dm-ada', '--message-id', 'private-card'],
        live.url,
      );
      expect(account.code).toBe(0);
      expect(account.json).toEqual({ status });
      expect(live.calls).toEqual([
        {
          method: 'privateAccountStatus',
          args: {
            channelId: 'dm-ada',
            messageId: 'private-card',
          },
        },
      ]);
      expect(
        (await invoke(['ask-secret-status', 'dm-ada', '--message-id', 'private-card'], live.url))
          .json,
      ).toEqual({ status: 'configured' });
    },
  );

  it('opens a blank replacement once and returns only its new card id', async () => {
    const messageId = '11111111-1111-4111-8111-111111111111';
    const live = await host(() => ({ ok: true, value: { messageId, secret: 'CANARY' } }));
    const result = await invoke(
      ['ask-secret-replace', 'dm-ada', '--message-id', 'private-card'],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(result.json).toEqual({ messageId });
    expect(live.calls).toEqual([
      {
        method: 'privateInputReplace',
        args: {
          channelId: 'dm-ada',
          messageId: 'private-card',
        },
      },
    ]);
  });

  it('revokes once and publishes only bounded stop counts', async () => {
    const summary = { accepted: true, stopped: 2, completed: 1, uncertain: 0 };
    const live = await host(() => ({ ok: true, value: { ...summary, secret: 'CANARY' } }));
    const result = await invoke(
      ['ask-secret-revoke', 'dm-ada', '--message-id', 'private-card'],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(result.json).toEqual(summary);
    expect(live.calls).toEqual([
      {
        method: 'privateAccountRevoke',
        args: {
          channelId: 'dm-ada',
          messageId: 'private-card',
        },
      },
    ]);
  });

  it.each([
    { command: 'ask-secret-account-status', value: { status: ['configured'] } },
    { command: 'ask-secret-status', value: { status: ['configured'] } },
    { command: 'ask-secret-replace', value: { messageId: 'CANARY' } },
    { command: 'ask-secret-replace', value: {} },
    {
      command: 'ask-secret-revoke',
      value: { accepted: false, stopped: 0, completed: 0, uncertain: 0 },
    },
    {
      command: 'ask-secret-revoke',
      value: { accepted: true, stopped: -1, completed: 0, uncertain: 0 },
    },
    {
      command: 'ask-secret-revoke',
      value: { accepted: true, stopped: 0, completed: 0.5, uncertain: 0 },
    },
    {
      command: 'ask-secret-revoke',
      value: { accepted: true, stopped: 0, completed: 0, uncertain: 'CANARY' },
    },
  ])(
    'rejects invalid $command results without exposing payloads or retrying',
    async ({ command, value }) => {
      const live = await host(() => ({ ok: true, value: { ...value, secret: 'CANARY' } }));
      const result = await invoke([command, 'dm-ada', '--message-id', 'private-card'], live.url);
      expect(result.code).toBe(1);
      expect(result.json.error.code).toBe('private-input-not-accepted');
      expect(result.text).not.toContain('CANARY');
      expect(live.calls).toHaveLength(1);
    },
  );

  it('lists private accounts with only declared, value-free fields', async () => {
    const row = {
      account: 'synthetic',
      purpose: 'Check the controlled service',
      fields: [{ id: 'api_key', label: 'API key', required: true, value: 'CANARY' }],
      status: 'configured',
      configuredAt: '2026-10-12T00:00:00.000Z',
      channelId: 'dm-ada',
      messageId: 'private-card',
      references: { api_key: 'CANARY' },
    };
    const live = await host(() => ({
      ok: true,
      value: { status: 'ready', accounts: [row], secret: 'CANARY' },
    }));
    const result = await invoke(['ask-secret-accounts', 'ada'], live.url);
    expect(result.code).toBe(0);
    expect(result.json).toEqual({
      status: 'ready',
      accounts: [
        {
          account: 'synthetic',
          purpose: 'Check the controlled service',
          fields: [{ id: 'api_key', label: 'API key', required: true }],
          status: 'configured',
          configuredAt: '2026-10-12T00:00:00.000Z',
          channelId: 'dm-ada',
          messageId: 'private-card',
        },
      ],
    });
    expect(result.text).not.toContain('CANARY');
    expect(live.calls).toEqual([{ method: 'privateAccounts', args: { slug: 'ada' } }]);
    const refused = await host(() => ({ ok: false, error: { code: 'CANARY', message: 'CANARY' } }));
    const failed = await invoke(['ask-secret-accounts', 'ada'], refused.url);
    expect(failed.json.error.code).toBe('private-input-not-accepted');
    expect(failed.text).not.toContain('CANARY');
  });

  it.each(['ask-secret-account-status', 'ask-secret-replace', 'ask-secret-revoke'])(
    'requires a card and suppresses raw Owner refusal payloads for %s',
    async (command) => {
      const live = await host(() => ({ ok: false, error: { code: 'CANARY', message: 'CANARY' } }));
      expect((await invoke([command, 'dm-ada'], live.url)).json.error.code).toBe('usage');
      expect(live.calls).toHaveLength(0);
      const refused = await invoke([command, 'dm-ada', '--message-id', 'private-card'], live.url);
      expect(refused.json.error.code).toBe('private-input-not-accepted');
      expect(refused.text).not.toContain('CANARY');
      expect(live.calls).toHaveLength(1);
      const search = await invoke(['search', command]);
      expect(search.text).toContain(command);
    },
  );
});
