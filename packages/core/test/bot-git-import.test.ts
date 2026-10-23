import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
  vi.unstubAllEnvs();
});
function fixture(home = createTempRoot('git-import-receipt-')) {
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('unexpected model execution');
      },
    },
  });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  closes.push(close);
  return { core, home, close, bridge: createBridgeMethods(core) };
}
function repository() {
  const dir = createTempRoot('git-import-source-');
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();
  git('init', '--quiet');
  git('config', 'user.name', 'Import fixture');
  git('config', 'user.email', 'fixture@example.test');
  writeFileSync(join(dir, 'SOUL.md'), 'Immutable source personality.');
  git('add', '.');
  git('commit', '--quiet', '-m', 'source');
  vi.stubEnv('GIT_CONFIG_COUNT', '1');
  vi.stubEnv('GIT_CONFIG_KEY_0', `url.${dir.replaceAll('\\', '/')}/.insteadOf`);
  vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://fixture.example/source.git');
  return { git, dir, url: 'https://fixture.example/source.git', commit: git('rev-parse', 'HEAD') };
}
it('previews one Git source and recovers its same Bot and DM after retry and Host restart', async () => {
  const source = repository();
  const f = fixture();
  expect(await f.bridge.botImportPreview({ gitUrl: source.url })).toMatchObject({
    ok: true,
    value: { source: { kind: 'git', gitUrl: source.url, commit: source.commit } },
  });
  const request = {
    operationKey: 'git-import-restart-01',
    displayName: 'Imported helper',
    gitUrl: source.url,
    expectedCommit: source.commit,
    roles: ['research'],
    description: 'Selected source',
  };
  expect(f.bridge.botImportLookup(request)).toEqual({ ok: true, value: { receipt: null } });
  expect(f.core.registry.list()).toHaveLength(0);
  const created = await f.bridge.createFromGit(request);
  expect(created).toMatchObject({
    ok: true,
    value: { receipt: { operationKey: request.operationKey, status: 'created' } },
  });
  if (!created.ok) throw new Error(created.error.code);
  expect(await f.bridge.createFromGit(request)).toEqual(created);
  await f.close();
  const restarted = fixture(f.home);
  expect(restarted.bridge.botImportLookup(request)).toEqual({
    ok: true,
    value: { receipt: created.value.receipt },
  });
  expect(await restarted.bridge.createFromGit(request)).toEqual(created);
  expect(restarted.core.registry.list()).toHaveLength(1);
  expect(restarted.core.channels.list()).toHaveLength(1);
  expect(restarted.core.grants.list(created.value.bot.slug)).toEqual([]);
});
