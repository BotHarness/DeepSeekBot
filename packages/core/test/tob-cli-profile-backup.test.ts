import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/bots/bot-create-cli.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { createProfileBackupHttp } from '../src/portability/http.js';
import type { ProfileBackupSource } from '../src/portability/package.js';
import { startTobCliBroker, type TobCliBroker } from '../src/tob/cli-broker.js';
import { createTobHostCliOperations, type TobHostCliRunner } from '../src/tob/cli-host-commands.js';
import { requestListener } from './async-listener.js';

const LAUNCH = 'synthetic-launch-token';
const route = { provider: 'deepseek', model: 'deepseek-chat' };
const catalog: ModelCatalog = {
  list: async () => [],
  validate: async () => undefined,
};
const roots: string[] = [];
const cores: BotHarnessCore[] = [];
const servers: Server[] = [];
const brokers: TobCliBroker[] = [];

afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function root() {
  const value = realpathSync(mkdtempSync(join(tmpdir(), 'bh-tob-backup-')));
  roots.push(value);
  return value;
}

function mount(home = root()) {
  const core = createCore({ dshHome: home });
  cores.push(core);
  return core;
}

async function serve(core: BotHarnessCore, log: string[]) {
  const source: ProfileBackupSource = {
    database: core.operationalDatabase,
    registry: core.registry,
    deletions: core.deletions,
    attachments: core.attachments,
    purge: core.contentPurge,
    version: 'test',
    runtimeVersions: async () => ({ host: '0.2.0-rc.1', tools: '0.2.0-rc.1' }),
    sessionCount: () => core.ownership.list().length,
    log: (line: string) => log.push(line),
  };
  const handler = createProfileBackupHttp(source, root(), core.profileRecovery, catalog);
  const server = createServer(
    requestListener(async (request, response) => {
      const url = new URL(request.url ?? '/', 'http://localhost');
      if (url.pathname === '/') {
        if (url.searchParams.get('token') !== LAUNCH) return void response.writeHead(401).end();
        response.setHeader('set-cookie', 'authority=synthetic; HttpOnly');
        return void response.writeHead(302, { location: '/' }).end();
      }
      if (request.headers.cookie !== 'authority=synthetic')
        return void response.writeHead(401).end();
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const reply = await handler(
        new Request(url, {
          method: request.method ?? 'GET',
          ...(request.method === 'POST' ? { body: new Uint8Array(Buffer.concat(chunks)) } : {}),
        }),
      );
      response.writeHead(reply.status, Object.fromEntries(reply.headers));
      response.end(Buffer.from(await reply.arrayBuffer()));
    }),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test listener');
  return `http://127.0.0.1:${address.port}`;
}

async function tob(origin: string) {
  const run: TobHostCliRunner = async ({ argv, stdin }) => {
    const stdout: string[] = [];
    const exitCode = await runBotCreateCli([...argv], {
      env: { DEEPSEEKBOT_HOST: origin, DEEPSEEKBOT_HOST_TOKEN: LAUNCH },
      stdout: (value) => stdout.push(value),
      stderr: () => {},
      readStdin: async () => stdin,
    });
    return {
      exitCode,
      stdout: stdout.join('\n').replaceAll(LAUNCH, '[redacted]'),
    };
  };
  const approve = vi.fn(async (_proposal: unknown) => {});
  const broker = await startTobCliBroker({
    signal: new AbortController().signal,
    authorize: () => {},
    approve,
    readSetting: () => ({ scope: 'global', value: 1, revision: 1 }),
    writeSetting: async () => ({ scope: 'global', value: 1, revision: 1 }),
    prepareOperation: createTobHostCliOperations({ run }),
    capabilities: [],
  });
  brokers.push(broker);
  const transcript: unknown[] = [];
  const invoke = async (argv: string[]) => {
    const response = await fetch(broker.endpoint + '/invoke', {
      method: 'POST',
      headers: {
        authorization: 'Bearer ' + broker.token,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command: 'cli', args: { argv } }),
    });
    const result = (await response.json()) as {
      ok: boolean;
      value?: Record<string, unknown>;
      error?: { code: string };
    };
    transcript.push(result);
    return result;
  };
  return { invoke, approve, transcript };
}

