import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { botOwner } from '../../team/bot-access.js';
import { type HumanContext } from '../../humans/context.js';
import { MemoryImageError } from '../../memory/image.js';
import { inspectImage } from '../../media/image-format.js';
import type { OverviewMemory } from '../../memory/overview.js';
import { z } from 'zod';
import {
  memoryMoveTarget,
  moveMemoryDirectory,
  type MemoryMoveResult,
} from '../../bots/memory-move.js';
import {
  MemoryAcceptError,
  type MemoryAcceptedCommit,
  type MemoryAcceptedSnapshot,
  type MemoryGitGraph,
  type MemoryVersion,
  type MemoryVersionName,
  type MemoryGitCommitDiff,
  type MemoryWorkingChange,
  type MemoryWorkingDiff,
  type MemoryWorkingKind,
  type MemoryRepairEvent,
} from '../../memory/accepted.js';
import type { MemoryRecoveryCheckpoint } from '../../memory/recovery.js';
import type { MemoryService } from '../../memory/service.js';
import { MemoryFileError, type MemoryFileTarget } from '../../memory/file-actions.js';
import { MemoryPathError } from '../../memory/jail.js';
import { WorkspaceGrantError } from '../../workspaces/grants.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface MemoryBridgeDeps {
  memory?: MemoryService;
}

export interface MemoryBridgeMethods {
  memoryMove(
    payload: unknown,
  ): Promise<BridgeResult<{ memoryDir: string; moved: boolean; leftover?: string }>>;
  memoryFileTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;
  memoryImage(payload: unknown): BridgeResult<{ mime: string; dataBase64: string }>;
  memorySnapshot(payload: unknown): BridgeResult<{ snapshot: MemoryAcceptedSnapshot }>;
  memoryFile(payload: unknown): BridgeResult<{
    file?: {
      path: string;
      body: string;
      head: string;
      binary?: boolean;
      image?: import('../../memory/image.js').MemoryImage;
      markdown?: import('../../memory/markdown.js').MemoryMarkdown;
    };
  }>;
  memoryHistory(payload: unknown): BridgeResult<{ commits: MemoryAcceptedCommit[] }>;
  memoryDiff(payload: unknown): BridgeResult<{ sha: string; diff: string }>;
  memoryGitGraph(payload: unknown): BridgeResult<MemoryGitGraph>;
  memoryGitCommitDiff(payload: unknown): BridgeResult<MemoryGitCommitDiff>;
  memoryWorkingChanges(payload: unknown): BridgeResult<{ changes: MemoryWorkingChange[] }>;
  memoryWorkingDiff(payload: unknown): BridgeResult<MemoryWorkingDiff>;
  memoryRecoveryHistory(
    payload: unknown,
  ): BridgeResult<{ checkpoints: MemoryRecoveryCheckpoint[] }>;
  memoryRestore(payload: unknown): BridgeResult<{
    checkpoint: MemoryRecoveryCheckpoint;
    archivePath: string;
  }>;
  memorySave(payload: unknown): BridgeResult<{ commit: MemoryAcceptedCommit }>;
  memoryRestoreCommit(payload: unknown): BridgeResult<{
    head: string;
    backup: string | null;
    version: MemoryVersionName | null;
    saved: MemoryRecoveryCheckpoint;
  }>;
  memoryVersions(payload: unknown): BridgeResult<{ versions: MemoryVersion[] }>;
  memoryNameVersion(payload: unknown): BridgeResult<{ version: MemoryVersionName }>;
  memoryRemoveVersionName(payload: unknown): BridgeResult<{ removed: true }>;
  memoryRepair(payload: unknown): BridgeResult<{ repair: MemoryRepairEvent }>;
  overviewMemory(payload: unknown): Promise<BridgeResult<OverviewMemory>>;
}

