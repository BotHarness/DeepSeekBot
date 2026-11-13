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
    expect(statSync(path).mode & 0o777).toBe(0o600);
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

describe('M2 CLI member Bot and Activity dispatch', () => {
  it.each([
    { argv: ['bots', 'list'], method: 'list', stdin: '' },
    { argv: ['bots', 'list', '--administration'], method: 'list', stdin: '' },
    { argv: ['bots', 'show', 'alice-bot'], method: 'get', stdin: '' },
    {
      argv: ['bots', 'create', '--name', 'Member Bot', '--operation-key', 'member-cli-0001'],
      method: 'create',
      stdin: '',
    },
    {
      argv: ['bots', 'delete', 'alice-bot', '--confirm', '--confirmation-stdin'],
      method: 'deletionConfirm',
      stdin: '{"token":"reviewed-deletion-token"}',
    },
    { argv: ['activity', 'list'], method: 'humanAttention', stdin: '' },
  ])('keeps $method on the member Peer without Owner fallback', async ({ argv, method, stdin }) => {
    const f = await host();
    const result = await run(f.url, ['--as', 'bob', ...argv], stdin);
    expect(result.status).not.toBe(0);
    expect(result.output).toMatchObject({ error: { code: 'remote-access/denied' } });
    expect(f.calls).toEqual([
      expect.objectContaining({
        path: '/api/botharness/team-as',
        input: expect.objectContaining({ username: 'bob', namespace: 'botharness', method }),
      }),
    ]);
  });
});
