import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { accountMemoryPath } from '../src/workspaces/space-memory.js';
import { createMarketplaceInstallReviews } from '../src/marketplace/install-review.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0).reverse()) {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function fixture() {
  const home = createTempRoot('m13-import-access-');
  const core = createCore({ dshHome: home });
  cores.push(core);
  const db = attachOperationalModule(core.operationalDatabase, 'import-test');
  db.transaction((db) => {
    for (const id of ['alice', 'bob']) {
      db.prepare("INSERT INTO humans VALUES (?, ?, 'active', 'before')").run(id, id);
      db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(id);
    }
    db.prepare('UPDATE team_settings SET enabled = 1').run();
  });
  for (const id of ['alice', 'bob']) core.spaces.ensureAccount(id);
  const bridge = createBridgeMethodsForHumans(core);
  const human = humanContext('alice');
  const role = core.team.roles.create(owner, 'Importer', ['bots.createPrivate']).role;
  const grant = (id = human.humanId) => core.team.roles.set(owner, id, [role.roleId]);
  return { core, home, db, bridge, human, grant };
}

function archive() {
  const bytes = writeZip([
    { path: 'SOUL.md', data: Buffer.from('Private imported personality.') },
    {
      path: '.botharness/bot.json',
      data: Buffer.from(
        JSON.stringify({
          name: 'Portable',
          ownerHumanId: 'bob',
          public: true,
          workspaces: ['/foreign'],
          memoryDir: '/foreign',
        }),
      ),
    },
  ]);
  return {
    bytes,
    input: {
      uploadKey: 'shared-upload-key',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
    },
  };
}

it('imports granted ZIP Bots privately into the caller account and isolates uploads and receipts', async () => {
  const f = fixture();
  const { bytes, input } = archive();
  const bridge = f.bridge(f.human);
  const request = { ...input, operationKey: 'shared-import-key', displayName: 'Private' };
  expect(await bridge.zipImport(request)).toMatchObject({
    ok: false,
    error: { code: 'permission-required', details: { permission: 'bots.createPrivate' } },
  });
  f.grant();
  expect(bridge.zipUploadBegin(input)).toMatchObject({
    ok: true,
    value: { uploadKey: input.uploadKey, offset: 0 },
  });
  expect(
    bridge.zipUploadChunk({ ...input, offset: 0, dataBase64: bytes.toString('base64') }),
  ).toMatchObject({ ok: true });
  expect(bridge.zipUploadPreview(input)).toMatchObject({ ok: true });
  f.grant('bob');
  const bob = f.bridge(humanContext('bob'));
  expect(bob.zipUploadPreview(input)).toMatchObject({
    ok: false,
    error: { code: 'upload-expired' },
  });
  expect(bob.zipImportLookup(request)).toMatchObject({ ok: true, value: { receipt: null } });
  const created = await bridge.zipImport(request);
  if (!created.ok) throw new Error(created.error.code);
  const slug = created.value.bot.slug;
  expect(created.value.bot.ownerHumanId).toBe('alice');
  expect(f.core.registry.memoryDirFor(slug)).toBe(accountMemoryPath(f.home, 'alice', slug));
  expect(readFileSync(join(f.core.registry.memoryDirFor(slug)!, 'SOUL.md'), 'utf8')).toBe(
    'Private imported personality.',
  );
  expect(f.core.grants.list(slug).filter((grant) => !grant.revokedAt)).toEqual([
    expect.objectContaining({
      workspacePath: join(f.home, 'spaces/alice/files'),
      orchestratorWrite: true,
    }),
  ]);
  expect(f.core.team.belongs(f.human, created.value.channelId)).toBe(true);
  expect(f.core.team.belongs(humanContext('bob'), created.value.channelId)).toBe(false);
  expect(bob.get({ slug })).toMatchObject({ ok: false, error: { code: 'bot-not-found' } });
  expect(f.bridge(owner).get({ slug })).toMatchObject({ ok: true, value: { metadataOnly: true } });
  expect(await bridge.zipImport(request)).toEqual(created);
  expect(bob.zipImportLookup(request)).toMatchObject({ ok: true, value: { receipt: null } });
  expect(bob.zipUploadBegin(input)).toMatchObject({ ok: true, value: { offset: 0 } });
  bob.zipUploadChunk({ ...input, offset: 0, dataBase64: bytes.toString('base64') });
  const other = await bob.zipImport(request);
  if (!other.ok) throw new Error(other.error.code);
  expect(other.value.bot.slug).not.toBe(slug);
  expect(other.value.bot.ownerHumanId).toBe('bob');
  await f.core.team.transfer(owner, 'alice', 'bob');
  expect(bridge.zipImportLookup(request)).toMatchObject({
    ok: false,
    error: { code: 'creation-identity-unavailable' },
  });
  expect(await bridge.zipImport(request)).toMatchObject({
    ok: false,
    error: { code: 'creation-identity-unavailable' },
  });
  f.core.team.roles.set(owner, f.human.humanId, ['member']);
  expect(bridge.zipImportLookup(request)).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
});

