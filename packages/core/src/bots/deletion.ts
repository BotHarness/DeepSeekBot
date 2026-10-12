import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  attachOperationalModule,
  type OperationalDatabaseOwner,
  type OperationalDatabaseModulePort,
} from '../database/owner.js';
import type { PersonaBotRegistry } from './registry.js';
import type { TelemetryCapture } from '../telemetry/service.js';

export interface MemoryOwnership {
  path: string;
  device: number;
  inode: number;
}

export interface PersonaBotDeletion {
  slug: string;
  displayName: string;
  acceptedAt: string;
  memoryDir: string;
  eraseMemory: boolean;
  ownership?: MemoryOwnership;
  phase: 'stopping' | 'cleanup' | 'complete' | 'incomplete';
  memory: 'retained' | 'pending' | 'erased';
  failure?: string;
  cleanupAccepted?: boolean;
}

export interface PersonaBotDeletionDependencies {
  sessions: string[];
  workspaces: string[];
  grants: string[];
  identities: string[];
  channels: string[];
}

export interface PersonaBotDeletionPreview {
  slug: string;
  displayName: string;
  memoryDir: string;
  token: string;
  eraseAvailable: boolean;
  refusal?: string;
  dependencies: PersonaBotDeletionDependencies;
  deletion?: PersonaBotDeletion;
}

export interface PersonaBotDeletions {
  preview(slug: string): PersonaBotDeletionPreview;
  confirm(slug: string, token: string, eraseMemory: boolean): Promise<PersonaBotDeletion>;
  retry(slug: string): Promise<PersonaBotDeletion>;
  get(slug: string): PersonaBotDeletion | undefined;
  folder(slug: string): { path: string; relativePath: string; kind: 'directory' };
}

export function memoryOwnership(path: string, partial = false): MemoryOwnership {
  const canonical = realpathSync(path);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory())
    throw new Error('Memory is not a dedicated directory');
  let parent = resolve(path);
  while (dirname(parent) !== parent) {
    if (lstatSync(parent).isSymbolicLink()) throw new Error('Memory path contains a symbolic link');
    parent = dirname(parent);
  }
  if (
    !partial &&
    (!lstatSync(join(path, '.git')).isDirectory() || lstatSync(join(path, '.git')).isSymbolicLink())
  )
    throw new Error('Memory is not a standalone Git repository');
  return { path: canonical, device: stat.dev, inode: stat.ino };
}

export function recordMemoryOwnership(
  port: OperationalDatabaseModulePort,
  slug: string,
  path: string,
): void {
  let proof: MemoryOwnership;
  try {
    proof = memoryOwnership(path);
  } catch {
    proof = { path: '', device: -1, inode: -1 };
  }
  port.transaction(
    (database) => {
      database
        .prepare('INSERT OR IGNORE INTO persona_bot_memory_ownership (slug, body) VALUES (?, ?)')
        .run(slug, JSON.stringify(proof));
    },
    ['bot-registry'],
  );
}

function overlap(left: string, right: string): boolean {
  const contains = (root: string, child: string) => {
    const path = relative(root, child);
    return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !isAbsolute(path));
  };
  return contains(left, right) || contains(right, left);
}

