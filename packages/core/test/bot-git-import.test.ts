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
function fixture(home = createTempRoot('git-import-receipt-'), warn?: (message: string) => void) {
  const core = createCore({
    dshHome: home,
    ...(warn === undefined ? {} : { warn }),
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
  return {
    core,
    home,
    close,
    bridge: createBridgeMethods({ ...core, ...(warn === undefined ? {} : { warn }) }),
  };
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

it('serializes duplicate Git imports, binds the entire accepted input, and refuses archived identities', async () => {
  const source = repository();
  const f = fixture();
  const request = {
    operationKey: 'git-concurrent-01',
    displayName: 'Concurrent',
    gitUrl: source.url,
    expectedCommit: source.commit,
    description: 'Bio',
    roles: ['qa'],
  };
  const [a, b] = await Promise.all([
    f.bridge.createFromGit(request),
    f.bridge.createFromGit(request),
  ]);
  expect(a).toEqual(b);
  if (!a.ok) throw new Error(a.error.code);
  for (const patch of [
    { displayName: 'Changed' },
    { description: 'Changed' },
    { roles: ['changed'] },
    { expectedCommit: 'f'.repeat(40) },
  ])
    expect(f.bridge.botImportLookup({ ...request, ...patch })).toMatchObject({
      ok: false,
      error: { code: 'creation-key-conflict' },
    });
  expect(f.core.registry.list()).toHaveLength(1);
  expect(f.core.channels.list()).toHaveLength(1);
  f.core.registry.setPaused(a.value.bot.slug, true);
  expect(f.bridge.botImportLookup(request)).toMatchObject({
    ok: false,
    error: { code: 'creation-identity-unavailable' },
  });
  expect(await f.bridge.createFromGit(request)).toMatchObject({
    ok: false,
    error: { code: 'creation-identity-unavailable' },
  });
});
it('refuses changed Git source before publishing a Bot and never silently rebinds its operation', async () => {
  const source = repository();
  const f = fixture();
  const request = {
    operationKey: 'git-source-change-01',
    displayName: 'Pinned',
    gitUrl: source.url,
    expectedCommit: source.commit,
  };
  writeFileSync(join(source.dir, 'SOUL.md'), 'Different source');
  source.git('add', '.');
  source.git('commit', '--quiet', '-m', 'new source');
  expect(await f.bridge.createFromGit(request)).toMatchObject({
    ok: false,
    error: { code: 'git-source-changed' },
  });
  expect(f.core.registry.list()).toHaveLength(0);
  expect(f.core.channels.list()).toHaveLength(0);
  const reserved = f.bridge.botImportLookup(request);
  expect(reserved).toMatchObject({ ok: true, value: { receipt: { status: 'reserved' } } });
  expect(
    await f.bridge.createFromGit({ ...request, expectedCommit: source.git('rev-parse', 'HEAD') }),
  ).toMatchObject({ ok: false, error: { code: 'creation-key-conflict' } });
  await f.close();
  const restarted = fixture(f.home);
  expect(restarted.bridge.botImportLookup(request)).toEqual(reserved);
  expect(await restarted.bridge.createFromGit(request)).toMatchObject({
    ok: false,
    error: { code: 'git-source-changed' },
  });
  expect(restarted.core.registry.list()).toHaveLength(0);
});
it('refuses invalid or unsupported keyed import before creating an identity', async () => {
  const f = fixture();
  const request = {
    operationKey: 'git-invalid-01',
    displayName: 'Pinned',
    gitUrl: 'https://example.com/owner/repo.git',
    expectedCommit: 'a'.repeat(40),
  };
  for (const patch of [
    { operationKey: 'short' },
    { expectedCommit: 'branch' },
    { gitUrl: 'https://secret@example.com/owner/repo.git' },
  ]) {
    expect(f.bridge.botImportLookup({ ...request, ...patch }).ok).toBe(false);
    expect((await f.bridge.createFromGit({ ...request, ...patch })).ok).toBe(false);
  }
  const { creations: _creations, ...deps } = f.core;
  expect(createBridgeMethods(deps).botImportLookup(request)).toMatchObject({
    ok: false,
    error: { code: 'creation-unavailable' },
  });
  expect(f.core.registry.list()).toHaveLength(0);
});

it('writes bounded source inspection and import lifecycle diagnostics through the existing Host logger', async () => {
  const source = repository();
  const messages: string[] = [];
  const f = fixture(undefined, (message) => messages.push(message));
  const request = {
    operationKey: 'private-operation-01',
    displayName: 'Private Bot name',
    gitUrl: source.url,
    expectedCommit: source.commit,
  };
  expect((await f.bridge.botImportPreview({ gitUrl: source.url })).ok).toBe(true);
  expect((await f.bridge.createFromGit(request)).ok).toBe(true);
  expect(
    (await f.bridge.createFromGit({ ...request, displayName: 'Changed private name' })).ok,
  ).toBe(false);
  expect(
    (
      await f.bridge.botImportPreview({
        gitUrl: 'https://user:private-secret@example.com/repo.git',
      })
    ).ok,
  ).toBe(false);
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        /^bot-import-preview initiator=bot-import-preview phase=started command=git-ls-remote durationMs=0$/,
      ),
      expect.stringMatching(
        /^bot-import-preview initiator=bot-import-preview phase=complete command=git-ls-remote durationMs=\d+$/,
      ),
      expect.stringMatching(
        /^bot-import-preview initiator=bot-import-preview phase=refused command=git-ls-remote durationMs=\d+ reason=invalid-git-url$/,
      ),
      expect.stringMatching(
        /^bot-import initiator=import-request phase=complete source=git durationMs=\d+$/,
      ),
      expect.stringMatching(
        /^bot-import initiator=import-request phase=refused source=git durationMs=\d+ reason=creation-key-conflict$/,
      ),
    ]),
  );
  expect(messages.join(' ')).not.toMatch(
    /fixture.example|private-operation|Private Bot|private-secret|Immutable source|Changed private/,
  );
  expect(messages.every((message) => message.length < 256)).toBe(true);
});

it('logs a bounded Git inspection fallback without disclosing remote addresses or subprocess output', async () => {
  const source = repository();
  const messages: string[] = [];
  vi.stubEnv('GIT_CONFIG_COUNT', '3');
  vi.stubEnv('GIT_CONFIG_KEY_1', `url.${source.dir.replaceAll('\\', '/')}/missing/.insteadOf`);
  vi.stubEnv('GIT_CONFIG_VALUE_1', 'git@fallback.example:owner/repo.git');
  vi.stubEnv('GIT_CONFIG_KEY_2', `url.${source.dir.replaceAll('\\', '/')}/.insteadOf`);
  vi.stubEnv('GIT_CONFIG_VALUE_2', 'https://fallback.example/owner/repo.git');
  const f = fixture(undefined, (message) => messages.push(message));
  const result = await f.bridge.botImportPreview({ gitUrl: 'git@fallback.example:owner/repo.git' });
  expect(result).toMatchObject({
    ok: true,
    value: {
      source: {
        commit: source.commit,
        httpsFallback: { to: 'https://fallback.example/owner/repo.git' },
      },
    },
  });
  expect(messages).toEqual(
    expect.arrayContaining([
      expect.stringMatching(
        /^bot-import-preview initiator=bot-import-preview phase=fallback command=git-ls-remote durationMs=\d+ reason=git-clone-failed$/,
      ),
    ]),
  );
  expect(messages.join(' ')).not.toMatch(
    /fallback.example|missing|fatal:|SOUL.md|git-import-source/,
  );
});