it('rechecks the private creation grant before an in-flight ZIP import commits', async () => {
  const f = fixture();
  f.grant();
  const bridge = f.bridge(f.human);
  const { bytes, input } = archive();
  bridge.zipUploadBegin(input);
  bridge.zipUploadChunk({ ...input, offset: 0, dataBase64: bytes.toString('base64') });
  const pending = bridge.zipImport({
    ...input,
    operationKey: 'revoked-zip-import',
    displayName: 'Refused',
  });
  f.core.team.roles.set(owner, 'alice', ['member']);
  expect(await pending).toMatchObject({
    ok: false,
    error: { code: 'permission-required', details: { permission: 'bots.createPrivate' } },
  });
  expect(f.core.registry.list('alice')).toEqual([]);
});

it.each([false, true])(
  'imports granted Git Bots privately, receipt=%s, and rechecks authority before committing',
  async (receipt) => {
    const root = createTempRoot('member-git-source-');
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
    git('init', '--quiet');
    git('config', 'user.name', 'Import fixture');
    git('config', 'user.email', 'fixture@example.test');
    writeFileSync(join(root, 'SOUL.md'), 'Private Git personality.');
    git('add', '.');
    git('commit', '--quiet', '-m', 'source');
    vi.stubEnv('GIT_CONFIG_COUNT', '1');
    vi.stubEnv('GIT_CONFIG_KEY_0', `url.${root.replaceAll('\\', '/')}/.insteadOf`);
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://fixture.example/member.git');
    const f = fixture();
    f.grant();
    const bridge = f.bridge(f.human);
    const request = {
      gitUrl: 'https://fixture.example/member.git',
      expectedCommit: git('rev-parse', 'HEAD'),
      displayName: 'Git import',
      ...(receipt ? { operationKey: 'member-git-import' } : {}),
    };
    const created = await bridge.createFromGit(request);
    if (!created.ok) throw new Error(created.error.code);
    expect(created.value.bot.ownerHumanId).toBe('alice');
    expect(f.core.registry.memoryDirFor(created.value.bot.slug)).toBe(
      accountMemoryPath(f.home, 'alice', created.value.bot.slug),
    );
    expect(f.core.grants.list(created.value.bot.slug)).toContainEqual(
      expect.objectContaining({ workspacePath: join(f.home, 'spaces/alice/files') }),
    );
    if (receipt) {
      f.grant('bob');
      expect(f.bridge(humanContext('bob')).botImportLookup(request)).toMatchObject({
        ok: true,
        value: { receipt: null },
      });
      expect(await bridge.createFromGit(request)).toEqual(created);
    }
    const pending = bridge.createFromGit({
      ...request,
      operationKey: receipt ? 'member-git-revoked' : undefined,
    });
    f.core.team.roles.set(owner, f.human.humanId, ['member']);
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'bots.createPrivate' } },
    });
    expect(f.core.registry.list('alice')).toHaveLength(1);
  },
);

it('requires the public grant for an explicit public import, and leaves publication to M7', async () => {
  const f = fixture();
  f.grant();
  for (const method of ['createFromGit', 'zipImport', 'marketplaceInstall'] as const)
    expect(await f.bridge(f.human)[method]({ visibility: { kind: 'public' } })).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'bots.createPublic' } },
    });
  const publisher = f.core.team.roles.create(owner, 'Publisher', [
    'bots.createPrivate',
    'bots.createPublic',
  ]).role;
  f.core.team.roles.set(owner, f.human.humanId, [publisher.roleId]);
  expect(await f.bridge(f.human).zipImport({ public: true })).toMatchObject({
    ok: false,
    error: { code: 'invalid-input' },
  });
  expect(f.core.registry.list('alice')).toEqual([]);
});

