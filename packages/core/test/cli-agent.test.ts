import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
async function broker(
  result: unknown = {
    ok: true,
    value: { scope: 'global', revision: 4, value: { assignmentConcurrencyLimit: 3 } },
  },
) {
  const calls: unknown[] = [];
  const server = createServer(async (req, res) => {
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/invoke');
    expect(req.headers.authorization).toBe('Bearer scoped-secret');
    expect(req.headers.cookie).toBeUndefined();
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push(JSON.parse(Buffer.concat(chunks).toString()));
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  return { endpoint: `http://127.0.0.1:${address.port}`, calls };
}
async function invoke(
  argv: string[],
  endpoint?: string,
  stdin = '',
  extra: NodeJS.ProcessEnv = {},
) {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const code = await runBotCreateCli(argv, {
    env: {
      DEEPSEEKBOT_AGENT_ENDPOINT: endpoint,
      DEEPSEEKBOT_AGENT_TOKEN: 'scoped-secret',
      DEEPSEEKBOT_HOST: 'http://127.0.0.1:1',
      DEEPSEEKBOT_HOST_TOKEN: 'human-secret',
      ...extra,
    },
    stdout: (text) => stdout.push(text),
    stderr: (text) => stderr.push(text),
    readStdin: async () => stdin,
  });
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toMatch(/scoped-secret|human-secret/);
  return { code, json: JSON.parse(stdout[0]!) };
}
describe('scoped Tob CLI', () => {
  it('discovers server capabilities without Human Host login and routes help there too', async () => {
    const live = await broker({
      ok: true,
      value: { commands: ['settings', 'settings-set'], scopes: ['global'] },
    });
    expect((await invoke(['capabilities'], live.endpoint)).json.commands).toEqual([
      'settings',
      'settings-set',
    ]);
    expect((await invoke(['--help'], live.endpoint)).code).toBe(0);
    expect(live.calls).toEqual([
      { command: 'capabilities', args: {} },
      { command: 'capabilities', args: {} },
    ]);
  });
  it('keeps a write open while its approval card waits, and a read on the short default', async () => {
    const live = await broker();
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    try {
      await invoke(['settings', 'botharness-client'], live.endpoint);
      await invoke(
        [
          'settings-set',
          'botharness-client',
          '--patch-stdin',
          '--expected-revision',
          '4',
          '--previous-value',
          '{"assignmentConcurrencyLimit":3}',
        ],
        live.endpoint,
        '{"assignmentConcurrencyLimit":5}',
      );
      expect(timeout.mock.calls.map(([ms]) => ms)).toEqual([120_000, 600_000]);
    } finally {
      timeout.mockRestore();
    }
  });
  it('reads only its permitted namespace and forwards the exact reviewed write without fetching newer state', async () => {
    const live = await broker();
    await invoke(['settings', 'botharness-client'], live.endpoint);
    const result = await invoke(
      [
        'settings-set',
        'botharness-client',
        '--patch-stdin',
        '--expected-revision',
        '4',
        '--previous-value',
        '{"assignmentConcurrencyLimit":3}',
      ],
      live.endpoint,
      '{"assignmentConcurrencyLimit":5}',
    );
    expect(result.code).toBe(0);
    expect(live.calls).toEqual([
      { command: 'settings', args: { ns: 'botharness-client' } },
      {
        command: 'settings-set',
        args: {
          ns: 'botharness-client',
          patch: { assignmentConcurrencyLimit: 5 },
          expectedRevision: 4,
          previousValue: { assignmentConcurrencyLimit: 3 },
        },
      },
    ]);
  });
  it('does not fall back to offline stores or Human credentials for unsupported commands and overrides', async () => {
    const live = await broker();
    for (const argv of [
      ['list', '--home', '/tmp/profile'],
      ['channel-create'],
      ['pause', 'tob', '--home', '/tmp/profile'],
      ['settings', 'other'],
      ['settings', 'botharness-client', '--host', 'http://127.0.0.1:1'],
      ['settings', 'botharness-client', '--token-file', '/tmp/private'],
      ['settings', 'botharness-client', '--home', '/tmp/profile'],
      ['settings', 'botharness-client', '--bot', 'tob'],
    ]) {
      expect((await invoke(argv, live.endpoint)).json.error.code).toBe('agent-scope-denied');
    }
    expect(live.calls).toEqual([]);
  });
  it('routes standard Bot arguments through the scoped broker and requires reviewed identity', async () => {
    const live = await broker({ ok: true, value: { accepted: true } });
    expect((await invoke(['create'], live.endpoint)).json.error.code).toBe('usage');
    expect((await invoke(['pause', 'helper'], live.endpoint)).json.error.code).toBe('usage');
    expect(
      (
        await invoke(
          ['create', '--name', 'Helper', '--operation-key', 'create-helper-1', '--persona-stdin'],
          live.endpoint,
          'Be helpful.',
        )
      ).code,
    ).toBe(0);
    expect(
      (
        await invoke(
          ['update', 'helper', '--name', 'Updated', '--expected-profile', 'opaque-fingerprint'],
          live.endpoint,
        )
      ).code,
    ).toBe(0);
    expect(
      (
        await invoke(
          ['bot-delete-confirm', 'helper', '--confirmation-stdin', '--confirm', '--erase-memory'],
          live.endpoint,
          '{"token":"preview-token"}',
        )
      ).code,
    ).toBe(0);
    expect(live.calls).toEqual([
      {
        command: 'create',
        args: { displayName: 'Helper', operationKey: 'create-helper-1', persona: 'Be helpful.' },
      },
      {
        command: 'update',
        args: {
          slug: 'helper',
          expectedProfile: 'opaque-fingerprint',
          patch: { displayName: 'Updated' },
        },
      },
      {
        command: 'bot-delete-confirm',
        args: { slug: 'helper', token: 'preview-token', confirm: true, eraseMemory: true },
      },
    ]);
  });
  it('rejects missing or remote broker context before any fallback', async () => {
    for (const endpoint of [
      undefined,
      'https://127.0.0.1:1234',
      'http://example.org:1234',
      'http://127.0.0.1:1234/path',
      'http://user:pass@127.0.0.1:1234',
    ])
      expect((await invoke(['settings', 'botharness-client'], endpoint)).json.error.code).toBe(
        'agent-context-invalid',
      );
    expect(
      (
        await invoke(['settings', 'botharness-client'], 'http://127.0.0.1:1234', '', {
          DEEPSEEKBOT_AGENT_TOKEN: undefined,
        })
      ).json.error.code,
    ).toBe('agent-context-invalid');
  });
  it('requires explicit reviewed snapshots and refuses invalid options or a wider patch before sending', async () => {
    const live = await broker();
    const base = ['settings-set', 'botharness-client', '--patch-stdin'];
    for (const flags of [
      [],
      ['--expected-revision', '4'],
      ['--expected-revision', '-1', '--previous-value', '{"assignmentConcurrencyLimit":3}'],
      ['--expected-revision', '4.5', '--previous-value', '{"assignmentConcurrencyLimit":3}'],
      ['--expected-revision', '1e2', '--previous-value', '{"assignmentConcurrencyLimit":3}'],
      [
        '--expected-revision',
        '9007199254740992',
        '--previous-value',
        '{"assignmentConcurrencyLimit":3}',
      ],
      ['--expected-revision', '4', '--previous-value', '{}'],
      ['--expected-revision', '4', '--previous-value', 'null'],
    ])
      expect(
        (await invoke([...base, ...flags], live.endpoint, '{"assignmentConcurrencyLimit":5}')).json
          .error.code,
      ).toBe('usage');
    expect((await invoke(base, live.endpoint, '{"theme":"dark"}')).json.error.code).toBe(
      'agent-scope-denied',
    );
    expect(live.calls).toEqual([]);
  });
  it('preserves the broker refusal code and redacts scoped authority from errors', async () => {
    const live = await broker({
      ok: false,
      error: { code: 'stale-setting', message: 'Changed scoped-secret' },
    });
    expect((await invoke(['settings', 'botharness-client'], live.endpoint)).json.error).toEqual({
      code: 'stale-setting',
      message: 'Changed [redacted]',
    });
  });
  it('marks lost write responses uncertain and never retries against Human Host', async () => {
    const live = await broker();
    await new Promise<void>((resolve) => servers[0]!.close(() => resolve()));
    const read = await invoke(['settings', 'botharness-client'], live.endpoint);
    expect(read.json.error.code).toBe('agent-unreachable');
    const write = await invoke(
      [
        'settings-set',
        'botharness-client',
        '--patch-stdin',
        '--expected-revision',
        '4',
        '--previous-value',
        '{"assignmentConcurrencyLimit":3}',
      ],
      live.endpoint,
      '{"assignmentConcurrencyLimit":5}',
    );
    expect(write.json.error.code).toBe('agent-write-uncertain');
    expect(live.calls).toEqual([]);
  });
});