function canonicalCandidate(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function assertNoEscapes(root: string): void {
  let remaining = 100_000;
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (--remaining < 0) throw new Error('Repository is too large for a bounded ownership check');
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        let target: string;
        try {
          target = realpathSync(path);
        } catch {
          throw new Error('Memory contains an unresolved symbolic link');
        }
        const rel = relative(root, target);
        if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`))
          throw new Error('Memory contains a symbolic link outside its repository');
      } else if (entry.isDirectory()) visit(path);
    }
  };
  visit(root);
}

export function createPersonaBotDeletions(options: {
  database: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  dependencies(slug: string): PersonaBotDeletionDependencies;
  allWorkspacePaths(): string[];
  protectedPaths?: string[];
  stop(slug: string): Promise<void>;
  changed?(slug: string): void;
  capture?: TelemetryCapture;
  log?(event: {
    module: 'bot-deletion';
    initiator: 'human';
    phase: PersonaBotDeletion['phase'];
    slug: string;
    durationMs: number;
    reason?: string;
  }): void;
  removeMemory?(path: string): void;
}): PersonaBotDeletions {
  const port = attachOperationalModule(options.database, 'bot-registry');
  const pending = new Map<string, Promise<PersonaBotDeletion>>();
  const get = (slug: string): PersonaBotDeletion | undefined =>
    port.read((database) => {
      const row = database
        .prepare('SELECT body FROM persona_bot_deletions WHERE slug = ?')
        .get(slug);
      return row === undefined
        ? undefined
        : (JSON.parse(String(row['body'])) as PersonaBotDeletion);
    });
  const write = (state: PersonaBotDeletion, retainedRecord?: string): void => {
    port.transaction(
      (database) => {
        if (retainedRecord !== undefined)
          database
            .prepare('UPDATE persona_bots SET body = ? WHERE slug = ?')
            .run(retainedRecord, state.slug);
        database
          .prepare(`INSERT INTO persona_bot_deletions (slug, body) VALUES (?, ?)
        ON CONFLICT (slug) DO UPDATE SET body = excluded.body`)
          .run(state.slug, JSON.stringify(state));
      },
      ['bot-registry'],
    );
    try {
      options.changed?.(state.slug);
    } catch {}
  };
  const owner = (slug: string): MemoryOwnership | undefined =>
    port.read((database) => {
      const row = database
        .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
        .get(slug);
      if (row === undefined) return undefined;
      const proof = JSON.parse(String(row['body'])) as MemoryOwnership;
      return proof.device === -1 ? undefined : proof;
    });
  const pathFor = (slug: string): string => {
    const record = options.registry.getHistorical(slug);
    if (record === undefined) throw new Error('PersonaBot does not exist');
    return record.memoryDir ?? join(options.registry.rootDir, slug, 'memory');
  };
  const check = (
    slug: string,
    path: string,
    proof: MemoryOwnership | undefined,
    partial = false,
  ): MemoryOwnership => {
    if (proof === undefined)
      throw new Error(
        'Exclusive managed ownership of this Memory repository is unproven; retain Memory',
      );
    const actual = memoryOwnership(path, partial);
    const managedDefault = join(canonicalCandidate(options.registry.rootDir), slug, 'memory');
    if (actual.path !== managedDefault) {
      for (const protectedPath of options.protectedPaths ?? [options.registry.rootDir]) {
        if (overlap(actual.path, canonicalCandidate(protectedPath)))
          throw new Error('Memory overlaps protected Host storage; retain Memory');
      }
    }
    if (JSON.stringify(actual) !== JSON.stringify(proof))
      throw new Error('Memory repository identity changed; retain Memory');
    for (const bot of options.registry.listHistorical()) {
      if (bot.slug === slug || get(bot.slug)?.memory === 'erased') continue;
      if (overlap(actual.path, canonicalCandidate(pathFor(bot.slug))))
        throw new Error('Memory overlaps another retained repository; retain Memory');
    }
    for (const workspace of options.allWorkspacePaths()) {
      if (overlap(actual.path, canonicalCandidate(workspace)))
        throw new Error('Memory overlaps a Workspace; retain Memory');
    }
    assertNoEscapes(actual.path);
    return actual;
  };
  const preview = (slug: string): PersonaBotDeletionPreview => {
    const record = options.registry.getHistorical(slug);
    if (record === undefined) throw new Error('PersonaBot does not exist');
    const state = get(slug);
    const path = state?.memoryDir ?? pathFor(slug);
    const proof = owner(slug);
    let refusal: string | undefined;
    try {
      check(slug, path, proof);
    } catch (error) {
      refusal = error instanceof Error ? error.message : 'Memory ownership check failed';
    }
    const dependencies = options.dependencies(slug);
    const snapshot = { record, path, proof, refusal, dependencies, state };
    return {
      slug,
      displayName: record.displayName,
      memoryDir: path,
      token: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
      eraseAvailable: refusal === undefined,
      ...(refusal === undefined ? {} : { refusal }),
      dependencies,
      ...(state === undefined ? {} : { deletion: state }),
    };
  };
  const run = (state: PersonaBotDeletion): Promise<PersonaBotDeletion> => {
    const active = pending.get(state.slug);
    if (active !== undefined) return active;
    const started = performance.now();
    const work = Promise.resolve().then(async () => {
      try {
        state = { ...state, phase: 'stopping' };
        delete state.failure;
        write(state);
        await options.stop(state.slug);
        if (state.eraseMemory && state.memory !== 'erased') {
          if (existsSync(state.memoryDir)) {
            const proof = check(
              state.slug,
              state.memoryDir,
              state.ownership,
              state.cleanupAccepted === true,
            );
            state = { ...state, phase: 'cleanup', cleanupAccepted: true };
            write(state);
            (options.removeMemory ?? ((path) => rmSync(path, { recursive: true })))(proof.path);
          } else if (state.cleanupAccepted !== true) {
            throw new Error('Memory disappeared before cleanup was accepted');
          }
          state = { ...state, memory: 'erased' };
        }
        state = { ...state, phase: 'complete' };
        write(state);
      } catch (error) {
        state = {
          ...state,
          phase: 'incomplete',
          failure:
            error instanceof Error ? error.message.slice(0, 512) : 'Deletion did not complete',
        };
        write(state);
      }
      try {
        options.log?.({
          module: 'bot-deletion',
          initiator: 'human',
          phase: state.phase,
          slug: state.slug,
          durationMs: performance.now() - started,
          ...(state.failure === undefined ? {} : { reason: 'deletion-incomplete' }),
        });
      } catch {}
      return state;
    });
    pending.set(state.slug, work);
    void work.finally(() => pending.delete(state.slug)).catch(() => undefined);
    return work;
  };
  return {
    preview,
    get,
    async confirm(slug, token, eraseMemory) {
      const reviewed = preview(slug);
      if (reviewed.token !== token || reviewed.deletion !== undefined)
        throw new Error('Deletion scope changed; reopen confirmation');
      if (eraseMemory && !reviewed.eraseAvailable) throw new Error(reviewed.refusal);
      const state: PersonaBotDeletion = {
        slug,
        displayName: reviewed.displayName,
        acceptedAt: new Date().toISOString(),
        memoryDir: reviewed.memoryDir,
        eraseMemory,
        phase: 'stopping',
        memory: eraseMemory ? 'pending' : 'retained',
        ...(eraseMemory ? { ownership: check(slug, reviewed.memoryDir, owner(slug)) } : {}),
      };
      let retainedRecord: string | undefined;
      try {
        retainedRecord = options.registry.retainedRecordBody(slug);
      } catch {}
      write(state, retainedRecord);
      try {
        options.capture?.('bot_deleted');
      } catch {}
      return run(state);
    },
    async retry(slug) {
      const state = get(slug);
      if (state === undefined) throw new Error('Deletion has not been accepted');
      if (state.phase === 'complete') return state;
      return run(state);
    },
    folder(slug) {
      const path = get(slug)?.memoryDir ?? pathFor(slug);
      if (!lstatSync(path).isDirectory())
        throw new Error('Memory directory is missing or unavailable');
      return { path: realpathSync(path), relativePath: '.', kind: 'directory' };
    },
  };
}
