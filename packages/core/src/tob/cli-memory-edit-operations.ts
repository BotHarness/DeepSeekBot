import { createHash } from 'node:crypto';
import { ownsBot } from '../team/bot-access.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { MemoryAcceptError, type MemoryAcceptedCommit } from '../memory/accepted.js';
import { MemoryPathError } from '../memory/jail.js';
import type { MemoryService } from '../memory/service.js';
import { STANDING_FILES } from '../memory/soul.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_MEMORY_EDIT_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'memory-save',
    description: 'Save one reviewed Bot Memory or Soul file against its observed revision',
    write: true,
  },
  {
    command: 'memory-restore-commit',
    description: 'Restore a reviewed Bot Memory commit against its observed revision',
    write: true,
  },
];

export const TOB_MEMORY_EDIT_ERROR_CODES = [
  'memory-conflict',
  'memory-invalid',
  'memory-unknown-commit',
  'memory-review-too-large',
] as const;

export const MAX_MEMORY_REVIEW_DIFF_BYTES = 256 * 1024;

const SHA = /^[0-9a-f]{40}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

type MemoryEditOwner = Pick<
  MemoryService,
  'reviewHumanSave' | 'reviewHumanRestore' | 'saveHuman' | 'restoreCommitHuman'
>;

function refuse(code: string): never {
  throw new TobError(code);
}
function text(value: unknown, limit: number): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    [...value].length > limit ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    refuse('invalid-input');
  return value;
}
function keys(value: Record<string, unknown>, required: string[], optional: string[] = []) {
  if (
    Object.keys(value).some((key) => !required.includes(key) && !optional.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    refuse('invalid-input');
}
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
function owned<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof MemoryAcceptError) refuse(error.code);
    if (error instanceof MemoryPathError) refuse('invalid-input');
    throw error;
  }
}
function bounded(diff: string): string {
  if (Buffer.byteLength(diff, 'utf8') > MAX_MEMORY_REVIEW_DIFF_BYTES)
    refuse('memory-review-too-large');
  return diff;
}
function commitView(commit: MemoryAcceptedCommit) {
  return {
    sha: commit.sha,
    parentSha: commit.parentSha,
    actorKind: commit.actorKind,
    causeId: commit.causeId,
    acceptedAt: commit.acceptedAt,
  };
}
function fileView(path: string, revision: string, body: string | null) {
  return body === null
    ? { path, revision, exists: false }
    : {
        path,
        revision,
        exists: true,
        bytes: Buffer.byteLength(body, 'utf8'),
        sha256: sha256(body),
      };
}

export function memoryEditTakesEffect(paths: readonly string[]): string {
  return paths.some((path) => STANDING_FILES.includes(path))
    ? 'Soul and Core Memory are frozen into a running Session prompt: new Sessions use this change at once, and a running Session picks it up after its next compaction. Other Memory files are read on demand, so the next read in any Session sees them.'
    : 'Memory files are read on demand: the next read in any Session of this Bot sees the change. Running Session prompts do not change.';
}

