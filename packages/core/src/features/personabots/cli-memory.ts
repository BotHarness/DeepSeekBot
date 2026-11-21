import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../../database/owner.js';
import {
  MemoryAcceptError,
  type MemoryAcceptedCommit,
  type MemoryAcceptedSnapshot,
} from '../../memory/accepted.js';
import { MemoryFileError } from '../../memory/file-actions.js';
import { MemoryPathError } from '../../memory/jail.js';
import { createMemoryService, type MemoryService } from '../../memory/service.js';
import { createSessionOwnership } from '../../sessions/ownership.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { BotCreateCliIo, CreateValues } from './cli-types.js';
import { CliFailure, usageError } from './cli-errors.js';
import { trimmed, resolveHome, openRegistry } from './cli-offline.js';

const SHA_RE = /^[0-9a-f]{40}$/u;

function callMemory<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof MemoryAcceptError || error instanceof MemoryFileError) {
      throw new CliFailure(error.code, error.message, 1);
    }
    if (error instanceof MemoryPathError) {
      throw new CliFailure('invalid-input', error.message, 1);
    }
    throw error;
  }
}

interface MemoryScope {
  owner: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  record: PersonaBotRecord;
  memory: MemoryService;
}

function openMemory(id: string, values: CreateValues, io: BotCreateCliIo): MemoryScope {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('A bot id is required.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = registry.get(slug);
    if (record === undefined) {
      throw new CliFailure('unknown-bot', `Unknown bot: ${slug}`, 1);
    }
    const ownership = createSessionOwnership(attachOperationalModule(owner, 'session-ownership'));
    const memory = createMemoryService({ registry, ownership, database: owner });
    return { owner, registry, record, memory };
  } catch (error) {
    owner.close();
    throw error;
  }
}

export function memoryBot(record: PersonaBotRecord): { id: string; name: string } {
  return { id: record.slug, name: record.displayName };
}

export function runMemorySnapshot(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; snapshot: MemoryAcceptedSnapshot } {
  const opened = openMemory(id, values, io);
  try {
    return {
      bot: memoryBot(opened.record),
      snapshot: callMemory(() => opened.memory.snapshot(opened.record.slug)),
    };
  } finally {
    opened.owner.close();
  }
}

export function runMemoryFile(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): {
  bot: { id: string; name: string };
  file: { path: string; body: string; head: string; binary: boolean | undefined } | null;
} {
  const path = trimmed(values.path);
  if (path === undefined) throw usageError('--path is required for memory-file.');
  const opened = openMemory(id, values, io);
  try {
    const file = callMemory(() => opened.memory.readAccepted(opened.record.slug, path));
    return {
      bot: memoryBot(opened.record),
      file:
        file === undefined
          ? null
          : { path: file.path, body: file.body, head: file.head, binary: file.binary },
    };
  } finally {
    opened.owner.close();
  }
}

export function runMemoryHistory(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; commits: MemoryAcceptedCommit[] } {
  const rawLimit = trimmed(values.limit);
  let limit: number | undefined;
  if (rawLimit !== undefined) {
    if (!/^[0-9]+$/u.test(rawLimit) || Number(rawLimit) < 1) {
      throw usageError('--limit must be a positive whole number.');
    }
    limit = Number(rawLimit);
  }
  const opened = openMemory(id, values, io);
  try {
    return {
      bot: memoryBot(opened.record),
      commits: callMemory(() => opened.memory.history(opened.record.slug, limit)),
    };
  } finally {
    opened.owner.close();
  }
}

export function runMemoryDiff(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; sha: string; diff: string } {
  const sha = trimmed(values.sha);
  if (sha === undefined || !SHA_RE.test(sha)) {
    throw new CliFailure(
      'invalid-input',
      'A 40-character lowercase commit sha is required for memory-diff.',
      1,
    );
  }
  const opened = openMemory(id, values, io);
  try {
    const result = callMemory(() => opened.memory.diff(opened.record.slug, sha));
    return { bot: memoryBot(opened.record), sha: result.sha, diff: result.diff };
  } finally {
    opened.owner.close();
  }
}

function currentHead(dataDir: string): string {
  try {
    return execFileSync('git', ['-C', dataDir, 'rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
    }).trim();
  } catch {
    throw new CliFailure('memory-unavailable', 'The Bot memory history could not be read.', 1);
  }
}

export async function runMemorySave(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
  readStdin: () => Promise<string>,
): Promise<{ bot: { id: string; name: string }; commit: MemoryAcceptedCommit }> {
  const path = trimmed(values.path);
  if (path === undefined) throw usageError('--path is required for memory-save.');
  const body = values.body;
  const bodyStdin = values['body-stdin'] === true;
  if (body !== undefined && bodyStdin) {
    throw usageError('Pass --body or --body-stdin, not both.');
  }
  if (body === undefined && !bodyStdin) {
    throw usageError('Pass --body or --body-stdin for memory-save.');
  }
  const text = bodyStdin ? await readStdin() : body!;
  const expectedHead = trimmed(values['expected-head']);
  if (expectedHead !== undefined && !SHA_RE.test(expectedHead)) {
    throw new CliFailure(
      'invalid-input',
      'A 40-character lowercase commit sha is required for --expected-head.',
      1,
    );
  }
  const editId = trimmed(values['edit-id']) ?? randomUUID();
  if (editId.length > 100) {
    throw new CliFailure('invalid-input', '--edit-id must be at most 100 characters.', 1);
  }
  const opened = openMemory(id, values, io);
  try {
    const dataDir =
      opened.registry.memoryDirFor(opened.record.slug) ??
      join(resolveHome(values, io), 'botharness', 'bots', opened.record.slug, 'memory');
    const head = expectedHead ?? currentHead(dataDir);
    const commit = callMemory(() =>
      opened.memory.saveHuman(OWNER_HUMAN_CONTEXT, {
        botSlug: opened.record.slug,
        path,
        body: text,
        expectedHead: head,
        editId,
      }),
    );
    io.stderr(`tobs: committed ${path} as ${commit.sha.slice(0, 7)} for ${opened.record.slug}`);
    return { bot: memoryBot(opened.record), commit };
  } finally {
    opened.owner.close();
  }
}
