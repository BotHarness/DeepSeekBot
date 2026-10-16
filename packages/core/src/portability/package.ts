import { randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { z } from 'zod';
import { readZip, writeZip, type ZipEntry } from '../bots/zip-archive.js';
import {
  mountOperationalDatabase,
  validateOperationalSnapshot,
  withOperationalBackup,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../database/schema-plan.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { createPersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotDeletions } from '../bots/deletion.js';
import { restoreProfileRegistry } from '../bots/profile-restore.js';
import { createAttachmentStore, type AttachmentStore } from '../attachments/store.js';
import { profileAttachmentFiles } from '../attachments/backup.js';
import { profileMemoryFiles } from '../memory/backup.js';
import { purgeCheckpointSchema, type ContentPurge } from '../purge/contracts.js';
import { mountContentPurge } from '../purge/owner.js';
import { createSessionOwnership } from '../sessions/ownership.js';
import { attachOperationalModule } from '../database/owner.js';
import {
  suspendRestoredMessaging,
  profileMessagingDependencies,
} from '../messaging/profile-restore.js';
import {
  suspendRestoredExecution,
  profileWorkspaceDependencies,
} from '../runtime/profile-restore.js';
import { createProfileRecovery } from './recovery.js';
import {
  digest,
  fixedFile,
  physicalDirectory,
  portablePath,
  ProfileBackupError,
  treeFiles,
} from './files.js';
export const PROFILE_BACKUP_LIMITS = { maxEntries: 60_000, maxTotalBytes: 512 * 1024 * 1024 };
const hash = z.string().regex(/^[0-9a-f]{64}$/u);
const manifestSchema = z
  .object({
    format: z.literal('botharness-backup'),
    version: z.literal(1),
    id: z.uuid(),
    createdAt: z.iso.datetime(),
    schemaGeneration: z.number().int().min(70),
    producer: z.object({ botharness: z.string().max(100), dsh: z.literal('0.2.0-rc.1') }).strict(),
    sessions: z
      .object({
        status: z.literal('unsupported'),
        count: z.number().int().min(0),
        reason: z.literal('No portable Session Persistence adapter'),
      })
      .strict(),
    memories: z
      .array(
        z
          .object({
            slug: z
              .string()
              .regex(/^[a-z0-9][a-z0-9-]*$/u)
              .max(64),
            repository: z.string().regex(/^(memory\/[0-9]+)?$/u),
            disposition: z.enum(['retained', 'erased']),
          })
          .strict(),
      )
      .max(10_000),
    dependencies: z
      .array(
        z
          .object({
            kind: z.enum(['model', 'provider', 'workspace', 'runtime']),
            scope: z.string().max(200),
            reference: z.string().max(2000),
            required: z.boolean(),
            contract: z.string().max(100),
          })
          .strict(),
      )
      .max(50_000),
    purge: purgeCheckpointSchema,
    files: z
      .array(
        z
          .object({ path: z.string().max(1000), bytes: z.number().int().min(0), sha256: hash })
          .strict(),
      )
      .max(PROFILE_BACKUP_LIMITS.maxEntries),
    counts: z
      .object({
        bots: z.number().int().min(0),
        files: z.number().int().min(0),
        bytes: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();
export type ProfileBackupManifest = z.infer<typeof manifestSchema>;

export interface ProfileBackupSource {
  database: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  deletions: PersonaBotDeletions;
  attachments: AttachmentStore;
  purge: ContentPurge;
  version: string;
  dshVersion: string | undefined;
  sessionCount(): number;
  log?(message: string): void;
}

export function inspectProfileBackup(archive: Buffer): {
  manifest: ProfileBackupManifest;
  entries: ZipEntry[];
} {
  try {
    if (archive.length > PROFILE_BACKUP_LIMITS.maxTotalBytes)
      throw new Error('Package resource bound exceeded');
    const entries = readZip(archive, PROFILE_BACKUP_LIMITS);
    const byPath = new Map(entries.map((entry) => [entry.path, entry]));
    const metadata = entries.find((entry) => entry.path === 'manifest.json');
    if (!metadata || metadata.data.length > 8 * 1024 * 1024)
      throw new Error('Manifest missing or too large');
    const manifest = manifestSchema.parse(JSON.parse(metadata.data.toString('utf8')));
    if (manifest.schemaGeneration > BOT_HARNESS_SCHEMA_PLAN.targetGeneration)
      throw new ProfileBackupError('upgrade-required', 'Backup requires a newer BotHarness schema');
    const contracts = {
      runtime: 'botharness-core/1',
      model: 'model-route/1',
      provider: 'messaging-binding/1',
      workspace: 'workspace-grant/1',
    };
    for (const dependency of manifest.dependencies)
      if (
        dependency.required &&
        (dependency.contract !== contracts[dependency.kind] ||
          (dependency.kind === 'runtime' && dependency.reference !== 'dsh@0.2.0-rc.1'))
      )
        throw new ProfileBackupError(
          'dependency-incompatible',
          'Backup requires an unsupported runtime dependency contract',
        );
    const names = new Set<string>();
    let bytes = 0;
    for (const file of manifest.files) {
      portablePath(file.path);
      if (
        file.path !== 'database.sqlite' &&
        !/^memory\/[0-9]+\//u.test(file.path) &&
        !/^attachments\/(files|objects)\//u.test(file.path) &&
        !/^recovery-git\//u.test(file.path)
      )
        throw new Error('Unknown required file');
      const key = file.path.toLowerCase();
      if (names.has(key)) throw new Error('Duplicate package file');
      names.add(key);
      const entry = byPath.get(file.path);
      if (!entry || entry.data.length !== file.bytes || digest(entry.data) !== file.sha256)
        throw new Error('Missing or damaged package file');
      if (
        /^attachments\/objects\//u.test(file.path) &&
        digest(entry.data) !== file.path.split('/').at(-1)
      )
        throw new Error('Legacy CAS content does not match identity');
      bytes += file.bytes;
    }
    if (
      !names.has('database.sqlite') ||
      entries.length !== manifest.files.length + 1 ||
      manifest.counts.files !== manifest.files.length ||
      manifest.counts.bytes !== bytes ||
      manifest.counts.bots !== manifest.memories.length
    )
      throw new Error('Incomplete package closure');
    for (const item of manifest.memories) {
      if (
        item.disposition === 'retained' &&
        (!item.repository || !byPath.has(item.repository + '/.git/HEAD'))
      )
        throw new Error('Required Memory is missing');
      if (item.disposition === 'erased' && item.repository)
        throw new Error('Erased Memory has files');
    }
    const repositories = new Set(
      manifest.memories
        .filter((item) => item.disposition === 'retained')
        .map((item) => item.repository),
    );
    for (const file of manifest.files)
      if (file.path.startsWith('memory/')) {
        if (!repositories.has(file.path.split('/').slice(0, 2).join('/')))
          throw new Error('Unowned Memory repository');
        if (/\/\.git\/(?:commondir|objects\/info\/alternates)$/u.test(file.path))
          throw new Error('External Git object store');
      }
    return { manifest, entries };
  } catch (error) {
    if (error instanceof ProfileBackupError) throw error;
    throw new ProfileBackupError(
      'package-invalid',
      'Backup manifest, file paths or integrity are invalid',
    );
  }
}

export function profileBackupPreview(source: ProfileBackupSource) {
  if (source.dshVersion !== '0.2.0-rc.1')
    throw new ProfileBackupError(
      'dependency-incompatible',
      'Profile Backup requires the verified DSH 0.2.0-rc.1 runtime',
    );
  const memories = profileMemoryFiles(source.registry, source.deletions);
  const memoryFiles = memories.flatMap((repo) => repo.files);
  const memoryBytes = memoryFiles.reduce((sum, file) => sum + statSync(file.path).size, 0);
  if (
    memoryFiles.length >= PROFILE_BACKUP_LIMITS.maxEntries ||
    memoryBytes > PROFILE_BACKUP_LIMITS.maxTotalBytes
  )
    throw new ProfileBackupError('too-large', 'Profile exceeds package resource bound');
  const legacy = new Set<string>();
  for (const file of memoryFiles)
    if (/\.(md|json|txt)$/iu.test(file.local)) {
      const fixed = fixedFile(file.path);
      for (const match of fixed.data.toString('utf8').matchAll(/sha256:[0-9a-f]{64}/gu))
        legacy.add(match[0]);
      fixed.verify();
    }
  const files = [
    ...memoryFiles,
    ...profileAttachmentFiles(source.database, source.attachments, [...legacy]),
  ];
  const quarantine = join(dirname(source.registry.rootDir), 'recovery-git');
  if (existsSync(quarantine)) files.push(...treeFiles(quarantine));
  const diagnostics = source.database.diagnostics();
  const estimatedBytes =
    diagnostics.databaseBytes +
    diagnostics.walBytes +
    files.reduce((sum, file) => sum + statSync(file.path).size, 0);
  if (
    files.length >= PROFILE_BACKUP_LIMITS.maxEntries ||
    estimatedBytes > PROFILE_BACKUP_LIMITS.maxTotalBytes
  )
    throw new ProfileBackupError('too-large', 'Profile exceeds package resource bound');
  return {
    bots: memories.length,
    files: files.length + 1,
    estimatedBytes,
    revision: diagnostics.metrics.transactionsCommitted,
    sessions: { status: 'unsupported', count: source.sessionCount() },
    limits: PROFILE_BACKUP_LIMITS,
  };
}

function space(path: string, required: number, available?: (path: string) => number): void {
  const fs = statfsSync(path);
  const free = available?.(path) ?? fs.bavail * fs.bsize;
  if (free < required + 1024 * 1024)
    throw new ProfileBackupError(
      'disk-space-insufficient',
      'Not enough space for verified staging',
    );
}
function durableFile(path: string, data: Uint8Array): void {
  const fd = openSync(path, 'wx', 0o600);
  try {
    writeFileSync(fd, data);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}
function removeStage(path: string, parent: string): void {
  if (dirname(resolve(path)) !== resolve(parent)) throw new Error('Invalid staging cleanup scope');
  rmSync(path, { force: true, recursive: true });
}

export async function exportProfileBackup(
  source: ProfileBackupSource,
  destination: string,
  options: {
    signal?: AbortSignal;
    availableBytes?: (path: string) => number;
    barrierMilliseconds?: number;
    captured?: () => void;
  } = {},
) {
  const parent = physicalDirectory(dirname(resolve(destination)));
  if (lstatSync(destination, { throwIfNoEntry: false }))
    throw new ProfileBackupError('destination-exists', 'Choose a new backup filename');
  options.signal?.throwIfAborted();
  const preview = profileBackupPreview(source);
  space(parent, preview.estimatedBytes * 3, options.availableBytes);
  const stage = mkdtempSync(join(parent, '.botharness-backup-'));
  const started = performance.now();
  const id = randomUUID();
  const log = (phase: string, reason?: string) =>
    source.log?.(
      `profile-backup initiator=human operation=${id} phase=${phase} durationMs=${Math.round(performance.now() - started)}${reason ? ' reason=' + reason : ''}`,
    );
  try {
    log('capture');
    const snapshotPath = join(stage, 'database.sqlite');
    const entries: ZipEntry[] = [];
    const cutoff = performance.now();
    const manifest = source.purge.withCheckpoint((checkpoint) =>
      withOperationalBackup(source.database, snapshotPath, () => {
        const checks: (() => void)[] = [];
        const names = new Set<string>();
        let bytes = 0;
        const capture = (path: string, local: string) => {
          if (names.has(local)) return entries.find((entry) => entry.path === local)!.data;
          names.add(local);
          if (performance.now() - cutoff > (options.barrierMilliseconds ?? 5000))
            throw new ProfileBackupError(
              'snapshot-changed',
              'Backup Barrier time bound exceeded; retry',
            );
          const fixed = fixedFile(path, PROFILE_BACKUP_LIMITS.maxTotalBytes - bytes);
          if (/\/\.git\/config(?:\.worktree)?$/iu.test(local))
            fixed.data = Buffer.from(
              '[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tlogallrefupdates = true\n',
            );
          bytes += fixed.data.length;
          if (
            bytes > PROFILE_BACKUP_LIMITS.maxTotalBytes ||
            entries.length >= PROFILE_BACKUP_LIMITS.maxEntries - 1
          )
            throw new ProfileBackupError(
              'too-large',
              'Profile exceeds this version’s documented resource bound',
            );
          entries.push({ path: portablePath(local), data: fixed.data });
          checks.push(fixed.verify);
          return fixed.data;
        };
        capture(snapshotPath, 'database.sqlite');
        const memories = profileMemoryFiles(source.registry, source.deletions);
        const legacy = new Set<string>();
        for (const memory of memories)
          for (const file of memory.files) {
            const data = capture(file.path, memory.repository + '/' + file.local);
            if (/\.(md|json|txt)$/iu.test(file.local))
              for (const match of data.toString('utf8').matchAll(/sha256:[0-9a-f]{64}/gu))
                legacy.add(match[0]);
          }
        const attachmentFiles = profileAttachmentFiles(source.database, source.attachments, [
          ...legacy,
        ]);
        for (const file of attachmentFiles) capture(file.path, file.local);
        const quarantine = join(dirname(source.registry.rootDir), 'recovery-git');
        if (existsSync(quarantine))
          for (const file of treeFiles(quarantine))
            capture(file.path, 'recovery-git/' + file.local);
        options.captured?.();
        for (const verify of checks) verify();
        if (performance.now() - cutoff > (options.barrierMilliseconds ?? 5000))
          throw new ProfileBackupError(
            'snapshot-changed',
            'Backup Barrier time bound exceeded; retry',
          );
        if (
          JSON.stringify(attachmentFiles) !==
          JSON.stringify(profileAttachmentFiles(source.database, source.attachments, [...legacy]))
        )
          throw new ProfileBackupError(
            'snapshot-changed',
            'Attachment file set changed during capture',
          );
        const latest = profileMemoryFiles(source.registry, source.deletions);
        if (JSON.stringify(latest) !== JSON.stringify(memories))
          throw new ProfileBackupError(
            'snapshot-changed',
            'Memory file set changed during capture',
          );
        const dependencies: ProfileBackupManifest['dependencies'] = [
          ...profileMessagingDependencies(source.database),
          ...profileWorkspaceDependencies(source.database),
          {
            kind: 'runtime',
            scope: 'core',
            reference: 'dsh@0.2.0-rc.1',
            required: true,
            contract: 'botharness-core/1',
          },
        ];
        for (const bot of source.registry.listHistorical()) {
          if (bot.modelPlan) {
            for (const [role, route] of [
              ['orchestrator', bot.modelPlan.orchestrator],
              ['assignment', bot.modelPlan.assignmentDefault],
            ] as const) {
              if (route === undefined) continue;
              dependencies.push({
                kind: 'model',
                scope: bot.slug + '/' + role,
                reference: JSON.stringify(route),
                required: true,
                contract: 'model-route/1',
              });
            }
            for (const option of bot.modelPlan.assignmentModels ?? [])
              dependencies.push({
                kind: 'model',
                scope: bot.slug + '/assignment-option',
                reference: JSON.stringify(option),
                required: false,
                contract: 'assignment-model-option/1',
              });
          } else
            dependencies.push({
              kind: 'model',
              scope: bot.slug + '/orchestrator',
              reference: bot.model ?? 'source-native-default-unresolved',
              required: true,
              contract: 'model-route/1',
            });
          for (const workspace of bot.workspaces)
            dependencies.push({
              kind: 'workspace',
              scope: bot.slug,
              reference: workspace,
              required: false,
              contract: 'workspace-grant/1',
            });
        }
        return manifestSchema.parse({
          format: 'botharness-backup',
          version: 1,
          id,
          createdAt: new Date().toISOString(),
          schemaGeneration: source.database.generation,
          producer: { botharness: source.version, dsh: '0.2.0-rc.1' },
          sessions: {
            status: 'unsupported',
            count: source.sessionCount(),
            reason: 'No portable Session Persistence adapter',
          },
          memories: memories.map(({ slug, repository, disposition }) => ({
            slug,
            repository,
            disposition,
          })),
          dependencies,
          purge: checkpoint,
          files: entries.map((entry) => ({
            path: entry.path,
            bytes: entry.data.length,
            sha256: digest(entry.data),
          })),
          counts: { bots: memories.length, files: entries.length, bytes },
        });
      }),
    );
    log('package');
    await setImmediate();
    options.signal?.throwIfAborted();
    const archive = writeZip([
      { path: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) },
      ...entries,
    ]);
    const packaged = join(stage, 'verified.botharness-backup');
    space(parent, archive.length, options.availableBytes);
    durableFile(packaged, archive);
    inspectProfileBackup(readFileSync(packaged));
    if (validateOperationalSnapshot(snapshotPath) !== manifest.schemaGeneration)
      throw new ProfileBackupError('package-invalid', 'Database schema does not match manifest');
    await setImmediate();
    options.signal?.throwIfAborted();
    linkSync(packaged, destination);
    unlinkSync(packaged);
    log('published');
    return { id, bytes: archive.length, sha256: digest(archive), manifest };
  } catch (error) {
    log(
      'refused',
      error instanceof ProfileBackupError
        ? error.code
        : options.signal?.aborted
          ? 'cancelled'
          : 'capture-failed',
    );
    throw error;
  } finally {
    removeStage(stage, parent);
  }
}
export async function restoreProfileBackup(
  archive: Buffer,
  destinationHome: string,
  options: {
    signal?: AbortSignal;
    availableBytes?: (path: string) => number;
    beforeCommit?: () => void;
  } = {},
) {
  const destination = resolve(destinationHome);
  const parent = physicalDirectory(dirname(destination));
  if (lstatSync(destination, { throwIfNoEntry: false }))
    throw new ProfileBackupError(
      'destination-exists',
      'Restore requires a new stopped environment; existing targets are never replaced',
    );
  options.signal?.throwIfAborted();
  const { manifest, entries } = inspectProfileBackup(archive);
  space(parent, manifest.counts.bytes * 3, options.availableBytes);
  const stage = mkdtempSync(join(parent, '.botharness-restore-'));
  let owner: OperationalDatabaseOwner | undefined;
  try {
    for (const entry of entries) {
      if (entry.path === 'manifest.json') continue;
      const local = entry.path === 'database.sqlite' ? 'botharness.db' : portablePath(entry.path);
      const path = join(stage, 'botharness', local);
      mkdirSync(dirname(path), { recursive: true });
      durableFile(path, entry.data);
    }
    const databasePath = join(stage, 'botharness', 'botharness.db');
    if (validateOperationalSnapshot(databasePath) !== manifest.schemaGeneration)
      throw new ProfileBackupError('package-invalid', 'Database schema does not match manifest');
    owner = mountOperationalDatabase({ dshHome: stage, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    if (owner.mode !== 'ready')
      throw new ProfileBackupError(
        owner.recovery?.code ?? 'profile-in-use',
        'Staging database cannot acquire Writer Lease, validate or migrate',
      );
    const legacy = new Set<string>();
    for (const entry of entries)
      if (/^memory\/.*\.(md|json|txt)$/iu.test(entry.path))
        for (const match of entry.data.toString('utf8').matchAll(/sha256:[0-9a-f]{64}/gu))
          legacy.add(match[0]);
    const attachments = createAttachmentStore({
      rootDir: join(stage, 'botharness', 'attachments'),
    });
    mountContentPurge({
      dshHome: stage,
      database: owner,
      attachments,
      restoring: true,
      restoreCheckpoint: manifest.purge,
    });
    if (owner.mode !== 'ready')
      throw new ProfileBackupError(
        'package-invalid',
        'Purge checkpoint is inconsistent with the database',
      );
    profileAttachmentFiles(owner, attachments, [...legacy]);
    const registry = createPersonaBotRegistry({
      rootDir: join(stage, 'botharness', 'bots'),
      database: owner,
    });
    const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
    const recovery = createProfileRecovery(owner, registry, ownership);
    recovery.recordRestore(manifest.id);
    restoreProfileRegistry(owner, registry, manifest.memories, stage, destination);
    ownership.markContentUnavailable();
    suspendRestoredMessaging(owner);
    suspendRestoredExecution(owner);
    for (const repo of new Set(
      manifest.memories
        .filter((item) => item.disposition === 'retained')
        .map((item) => item.repository),
    )) {
      const git = join(stage, 'botharness', repo, '.git');
      const quarantine = join(stage, 'botharness', 'recovery-git', manifest.id, repo);
      for (const name of ['config', 'hooks'])
        if (existsSync(join(git, name))) {
          mkdirSync(quarantine, { recursive: true });
          renameSync(join(git, name), join(quarantine, name));
        }
      durableFile(
        join(git, 'config'),
        Buffer.from(
          '[core]\n\trepositoryformatversion = 0\n\tbare = false\n\tlogallrefupdates = true\n',
        ),
      );
    }
    owner.close();
    owner = undefined;
    validateOperationalSnapshot(databasePath);
    durableFile(
      join(stage, 'botharness', 'restore-receipt.json'),
      Buffer.from(
        JSON.stringify({
          id: manifest.id,
          packageSha256: digest(archive),
          sessions: 'unsupported',
          mode: 'disaster-restore',
        }),
      ),
    );
    await setImmediate();
    options.beforeCommit?.();
    options.signal?.throwIfAborted();
    if (lstatSync(destination, { throwIfNoEntry: false }))
      throw new ProfileBackupError('destination-exists', 'Destination appeared during staging');
    renameSync(stage, destination);
    return {
      id: manifest.id,
      destinationHome: destination,
      mode: 'disaster-restore' as const,
      manifest,
    };
  } finally {
    owner?.close();
    if (existsSync(stage)) removeStage(stage, parent);
  }
}