export function createTobMemoryEditOperations(deps: {
  registry: Pick<PersonaBotRegistry, 'get' | 'getHistorical'>;
  memory: () => MemoryEditOwner | undefined;
  human?: () => HumanContext;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const human = () => deps.human?.() ?? OWNER_HUMAN_CONTEXT;
  const authorize = (slug: string) => {
    const historical = deps.registry.getHistorical(slug);
    if (historical && !ownsBot(human(), historical)) refuse('permission-required');
    const record = deps.registry.get(slug);
    if (!record) refuse('unknown-bot');
    if (!ownsBot(human(), record)) refuse('permission-required');
    if (deps.isProtectedBot(slug)) refuse('protected-bot');
    if (record.paused) refuse('archived-bot');
  };
  const owner = () => deps.memory() ?? refuse('memory-unavailable');
  return (command, raw) => {
    if (!TOB_MEMORY_EDIT_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) refuse('invalid-input');
    const args = structuredClone(raw);
    const slug = text(args.slug, 128);
    authorize(slug);
    const expectedHead = text(args.expectedHead, 40);
    if (!SHA.test(expectedHead)) refuse('invalid-input');
    const memory = owner();
    if (command === 'memory-save') {
      keys(args, ['slug', 'path', 'body', 'expectedHead', 'editId']);
      const path = text(args.path, 512);
      const editId = text(args.editId, 100);
      if (typeof args.body !== 'string') refuse('invalid-input');
      const body = args.body;
      const review = () =>
        owned(() => memory.reviewHumanSave({ botSlug: slug, path, body, editId }));
      const result = (commit: MemoryAcceptedCommit, file: ReturnType<typeof review>) => ({
        bot: slug,
        commit: commitView(commit),
        file: fileView(file.path, file.head, file.before),
        takesEffect: memoryEditTakesEffect([file.path]),
      });
      const initial = review();
      if (initial.accepted) {
        const accepted = initial.accepted;
        return {
          completed: true,
          run(guard) {
            guard();
            authorize(slug);
            const current = review();
            if (current.accepted?.sha !== accepted.sha) refuse('memory-conflict');
            return {
              ...result(accepted, current),
              file: fileView(current.path, accepted.sha, body),
              replayed: true,
            };
          },
        };
      }
      if (initial.head !== expectedHead) refuse('memory-conflict');
      const proposal = Object.freeze({
        command,
        target: slug,
        previousValue: Object.freeze(fileView(initial.path, expectedHead, initial.before)),
        patch: Object.freeze({
          path: initial.path,
          expectedHead,
          editId,
          bytes: Buffer.byteLength(body, 'utf8'),
          sha256: sha256(body),
          diff: bounded(initial.diff),
          takesEffect: memoryEditTakesEffect([initial.path]),
        }),
      });
      return {
        proposal,
        run(guard, beforeEffect) {
          guard();
          authorize(slug);
          const current = review();
          if (
            current.accepted ||
            current.head !== expectedHead ||
            current.before !== initial.before
          )
            refuse('memory-conflict');
          beforeEffect?.();
          const commit = owned(() =>
            memory.saveHuman(human(), { botSlug: slug, path, body, expectedHead, editId }),
          );
          let after: ReturnType<typeof review>;
          try {
            guard();
            authorize(slug);
            after = review();
          } catch {
            refuse('operation-outcome-uncertain');
          }
          if (
            after.accepted?.sha !== commit.sha ||
            after.head !== commit.sha ||
            after.before === null ||
            sha256(after.before) !== proposal.patch.sha256
          )
            refuse('readback-mismatch');
          return result(commit, after);
        },
      };
    }
    keys(args, ['slug', 'sha', 'expectedHead', 'restoreId'], ['name']);
    const sha = text(args.sha, 40);
    const restoreId = text(args.restoreId, 36);
    if (!SHA.test(sha) || !UUID.test(restoreId)) refuse('invalid-input');
    const name =
      args.name === undefined
        ? undefined
        : typeof args.name === 'string' && args.name.length <= 60 && !/[\r\n]/u.test(args.name)
          ? args.name
          : refuse('invalid-input');
    const review = () => owned(() => memory.reviewHumanRestore({ botSlug: slug, sha, restoreId }));
    const initial = review();
    if (initial.accepted) {
      const accepted = initial.accepted;
      const replayedPaths = initial.paths;
      return {
        completed: true,
        run(guard) {
          guard();
          authorize(slug);
          if (review().accepted?.sha !== accepted.sha) refuse('memory-conflict');
          return {
            bot: slug,
            commit: commitView(accepted),
            restoredFrom: sha,
            takesEffect: memoryEditTakesEffect(replayedPaths),
            replayed: true,
          };
        },
      };
    }
    if (initial.head !== expectedHead) refuse('memory-conflict');
    const takesEffect = memoryEditTakesEffect(initial.paths);
    const proposal = Object.freeze({
      command,
      target: slug,
      previousValue: Object.freeze({
        revision: expectedHead,
        uncommittedChanges: initial.dirty,
      }),
      patch: Object.freeze({
        sha,
        expectedHead,
        restoreId,
        ...(name === undefined ? {} : { name }),
        paths: Object.freeze([...initial.paths]),
        diff: bounded(initial.diff),
        takesEffect,
      }),
    });
    return {
      proposal,
      run(guard, beforeEffect) {
        guard();
        authorize(slug);
        const current = review();
        if (current.accepted || current.head !== expectedHead || current.diff !== initial.diff)
          refuse('memory-conflict');
        beforeEffect?.();
        const restored = owned(() =>
          memory.restoreCommitHuman(human(), {
            botSlug: slug,
            sha,
            expectedHead,
            restoreId,
            ...(name === undefined ? {} : { name }),
          }),
        );
        let after: ReturnType<typeof review>;
        try {
          guard();
          authorize(slug);
          after = review();
        } catch {
          refuse('operation-outcome-uncertain');
        }
        const accepted = after.accepted;
        if (accepted?.sha !== restored.head || after.head !== restored.head)
          refuse('readback-mismatch');
        return {
          bot: slug,
          commit: commitView(accepted),
          restoredFrom: sha,
          backup: restored.backup,
          version: restored.version,
          takesEffect,
        };
      },
    };
  };
}
