import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeZip } from '../src/bots/zip-archive.js';
import { readBotZip } from '../src/bots/bot-zip.js';
import { afterEach, describe, expect, it } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';

const servers: ReturnType<typeof createServer>[] = [];
const directories: string[] = [];
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
  for (const root of directories.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function host(handler: (method: string, args: Record<string, unknown>) => unknown) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const server = createServer(async (req, res) => {
    if (req.method === 'GET') {
      expect(new URL(req.url!, 'http://localhost').searchParams.get('token')).toBe(
        'private-test-token',
      );
      res.writeHead(302, { 'set-cookie': 'authority=signed', location: '/' }).end();
      return;
    }
    expect(req.headers.cookie).toBe('authority=signed');
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk);
    if (req.url?.startsWith('/api/botharness/bot-zip/import')) {
      const args = {
        ...Object.fromEntries(new URL(req.url, 'http://localhost').searchParams),
        archive: Buffer.concat(chunks),
      };
      calls.push({ method: 'bot-zip/import', args });
      const result = handler('bot-zip/import', args);
      if (result === 'lost-response') {
        res.destroy();
        return;
      }
      const output = typeof result === 'object' && result !== null && 'error' in result;
      res.statusCode = output ? 500 : 200;
      res.end(JSON.stringify(result));
      return;
    }
    const input = JSON.parse(Buffer.concat(chunks).toString());
    const method = input.method.replace('botharness/', '');
    expect(req.url).toBe(`/api/${input.method}`);
    calls.push({ method, args: input.payload.args });
    const result = handler(method, input.payload.args);
    if (result === 'lost-response') {
      res.destroy();
      return;
    }
    res.end(JSON.stringify({ type: 'server-response', result }));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No address');
  return { calls, url: `http://127.0.0.1:${address.port}` };
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
  expect(stdout).toHaveLength(1);
  expect(stdout.join('') + stderr.join('')).not.toContain('private-test-token');
  return { code, value: JSON.parse(stdout[0]!) };
}

describe('online CLI management', () => {
  it('updates through the live owner with the caller-observed profile and supports clearing profile fields', async () => {
    const fingerprint = 'a'.repeat(64);
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'get'
          ? { bot: { slug: 'owned' }, profileFingerprint: fingerprint }
          : { bot: { slug: 'owned', description: '', roles: [] } },
    }));
    const shown = await invoke(['show', 'owned'], live.url);
    expect(shown.value.profileFingerprint).toBe(fingerprint);
    const result = await invoke(
      ['update', 'owned', '--expected-profile', fingerprint, '--description', '', '--role', ''],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(live.calls).toEqual([
      { method: 'get', args: { slug: 'owned' } },
      {
        method: 'update',
        args: {
          slug: 'owned',
          expectedProfile: fingerprint,
          patch: { description: '', roles: [] },
        },
      },
    ]);
  });

  it('rejects invalid online update flags before contacting the Host and never refreshes a stale profile', async () => {
    const live = await host(() => ({
      ok: false,
      error: { code: 'stale-profile', message: 'Profile changed' },
    }));
    for (const args of [
      ['update', 'owned', '--name', 'Changed'],
      [
        'update',
        'owned',
        '--name',
        'Changed',
        '--expected-profile',
        'a'.repeat(64),
        '--session',
        'other',
      ],
    ])
      expect((await invoke(args, live.url)).code).not.toBe(0);
    expect(live.calls).toEqual([]);
    const refused = await invoke(
      ['update', 'owned', '--name', 'Changed', '--expected-profile', 'a'.repeat(64)],
      live.url,
    );
    expect(refused.value.error.code).toBe('stale-profile');
    expect(live.calls).toEqual([
      {
        method: 'update',
        args: { slug: 'owned', expectedProfile: 'a'.repeat(64), patch: { displayName: 'Changed' } },
      },
    ]);
  });

  it('requires reviewed stdin deletion scope, retains Memory and passes stale scope refusal without retry', async () => {
    const live = await host((method) =>
      method === 'deletionConfirm'
        ? {
            ok: false,
            error: { code: 'botharness/invalid-input', message: 'Preview scope changed' },
          }
        : { ok: true, value: { preview: { token: 'reviewed-scope' } } },
    );
    expect((await invoke(['bot-delete-preview', 'owned'], live.url)).code).toBe(0);
    expect((await invoke(['bot-delete-confirm', 'owned'], live.url)).value.error.code).toBe(
      'usage',
    );
    expect(
      (
        await invoke(
          ['bot-delete-confirm', 'owned', '--confirmation-stdin', '--confirm'],
          live.url,
          '{"token":"reviewed-scope","eraseMemory":true}',
        )
      ).value.error.code,
    ).toBe('usage');
    const confirmed = await invoke(
      ['bot-delete-confirm', 'owned', '--confirmation-stdin', '--confirm'],
      live.url,
      '{"token":"reviewed-scope"}',
    );
    expect(confirmed.value.error.code).toBe('botharness/invalid-input');
    expect(live.calls).toEqual([
      { method: 'deletionPreview', args: { slug: 'owned' } },
      {
        method: 'deletionConfirm',
        args: { slug: 'owned', token: 'reviewed-scope', eraseMemory: false },
      },
    ]);
  });
  it('uploads local Zip bytes and metadata to the production import path, then configures the minted Bot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-cli-zip-'));
    directories.push(root);
    const archive = writeZip([
      { path: 'SOUL.md', data: Buffer.from('Reply using channel_send.') },
      { path: '.botharness/bot.json', data: Buffer.from('{"name":"Original"}') },
    ]);
    const path = join(root, 'shared.zip');
    writeFileSync(path, archive);
    const live = await host((method) =>
      method === 'bot-zip/import'
        ? { bot: { slug: 'minted', displayName: 'Override' } }
        : {
            ok: true,
            value: { bot: { slug: 'minted', displayName: 'Override', memoryDir: 'host/memory' } },
          },
    );
    const result = await invoke(
      [
        'create',
        '--from-zip',
        path,
        '--name',
        'Override',
        '--role',
        'QA',
        '--description',
        'Imported',
      ],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(live.calls[0]).toEqual({
      method: 'bot-zip/import',
      args: {
        name: 'shared.zip',
        displayName: 'Override',
        roles: '["QA"]',
        description: 'Imported',
        archive,
      },
    });
    expect(result.value.bot).toEqual({ id: 'minted', name: 'Override' });
    expect(live.calls.map((call) => call.method)).toEqual(['bot-zip/import', 'get', 'channelDm']);
  });

  it('packs caller-local directories rather than asking the Host to read a local path', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-cli-dir-'));
    directories.push(root);
    mkdirSync(join(root, 'notes'));
    writeFileSync(join(root, 'notes', 'test.md'), 'local content');
    const live = await host((method) =>
      method === 'bot-zip/import'
        ? { bot: { slug: 'minted', displayName: 'Bot' } }
        : {
            ok: true,
            value: { bot: { slug: 'minted', displayName: 'Bot', memoryDir: 'host/memory' } },
          },
    );
    expect((await invoke(['create', '--from-dir', root], live.url)).code).toBe(0);
    const uploaded = live.calls[0]?.args['archive'];
    if (!Buffer.isBuffer(uploaded)) throw new Error('No archive uploaded');
    expect(readBotZip(uploaded).files.map((file) => file.path)).toEqual(['notes/test.md']);
    expect(Object.keys(live.calls[0]!.args)).toEqual(['archive']);
  });

  it('preserves a known imported identity when the HTTP owner cannot read back its detail', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-cli-import-error-'));
    directories.push(root);
    const path = join(root, 'shared.zip');
    writeFileSync(path, writeZip([{ path: 'SOUL.md', data: Buffer.from('hello') }]));
    const live = await host(() => ({
      error: { code: 'detail-unavailable', message: 'Cannot read detail' },
      bot: { id: 'minted', name: 'Bot' },
      outcome: 'created',
    }));
    const result = await invoke(['create', '--from-zip', path], live.url);
    expect(result.value).toMatchObject({
      outcome: 'created',
      bot: { id: 'minted' },
      steps: [{ name: 'validate' }, { name: 'create-bot' }],
      error: { code: 'detail-unavailable' },
    });
    expect(live.calls).toHaveLength(1);
  });

  it('expands GitHub shorthand for the owning Host and never forwards a Model Preset as an Agent preset', async () => {
    const live = await host(() => ({
      ok: true,
      value: { bot: { slug: 'minted', displayName: 'Repo', memoryDir: 'host/memory' } },
    }));
    const result = await invoke(
      ['create', '--name', 'Repo', '--from-git', 'BotHarness/DeepSeekBot', '--role', 'QA'],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(live.calls[0]).toEqual({
      method: 'createFromGit',
      args: {
        displayName: 'Repo',
        gitUrl: 'https://github.com/BotHarness/DeepSeekBot.git',
        roles: ['QA'],
      },
    });
    expect(result.value.steps).toContainEqual({ name: 'clone', status: 'ok' });
  });

  it('rejects an invalid local archive before contacting the Host', async () => {
    const root = mkdtempSync(join(tmpdir(), 'botharness-cli-badzip-'));
    directories.push(root);
    const path = join(root, 'bad.zip');
    writeFileSync(path, 'not an archive');
    const live = await host(() => ({ ok: true, value: {} }));
    const result = await invoke(['create', '--from-zip', path], live.url);
    expect(result.value.error.code).toBe('bad-zip');
    expect(live.calls).toEqual([]);
  });
  it('uses Host-created identity and applies a Model Preset without passing it as a native Agent preset', async () => {
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'modelPresets'
          ? { presets: [{ id: 'preset' }] }
          : { bot: { slug: 'minted', displayName: 'Ada', memoryDir: 'host/memory' } },
    }));
    const result = await invoke(
      [
        'create',
        '--name',
        'Ada',
        '--persona-stdin',
        '--role',
        'QA',
        '--preset',
        'preset',
        '--compact',
      ],
      live.url,
      'Answer in the DM.',
    );
    expect(result.code).toBe(0);
    expect(result.value).toMatchObject({
      bot: { id: 'minted', name: 'Ada' },
      dm: { channelId: 'dm-minted' },
      dataDir: 'host/memory',
    });
    expect(live.calls.map((call) => call.method)).toEqual([
      'modelPresets',
      'create',
      'modelPresetApply',
      'get',
      'channelDm',
    ]);
    expect(live.calls[1]?.args).toEqual({
      displayName: 'Ada',
      persona: 'Answer in the DM.',
      roles: ['QA'],
    });
    expect(live.calls[2]?.args).toEqual({ slug: 'minted', presetId: 'preset' });
  });

  it('forwards a chosen Memory location to the Host create owner', async () => {
    const live = await host((method) => ({
      ok: true,
      value: { bot: { slug: 'minted', displayName: 'Ada', memoryDir: '/data/bots/minted' } },
    }));
    const result = await invoke(
      ['create', '--name', 'Ada', '--memory-location', '/data/bots', '--compact'],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(result.value).toMatchObject({ dataDir: '/data/bots/minted' });
    expect(live.calls[0]).toMatchObject({
      method: 'create',
      args: { displayName: 'Ada', memoryLocation: '/data/bots' },
    });
  });

  it('rejects a known missing preset before minting any identity', async () => {
    const live = await host(() => ({ ok: true, value: { presets: [] } }));
    const result = await invoke(['create', '--name', 'Ada', '--preset', 'missing'], live.url);
    expect(result.value).toMatchObject({
      error: { code: 'unknown-preset' },
      outcome: 'not-created',
    });
    expect(live.calls.map((call) => call.method)).toEqual(['modelPresets']);
  });

  it('retains identity and completed stages when model application is refused', async () => {
    const live = await host((method) =>
      method === 'modelPresetApply'
        ? { ok: false, error: { code: 'catalog-unavailable', message: 'Model unavailable' } }
        : {
            ok: true,
            value:
              method === 'modelPresets'
                ? { presets: [{ id: 'preset' }] }
                : { bot: { slug: 'minted', displayName: 'Ada' } },
          },
    );
    const result = await invoke(['create', '--name', 'Ada', '--preset', 'preset'], live.url);
    expect(result.code).toBe(1);
    expect(result.value).toMatchObject({
      bot: { id: 'minted' },
      outcome: 'created',
      error: { code: 'catalog-unavailable' },
      steps: [{ name: 'validate' }, { name: 'create-bot' }],
    });
    expect(live.calls.map((call) => call.method)).toEqual([
      'modelPresets',
      'create',
      'modelPresetApply',
    ]);
  });

  it('carries a stable creation key and returns the canonical receipt', async () => {
    const operationKey = 'human-create-operation-01';
    const live = await host((method) => ({
      ok: true,
      value: {
        bot: { slug: 'minted', displayName: 'Ada', memoryDir: 'host/memory' },
        ...(method === 'create'
          ? {
              receipt: {
                operationKey,
                botSlug: 'minted',
                status: 'created',
                channelId: 'dm-minted',
              },
            }
          : {}),
      },
    }));
    const result = await invoke(
      ['create', '--name', 'Ada', '--operation-key', operationKey],
      live.url,
    );
    expect(result.code).toBe(0);
    expect(live.calls[0]?.args).toEqual({ displayName: 'Ada', operationKey });
    expect(result.value.operation).toEqual({
      operationKey,
      botSlug: 'minted',
      status: 'created',
      channelId: 'dm-minted',
    });
  });

  it('returns the stable key after a lost response and refuses ambiguous keyed creation modes', async () => {
    const live = await host(() => 'lost-response');
    const operationKey = 'human-create-operation-02';
    const result = await invoke(
      ['create', '--name', 'Ada', '--operation-key', operationKey],
      live.url,
    );
    expect(result.value).toMatchObject({
      outcome: 'unknown',
      operation: { operationKey, status: 'unknown' },
    });
    expect(live.calls).toHaveLength(1);
    for (const flags of [
      ['--preset', 'preset'],
      ['--memory-location', '/tmp'],
      ['--from-git', 'owner/repo'],
    ])
      expect(
        (
          await invoke(
            ['create', '--name', 'Ada', '--operation-key', operationKey, ...flags],
            live.url,
          )
        ).value.error.code,
      ).toBe('usage');
    expect(live.calls).toHaveLength(1);
  });

  it('marks a lost create response unknown and never resends the mutation', async () => {
    const live = await host(() => 'lost-response');
    const result = await invoke(['create', '--name', 'Ada'], live.url);
    expect(result.value).toMatchObject({ error: { code: 'host-unreachable' }, outcome: 'unknown' });
    expect(result.value.bot).toBeUndefined();
    expect(live.calls.map((call) => call.method)).toEqual(['create']);
  });

  it('rejects ambiguous home and unsupported online writes before opening local data', async () => {
    const live = await host(() => ({ ok: true, value: {} }));
    expect(
      (await invoke(['create', '--name', 'Ada', '--home', 'unused-home'], live.url)).value.error
        .code,
    ).toBe('usage');
    expect(
      (await invoke(['schedule-create', 'ada', '--home', 'unused-home'], live.url)).value.error
        .code,
    ).toBe('usage');
    expect(
      (await invoke(['send', 'ada', '--body', 'hello', '--home', 'unused-home'], live.url)).value
        .error.code,
    ).toBe('usage');
    expect(live.calls).toEqual([]);
  });

  it.each([false, true])(
    'retries accepted cleanup without overriding eraseMemory=%s',
    async (eraseMemory) => {
      const live = await host((method) => ({
        ok: true,
        value:
          method === 'deletionPreview'
            ? { preview: { deletion: { eraseMemory, phase: 'incomplete' } } }
            : { deletion: { eraseMemory, phase: 'complete' } },
      }));
      expect((await invoke(['bot-delete-retry', 'owned'], live.url)).value.error.code).toBe(
        'usage',
      );
      expect(
        (await invoke(['bot-delete-retry', 'owned', '--confirm', '--erase-memory'], live.url)).value
          .error.code,
      ).toBe('usage');
      const result = await invoke(['bot-delete-retry', 'owned', '--confirm'], live.url);
      expect(result.value.deletion).toEqual({ eraseMemory, phase: 'complete' });
      expect(live.calls).toEqual([
        { method: 'deletionPreview', args: { slug: 'owned' } },
        { method: 'deletionRetry', args: { slug: 'owned' } },
      ]);
    },
  );

  it('refuses retry without an accepted deletion and never submits a new scope', async () => {
    const live = await host(() => ({ ok: true, value: { preview: { token: 'unaccepted' } } }));
    const result = await invoke(['bot-delete-retry', 'owned', '--confirm'], live.url);
    expect(result.value.error.code).toBe('usage');
    expect(live.calls).toEqual([{ method: 'deletionPreview', args: { slug: 'owned' } }]);
  });

  it('requires explicit confirmation and an explicit flag to erase reviewed Memory', async () => {
    const live = await host(() => ({ ok: true, value: { deletion: { memory: 'erased' } } }));
    const token = JSON.stringify({ token: 'reviewed-scope' });
    expect(
      (
        await invoke(
          ['bot-delete-confirm', 'owned', '--confirmation-stdin', '--erase-memory'],
          live.url,
          token,
        )
      ).value.error.code,
    ).toBe('usage');
    expect(
      (
        await invoke(
          ['bot-delete-confirm', 'owned', '--confirmation-stdin', '--confirm', '--erase-memory'],
          live.url,
          token,
        )
      ).code,
    ).toBe(0);
    expect(live.calls).toEqual([
      {
        method: 'deletionConfirm',
        args: { slug: 'owned', token: 'reviewed-scope', eraseMemory: true },
      },
    ]);
  });

  it('queries only the owner-selected Memory folder and passes its coded refusal through', async () => {
    const target = { path: '/host/memory/owned', relativePath: '.', kind: 'directory' };
    const live = await host((_method, args) =>
      args.slug === 'missing'
        ? {
            ok: false,
            error: { code: 'botharness/invalid-input', message: 'Memory folder unavailable' },
          }
        : { ok: true, value: { target } },
    );
    expect((await invoke(['bot-delete-memory-folder', 'owned'], live.url)).value).toEqual({
      target,
    });
    expect(
      (await invoke(['bot-delete-memory-folder', 'owned', '--path', '/unrelated'], live.url)).value
        .error.code,
    ).toBe('usage');
    expect((await invoke(['bot-delete-memory-folder', 'missing'], live.url)).value.error.code).toBe(
      'botharness/invalid-input',
    );
    expect(live.calls).toEqual([
      { method: 'deletionMemoryFolder', args: { slug: 'owned' } },
      { method: 'deletionMemoryFolder', args: { slug: 'missing' } },
    ]);
  });

  it('queries Channel discovery and bounded attention and Session summaries through their owners', async () => {
    const live = await host((method) => ({
      ok: true,
      value:
        method === 'sessions'
          ? {
              sessions: [
                { createdAt: '2026-01-01', sessionId: 'old' },
                { createdAt: '2026-02-01', sessionId: 'new' },
              ],
            }
          : { channels: [], items: [] },
    }));
    expect((await invoke(['channels'], live.url)).code).toBe(0);
    expect(
      (
        await invoke(
          ['bot-attention', 'ada', '--limit', '10', '--cursor', 'source', '--state', 'handled'],
          live.url,
        )
      ).code,
    ).toBe(0);
    const sessions = await invoke(['bot-sessions', 'ada', '--limit', '1'], live.url);
    expect(sessions.value).toEqual({
      sessions: [{ createdAt: '2026-02-01', sessionId: 'new' }],
      total: 2,
    });
    expect(live.calls[1]).toEqual({
      method: 'botAttention',
      args: { slug: 'ada', limit: 10, cursor: 'source', state: 'handled' },
    });
    const invalid = await invoke(['bot-sessions', 'ada', '--limit', '0'], live.url);
    expect(invalid.value.error.code).toBe('usage');
    expect(live.calls).toHaveLength(3);
  });
});