it('keeps the export confirmation out of Tob results, approval cards and Host logs through backup, restore and activation', async () => {
  const source = mount();
  expect(
    source.registry.create({
      slug: 'keeper',
      displayName: 'Keeper',
      persona: 'Synthetic Soul',
    }).ok,
  ).toBe(true);
  source.registry.applyModelPreset(
    'keeper',
    source.modelPresets.create({
      name: 'Plan',
      orchestrator: route,
      assignmentDefault: route,
    }),
  );
  const log: string[] = [];
  const f = await tob(await serve(source, log));
  const dir = root();
  const confirmation = join(dir, 'confirmation.json');
  const archive = join(dir, 'environment.botharness-backup');

  const review = await f.invoke(['profile-backup-preview']);
  expect(review).toMatchObject({
    ok: true,
    value: { bots: 1, confirmation: null },
  });
  expect(review.value).not.toHaveProperty('token');
  expect(f.approve).not.toHaveBeenCalled();

  const saved = await f.invoke(['profile-backup-preview', '--out', confirmation]);
  expect(saved).toMatchObject({
    ok: true,
    value: { bots: 1, confirmation: { path: confirmation } },
  });
  expect(saved.value).not.toHaveProperty('token');
  expect(f.approve).toHaveBeenCalledTimes(1);
  expect(statSync(confirmation).mode & 0o777).toBe(0o600);
  const token = (JSON.parse(readFileSync(confirmation, 'utf8')) as { token: string }).token;
  expect(token).toMatch(/\S{8,}/u);
  expect(await f.invoke(['profile-backup-preview', '--out', confirmation])).toMatchObject({
    ok: false,
    error: { code: 'destination-exists' },
  });

  expect(
    await f.invoke([
      'profile-backup-export',
      '--out',
      archive,
      '--confirmation-stdin',
      '--confirmation-file',
      confirmation,
    ]),
  ).toMatchObject({ ok: false, error: { code: 'usage' } });
  const exported = await f.invoke([
    'profile-backup-export',
    '--confirmation-file',
    confirmation,
    '--out',
    archive,
  ]);
  expect(exported).toMatchObject({ ok: true, value: { file: archive } });
  expect(
    await f.invoke([
      'profile-backup-export',
      '--confirmation-file',
      confirmation,
      '--out',
      join(dir, 'second.botharness-backup'),
    ]),
  ).toMatchObject({ ok: false, error: { code: 'preview-stale' } });

  expect(await f.invoke(['profile-backup-inspect', '--file', archive])).toMatchObject({
    ok: true,
    value: { manifest: { counts: { bots: 1 } } },
  });
  const corrupt = join(dir, 'corrupt.botharness-backup');
  writeFileSync(corrupt, 'damaged backup');
  expect(await f.invoke(['profile-backup-inspect', '--file', corrupt])).toMatchObject({
    ok: false,
    error: { code: 'package-invalid' },
  });
  const home = join(dir, 'restored-home');
  expect(
    await f.invoke(['profile-backup-restore', '--file', archive, '--new-home', home, '--confirm']),
  ).toMatchObject({ ok: true, value: { home, state: 'stopped' } });

  const restoredLog: string[] = [];
  const restored = await tob(await serve(mount(home), restoredLog));
  expect(await restored.invoke(['profile-backup-recovery'])).toMatchObject({
    ok: true,
    value: { restored: true, bots: [{ slug: 'keeper', activated: false }] },
  });
  expect(
    await restored.invoke(['profile-backup-activate', 'keeper', '--confirm', '--acknowledge-risk']),
  ).toMatchObject({ ok: false, error: { code: 'activation-required' } });
  expect(await restored.invoke(['profile-backup-authorize', 'keeper', '--confirm'])).toMatchObject({
    ok: true,
  });
  expect(
    await restored.invoke(['profile-backup-activate', 'keeper', '--confirm', '--acknowledge-risk']),
  ).toMatchObject({
    ok: true,
    value: { bots: [{ slug: 'keeper', activated: true }] },
  });

  const visible = JSON.stringify([
    f.transcript,
    f.approve.mock.calls,
    restored.transcript,
    restored.approve.mock.calls,
    log,
    restoredLog,
  ]);
  expect(visible).not.toContain(token);
  expect(visible).not.toContain(LAUNCH);
  expect(
    f.approve.mock.calls.map(([proposal]) => (proposal as { command: string }).command),
  ).toEqual([
    'profile-backup-preview',
    'profile-backup-preview',
    'profile-backup-export',
    'profile-backup-export',
    'profile-backup-export',
    'profile-backup-inspect',
    'profile-backup-inspect',
    'profile-backup-restore',
  ]);
});

it('refuses an export confirmation that is missing or not a saved preview', async () => {
  const f = await tob(await serve(mount(), []));
  const dir = root();
  const stray = join(dir, 'stray.json');
  writeFileSync(stray, JSON.stringify({ bots: 0 }));
  for (const argv of [
    ['profile-backup-export', '--out', join(dir, 'a')],
    ['profile-backup-export', '--out', join(dir, 'b'), '--confirmation-file', stray],
  ])
    expect(await f.invoke(argv)).toMatchObject({
      ok: false,
      error: { code: 'usage' },
    });
  expect(
    await f.invoke([
      'profile-backup-export',
      '--out',
      join(dir, 'c'),
      '--confirmation-file',
      join(dir, 'missing.json'),
    ]),
  ).toMatchObject({ ok: false, error: { code: 'backup-io-failed' } });
});
