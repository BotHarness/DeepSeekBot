import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import type { ModelCatalog } from '../src/models/catalog.js';
import { createProfileBackupHttp } from '../src/portability/http.js';
import type { ProfileBackupSource } from '../src/portability/package.js';
import { LAUNCH_TOKEN, serveHost, tobCli as tob } from './tob-cli-live-host.js';

const LAUNCH = LAUNCH_TOKEN;
const route = { provider: 'deepseek', model: 'deepseek-chat' };
const catalog: ModelCatalog = {
  list: async () => [],
  validate: async () => undefined,
};
const roots: string[] = [];
const cores: BotHarnessCore[] = [];

afterEach(async () => {
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

function serve(core: BotHarnessCore, log: string[]) {
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
  return serveHost(createProfileBackupHttp(source, root(), core.profileRecovery, catalog));
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
  if (process.platform !== 'win32') expect(statSync(confirmation).mode & 0o777).toBe(0o600);
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

it('refuses a preview the Host returned without an export confirmation and saves nothing', async () => {
  const f = await tob(await serveHost(async () => Response.json({ bots: 0 })));
  const out = join(root(), 'confirmation.json');
  for (const argv of [['profile-backup-preview'], ['profile-backup-preview', '--out', out]])
    expect(await f.invoke(argv)).toMatchObject({
      ok: false,
      error: { code: 'host-protocol-error' },
    });
  expect(existsSync(out)).toBe(false);
});