it('allows grant-based Marketplace review and installation with the same private import authority', async () => {
  const f = fixture();
  const reviews = createMarketplaceInstallReviews({
    uploads: {
      async installInput() {
        return {
          ok: true,
          value: {
            entry: {
              id: 'R_public',
              owner: 'publisher',
              name: 'bot',
              fullName: 'publisher/bot',
              displayName: 'Portable',
              description: null,
              descriptionGenerated: false,
              roles: [],
              banner: null,
              avatar: null,
              topics: [],
              stars: 0,
              installs: 0,
              pushedAt: '2026-11-15',
              htmlUrl: 'https://example.test/bot',
              cloneUrl: '',
              defaultBranch: 'main',
              headCommit: null,
              source: 'upload',
              author: null,
            },
            input: {
              displayName: 'Portable',
              source: {
                kind: 'archive',
                sha256: 'a'.repeat(64),
                files: [
                  {
                    path: 'SOUL.md',
                    data: Buffer.from('Public portable source, private installed Bot.'),
                  },
                ],
              },
            },
          },
        };
      },
    },
    reviewer: async () => ({ text: '{"findings":[]}' }),
  });
  const methods = createBridgeMethodsForHumans({ ...f.core, marketplaceInstallReviews: reviews });
  const bridge = methods(f.human);
  expect(await bridge.marketplaceInstallReview({ id: 'R_public' })).toMatchObject({
    ok: false,
    error: { code: 'permission-required', details: { permission: 'bots.createPrivate' } },
  });
  f.grant();
  const review = await bridge.marketplaceInstallReview({ id: 'R_public' });
  if (!review.ok) throw new Error(review.error.code);
  const request = {
    id: 'R_public',
    reviewId: review.value.reviewId,
    operationKey: 'member-market-install',
  };
  const created = await bridge.marketplaceInstall(request);
  if (!created.ok) throw new Error(created.error.code);
  expect(created.value.bot.ownerHumanId).toBe('alice');
  expect(f.core.registry.memoryDirFor(created.value.bot.slug)).toBe(
    accountMemoryPath(f.home, 'alice', created.value.bot.slug),
  );
  expect(await bridge.marketplaceInstall(request)).toEqual(created);
  f.grant('bob');
  const bob = await methods(humanContext('bob')).marketplaceInstall(request);
  if (!bob.ok) throw new Error(bob.error.code);
  expect(bob.value.bot.ownerHumanId).toBe('bob');
  expect(bob.value.bot.slug).not.toBe(created.value.bot.slug);
});

it('keeps the former Owner import receipts after an Owner transfer', async () => {
  const f = fixture();
  const { bytes, input } = archive();
  const request = { ...input, operationKey: 'owner-import-key', displayName: 'Kept' };
  const before = f.bridge(owner);
  expect(before.zipUploadBegin(input)).toMatchObject({ ok: true });
  expect(
    before.zipUploadChunk({ ...input, offset: 0, dataBase64: bytes.toString('base64') }),
  ).toMatchObject({ ok: true });
  const created = await before.zipImport(request);
  if (!created.ok) throw new Error(created.error.code);
  await f.core.team.setOwnerPassword(owner, 'owner-password-1');
  const target = await f.core.team.createMember(owner, 'next-owner', 'Next');
  const next = humanContext(target.member.humanId);
  await f.core.team.changePassword(next, target.initialPassword, 'next-password-1', false);
  await f.core.team.transferOwner(owner, next.humanId, 'owner-password-1');
  const importer = f.core.team.roles.create(next, 'Importer again', ['bots.createPrivate']).role;
  f.core.team.roles.set(next, owner.humanId, [importer.roleId]);
  const after = f.bridge(owner);
  expect(after.zipImportLookup(request)).toMatchObject({
    ok: true,
    value: { receipt: { botSlug: created.value.bot.slug } },
  });
});
