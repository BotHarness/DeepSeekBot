import { createServer } from 'node:http';
import { join } from 'node:path';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createTempRoot } from './helpers.js';

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
async function host() {
  const calls: Array<{ path: string; input: Record<string, unknown> }> = [];
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      response
        .writeHead(302, { 'set-cookie': 'authority=test-owner; HttpOnly', location: '/' })
        .end();
      return;
    }
    if (request.headers.cookie !== 'authority=test-owner') {
      response.writeHead(401).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    const input = JSON.parse(Buffer.concat(chunks).toString());
    calls.push({ path: request.url ?? '', input });
    const value =
      input.method === 'botharness/memberCreate'
        ? {
            member: { username: 'bob', humanId: 'bob-id' },
            initialPassword: 'private-initial-password',
          }
        : input.method === 'botharness/members'
          ? [
              { humanId: 'bob-id', username: 'bob' },
              { humanId: 'local-human', username: 'owner' },
            ]
          : input.method === 'botharness/memberPasswordReset'
            ? { initialPassword: 'private-reset-password' }
            : { done: true };
    response.setHeader('content-type', 'application/json');
    if (request.url === '/api/botharness/team-as')
      response.end(
        JSON.stringify({
          ok: false,
          error: { code: 'remote-access/denied', message: 'member-call-refused' },
        }),
      );
    else
      response.end(
        JSON.stringify({
          type: 'server-response',
          rpcId: input.rpcId,
          result: { ok: true, value },
        }),
      );
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('missing address');
  return { calls, url: `http://127.0.0.1:${address.port}` };
}
async function run(url: string, args: string[], stdin = '') {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const status = await runBotCreateCli(args, {
    env: { DEEPSEEKBOT_HOST: url, DEEPSEEKBOT_HOST_TOKEN: 'private-test-token' },
    stdout: (line) => stdout.push(line),
    stderr: (line) => stderr.push(line),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return {
    status,
    text: stdout.join(''),
    errorText: stderr.join(''),
    output: JSON.parse(stdout.join('')),
  };
}
describe('Team CLI', () => {
  it('recovers a committed username into a new private file without printing its password', async () => {
    const f = await host();
    const path = join(createTempRoot('team-cli-reset-'), 'reset-password');
    const args = ['members', 'reset-password', 'bob', '--initial-password-file', path];
    const reset = await run(f.url, args);
    expect(reset.status).toBe(0);
    expect(reset.output).toEqual({ humanId: 'bob-id', initialPasswordFile: path });
    expect(readFileSync(path, 'utf8')).toBe('private-reset-password');
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(reset.text + reset.errorText).not.toContain('private-reset-password');
    expect(f.calls).toMatchObject([
      { input: { method: 'botharness/members' } },
      {
        input: {
          method: 'botharness/memberPasswordReset',
          payload: { args: { humanId: 'bob-id' } },
        },
      },
    ]);
    const count = f.calls.length;
    expect((await run(f.url, args)).output).toMatchObject({
      error: { code: 'password-file-unavailable' },
    });
    expect(f.calls).toHaveLength(count);
    const missing = join(createTempRoot('team-cli-missing-'), 'password');
    expect(
      (
        await run(f.url, [
          'members',
          'reset-password',
          'missing',
          '--initial-password-file',
          missing,
        ])
      ).output,
    ).toMatchObject({ error: { code: 'member-not-found' } });
    expect(existsSync(missing)).toBe(false);
  });
  it.each([
    'device-activity',
    'device-notifications',
    'phone-notifications',
    'device-pair',
    'device-probe',
  ])('refuses --as before %s device dispatch', async (command) => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', command]);
    expect(result.output).toMatchObject({ error: { code: 'as-command-unsupported' } });
    expect(f.calls).toHaveLength(0);
  });
  it.each([{ args: ['channels'] }, { args: ['channel-messages', 'group-1', '--as', 'bob'] }])(
    'refuses --home before early hosted dispatch: %j',
    async ({ args }) => {
      const f = await host();
      const result = await run(f.url, [...args, '--home', createTempRoot('team-cli-home-')]);
      expect(result.status).not.toBe(0);
      expect(f.calls).toHaveLength(0);
    },
  );
  it.each([
    [['team-mode', 'status'], 'teamMode', {}],
    [['team-mode', 'on'], 'teamModeSet', { enabled: true }],
    [['team-mode', 'off'], 'teamModeSet', { enabled: false }],
    [['team-mode', 'insecure-http', 'on', '--confirm'], 'teamInsecureHttpSet', { allowed: true }],
    [['members', 'list'], 'members', {}],
    [['channels', 'browse-public'], 'publicChannels', {}],
    [['channels', 'join-public', 'group-1'], 'publicChannelJoin', { channelId: 'group-1' }],
    [
      ['channels', 'set-public', 'group-1', 'on'],
      'channelPublicSet',
      { channelId: 'group-1', public: true },
    ],
  ] as const)('maps %j to the matching bridge contract', async (args, method, named) => {
    const f = await host();
    const result = await run(f.url, [...args]);
    expect(result.status).toBe(0);
    expect(f.calls).toMatchObject([
      { path: `/api/botharness/${method}`, input: { payload: { args: named } } },
    ]);
  });

  it('resolves an invitation username and prints only the bridge link JSON', async () => {
    const f = await host();
    const result = await run(f.url, ['members', 'invite', 'bob']);
    expect(result.status).toBe(0);
    expect(result.output).toEqual({ done: true });
    expect(f.calls.map((call) => call.path)).toEqual([
      '/api/botharness/members',
      '/api/botharness/memberInvitation',
    ]);
    expect(f.calls[1]?.input).toMatchObject({ payload: { args: { humanId: 'bob-id' } } });
    const missing = await run(f.url, ['members', 'invite', 'missing']);
    expect(missing.status).not.toBe(0);
    expect(missing.output).toMatchObject({ error: { code: 'member-not-found' } });
    expect(f.calls).toHaveLength(3);
  });

  it('dispatches self-pairing under the explicit member and retains the member refusal', async () => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', 'members', 'pairing-offer']);
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toEqual([
      {
        path: '/api/botharness/team-as',
        input: { username: 'bob', namespace: 'botharness', method: 'memberPairingOffer', args: {} },
      },
    ]);
  });

  it('reads Owner and member passwords only from stdin and requires confirmation for insecure HTTP', async () => {
    const f = await host();
    expect(
      (
        await run(
          f.url,
          ['team-mode', 'owner-password', '--password-stdin'],
          'secret-owner-password\n',
        )
      ).status,
    ).toBe(0);
    expect(f.calls[0]?.input).toMatchObject({
      payload: { args: { password: 'secret-owner-password' } },
    });
    const changed = await run(
      f.url,
      ['members', 'password', '--password-stdin'],
      '{"current":"first-password","next":"next-password"}',
    );
    expect(changed.status).toBe(0);
    expect(changed.text).not.toContain('first-password');
    const insecure = await run(f.url, ['team-mode', 'insecure-http', 'on']);
    expect(insecure.status).not.toBe(0);
  });

  it('writes the initial password to a new 0600 file and refuses an existing path before creating a member', async () => {
    const f = await host();
    const path = join(createTempRoot('team-cli-password-'), 'password');
    const args = [
      'members',
      'create',
      '--username',
      'bob',
      '--display-name',
      'Bob',
      '--initial-password-file',
      path,
    ];
    const created = await run(f.url, args);
    expect(created.status).toBe(0);
    expect(created.output).toMatchObject({ initialPasswordFile: path });
    expect(readFileSync(path, 'utf8')).toBe('private-initial-password');
    if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(created.text).not.toContain('private-initial-password');
    const callCount = f.calls.length;
    writeFileSync(path, 'keep-me');
    expect((await run(f.url, args)).status).not.toBe(0);
    expect(f.calls).toHaveLength(callCount);
    expect(readFileSync(path, 'utf8')).toBe('keep-me');
    expect(existsSync(path)).toBe(true);
  });

  it('dispatches --as through the Owner-only member endpoint and propagates the refusal without falling back', async () => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', 'channels', 'browse-public']);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toEqual([
      {
        path: '/api/botharness/team-as',
        input: { username: 'bob', namespace: 'botharness', method: 'publicChannels', args: {} },
      },
    ]);
  });
  it('never prints malformed password stdin and dispatches direct member Channel operations', async () => {
    const f = await host();
    const secret = '{secret-password-should-stay-private';
    const denied = await run(f.url, ['members', 'password', '--password-stdin'], secret);
    expect(denied.status).not.toBe(0);
    expect(denied.text + denied.errorText).not.toContain(secret);
    expect(f.calls).toHaveLength(0);
    const sent = await run(
      f.url,
      ['--as', 'bob', 'channels', 'send', 'group-1', '--body-stdin'],
      'A member message',
    );
    expect(sent.status).not.toBe(0);
    expect(f.calls[0]).toEqual({
      path: '/api/botharness/team-as',
      input: {
        username: 'bob',
        namespace: 'botharness',
        method: 'channelSend',
        args: { channelId: 'group-1', body: 'A member message' },
      },
    });
  });
  it('admits certificate-verified private LAN HTTPS for the local Owner CLI', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      if ((init?.method ?? 'GET') === 'GET')
        return new Response(null, {
          status: 302,
          headers: { 'set-cookie': 'authority=test-owner; HttpOnly; Secure' },
        });
      expect(url.origin).toBe('https://192.168.1.20');
      return Response.json({
        type: 'server-response',
        result: { ok: true, value: { enabled: false } },
      });
    });
    const result = await run('https://192.168.1.20', ['team-mode', 'status']);
    expect(result.status).toBe(0);
    const plain = await run('http://192.168.1.20', ['team-mode', 'status']);
    expect(plain.status).not.toBe(0);
  });
});