export function createMemoryBridgeMethods(
  human: HumanContext,
  deps: MemoryBridgeDeps & Pick<BridgeMethodsDeps, 'registry' | 'runtime' | 'team'>,
  dmMemory: (payload: unknown) => { botSlug: string } | BridgeResult<never>,
): MemoryBridgeMethods {
  const memoryCall = <T>(operation: () => T): BridgeResult<T> => {
    if (deps.memory === undefined) {
      return {
        ok: false,
        error: {
          code: 'memory-unavailable',
          message: 'Memory Service unavailable',
        },
      };
    }
    try {
      return { ok: true, value: operation() };
    } catch (error) {
      if (error instanceof MemoryAcceptError || error instanceof MemoryImageError) {
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      }
      if (error instanceof MemoryFileError)
        return {
          ok: false,
          error: { code: error.code, message: error.message },
        };
      if (error instanceof MemoryPathError) return invalidInput(error.message);
      throw error;
    }
  };
  return {
    async memoryMove(payload) {
      const input = asObject(payload);
      const slug = asSlug(payload);
      const location = input?.['location'];
      if (slug === undefined || (location !== null && typeof location !== 'string'))
        return invalidInput('slug and location (a folder, or null for the default) are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.runtime?.replaceOrchestrator === undefined)
        return invalidInput('Moving Memory is unavailable on this Host');
      const target = memoryMoveTarget(
        deps.registry,
        slug,
        typeof location === 'string' && location.trim() !== '' ? location.trim() : null,
      );
      if (!target.ok)
        return {
          ok: false,
          error: { code: target.code, message: target.message },
        };
      try {
        const bot = deps.registry.get(slug);
        if (deps.team && bot) deps.team.spaces.assertMemoryPath(botOwner(bot), slug, target.to);
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return {
            ok: false,
            error: {
              code: error.code,
              message: error.code,
              ...(error.details ? { details: error.details } : {}),
            },
          };
        throw error;
      }
      if (target.to === target.from)
        return { ok: true, value: { memoryDir: target.from, moved: false } };
      try {
        if (deps.memory?.snapshot(slug).provisional === true)
          return {
            ok: false,
            error: {
              code: 'memory-conflict',
              message: 'Finish the Memory repair before moving Memory.',
            },
          };
      } catch {}
      let outcome;
      try {
        outcome = await deps.runtime.replaceOrchestrator(slug, (): MemoryMoveResult => {
          const moved = moveMemoryDirectory(target.from, target.to);
          try {
            deps.registry.setMemoryDir(slug, target.custom ? target.to : undefined);
          } catch (error) {
            moveMemoryDirectory(target.to, target.from);
            throw error;
          }
          return moved;
        });
      } catch (error) {
        return {
          ok: false,
          error: {
            code: 'memory-unavailable',
            message: `Memory was not moved: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
      if (outcome.outcome === 'refused')
        return {
          ok: false,
          error: { code: outcome.code, message: outcome.message },
        };
      return {
        ok: true,
        value: {
          memoryDir: target.to,
          moved: true,
          ...(outcome.value.leftover === undefined ? {} : { leftover: outcome.value.leftover }),
        },
      };
    },
    memoryFileTarget(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const path = source['path'];
      if (slug === undefined || typeof path !== 'string')
        return invalidInput('slug and path are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return memoryCall(() => ({
        target: deps.memory!.fileTarget(slug, path),
      }));
    },
    memoryImage(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          path: z.string().min(1),
          source: z.string().min(1),
          revision: z.string().min(1),
          reference: z.string().optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('slug, path, source and revision are required');
      const { slug, path, source, revision, reference } = input.data;
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return memoryCall(() => {
        const bytes =
          reference === undefined
            ? deps.memory!.imageFile(slug, path, source, revision)
            : deps.memory!.markdownImageFile(slug, path, source, revision, reference);
        return { mime: inspectImage(bytes).mime, dataBase64: bytes.toString('base64') };
      });
    },
    memorySnapshot(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        snapshot: deps.memory!.snapshot(scope.botSlug),
      }));
    },
    memoryFile(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const path = asNonBlank(asObject(payload), 'path');
      if (path === undefined) return invalidInput('path is required');
      return memoryCall(() => {
        const file = deps.memory!.readAccepted(scope.botSlug, path);
        return file === undefined ? {} : { file };
      });
    },
    memoryHistory(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        commits: deps.memory!.history(scope.botSlug),
      }));
    },
    memoryDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const sha = asNonBlank(asObject(payload), 'sha');
      if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha))
        return invalidInput('valid sha is required');
      return memoryCall(() => deps.memory!.diff(scope.botSlug, sha));
    },
    memoryGitGraph(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const offset = asObject(payload)['offset'];
      if (
        offset !== undefined &&
        (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 10_000)
      )
        return invalidInput('valid offset is required');
      const path = asObject(payload)['path'];
      if (path !== undefined && (typeof path !== 'string' || path.trim() === ''))
        return invalidInput('valid path is required');
      return memoryCall(() =>
        deps.memory!.gitGraph(scope.botSlug, Number(offset ?? 0), path as string | undefined),
      );
    },
    memoryGitCommitDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const sha = asNonBlank(asObject(payload), 'sha');
      if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha))
        return invalidInput('valid sha is required');
      return memoryCall(() => deps.memory!.gitCommitDiff(scope.botSlug, sha));
    },
    memoryWorkingChanges(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        changes: deps.memory!.workingChanges(scope.botSlug),
      }));
    },
    memoryWorkingDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const path = asNonBlank(source, 'path');
      const kind = source['kind'];
      if (
        path === undefined ||
        !['staged', 'unstaged', 'untracked', 'current'].includes(String(kind))
      ) {
        return invalidInput('valid path and kind are required');
      }
      return memoryCall(() =>
        deps.memory!.workingDiff(scope.botSlug, path, kind as MemoryWorkingKind),
      );
    },
    memoryRecoveryHistory(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        checkpoints: deps.memory!.recoveryHistory(scope.botSlug),
      }));
    },
    memoryRestore(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const checkpointId = asNonBlank(source, 'checkpointId');
      const expectedCurrentId = asNonBlank(source, 'expectedCurrentId');
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
      if (
        checkpointId === undefined ||
        expectedCurrentId === undefined ||
        !uuid.test(checkpointId) ||
        !uuid.test(expectedCurrentId)
      )
        return invalidInput('valid checkpointId and expectedCurrentId are required');
      return memoryCall(() =>
        deps.memory!.restoreHuman(human, {
          botSlug: scope.botSlug,
          checkpointId,
          expectedCurrentId,
        }),
      );
    },
    memorySave(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const path = asNonBlank(source, 'path');
      const body = source['body'];
      const expectedHead = asNonBlank(source, 'expectedHead');
      const editId = asNonBlank(source, 'editId');
      if (
        path === undefined ||
        typeof body !== 'string' ||
        expectedHead === undefined ||
        editId === undefined ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        editId.length > 100
      ) {
        return invalidInput('path, body, expectedHead, and editId are required');
      }
      return memoryCall(() => ({
        commit: deps.memory!.saveHuman(human, {
          botSlug: scope.botSlug,
          path,
          body,
          expectedHead,
          editId,
        }),
      }));
    },
    memoryRestoreCommit(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const sha = asNonBlank(source, 'sha');
      const expectedHead = asNonBlank(source, 'expectedHead');
      const restoreId = asNonBlank(source, 'restoreId');
      const name = source['name'];
      if (
        (name !== undefined &&
          (typeof name !== 'string' || name.length > 60 || /[\r\n]/u.test(name))) ||
        sha === undefined ||
        expectedHead === undefined ||
        restoreId === undefined ||
        !/^[0-9a-f]{40}$/u.test(sha) ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(restoreId)
      )
        return invalidInput('valid sha, expectedHead, restoreId, and name are required');
      return memoryCall(() =>
        deps.memory!.restoreCommitHuman(human, {
          botSlug: scope.botSlug,
          sha,
          expectedHead,
          restoreId,
          ...(name === undefined ? {} : { name }),
        }),
      );
    },
    memoryVersions(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({
        versions: deps.memory!.versions(scope.botSlug),
      }));
    },
    memoryNameVersion(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const sha = asNonBlank(source, 'sha');
      const name = asNonBlank(source, 'name');
      if (
        sha === undefined ||
        name === undefined ||
        !/^[0-9a-f]{40}$/u.test(sha) ||
        name.length > 60
      )
        return invalidInput('valid sha and name are required');
      return memoryCall(() => ({
        version: deps.memory!.nameVersionHuman({
          botSlug: scope.botSlug,
          sha,
          name,
        }),
      }));
    },
    memoryRemoveVersionName(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const tag = asNonBlank(asObject(payload), 'tag');
      if (tag === undefined || tag.length > 200) return invalidInput('valid tag is required');
      return memoryCall(() => {
        deps.memory!.removeVersionNameHuman({ botSlug: scope.botSlug, tag });
        return { removed: true as const };
      });
    },
    memoryRepair(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const expectedHead = asNonBlank(source, 'expectedHead');
      const repairId = asNonBlank(source, 'repairId');
      if (
        expectedHead === undefined ||
        repairId === undefined ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(repairId)
      )
        return invalidInput('valid expectedHead and repairId are required');
      return memoryCall(() => ({
        repair: deps.memory!.repairHuman(human, {
          botSlug: scope.botSlug,
          expectedHead,
          repairId,
        }),
      }));
    },
    async overviewMemory(payload) {
      const after = asObject(payload)['after'];
      if (
        after !== undefined &&
        (typeof after !== 'string' || after.length === 0 || after.length > 255)
      )
        return invalidInput('Overview Memory requires an optional Bot cursor');
      if (deps.memory?.overviewActivity === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Memory statistics unavailable',
          },
        };
      return { ok: true, value: await deps.memory.overviewActivity(after) };
    },
  };
}
