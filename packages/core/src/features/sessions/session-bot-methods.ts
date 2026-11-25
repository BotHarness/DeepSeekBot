import { createHash, randomUUID } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { BridgeMethodsDeps, PersonaBotDetail } from '../../bridge/methods.js';
import {
  asObject,
  invalidInput,
  parseOptional,
  parseRoles,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import {
  BotCreationError,
  validBotCreationKey,
  type BotCreationReceipt,
} from '../../bots/creation.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { HumanContext } from '../../humans/context.js';
import { WorkspaceGrantError, type WorkspaceGrant } from '../../workspaces/grants.js';
import {
  pathWithin,
  SESSION_SEED_MAX,
  sessionSeedIds,
  sessionSeedMessage,
} from './workspace-sessions.js';
import { isExternalSessionId, type ExternalSessionSummary } from './external-sessions.js';

export function tooBroadToAdd(path: string, home = homedir()): boolean {
  const real = (value: string): string => {
    try {
      return realpathSync(value);
    } catch {
      return resolve(value);
    }
  };
  const targets = [resolve(path), real(path)];
  const homes = [resolve(home), real(home)];
  return targets.some(
    (target) =>
      dirname(target) === target ||
      homes.some(
        (root) =>
          target === root ||
          ['.claude', '.codex', '.ssh', '.deepseek'].some((name) =>
            pathWithin(join(root, name), target),
          ),
      ),
  );
}

function isFolder(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export interface SessionBotCreated {
  bot: PersonaBotDetail;
  channelId: string;
  receipt: BotCreationReceipt;
  grants: WorkspaceGrant[];
  seedMessageId: string;
}

type Send = (payload: {
  channelId: string;
  body: string;
  messageId: string;
}) => Promise<BridgeResult<{ message: { id: string } }>>;

function failure(code: string, message: string): BridgeResult<never> {
  return { ok: false, error: { code, message } };
}

export function seedMessageId(operationKey: string): string {
  const hex = createHash('sha256').update(`session-seed:${operationKey}`).digest('hex');
  return `human-${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function createSessionBotMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
  send: Send,
) {
  return {
    async externalSessions(): Promise<BridgeResult<{ sessions: ExternalSessionSummary[] }>> {
      if (human.caller === 'bot' || !isHostOwner())
        return failure('permission-required', 'Host Owner permission is required');
      if (deps.externalSessions === undefined)
        return failure('unavailable', 'Reading other products is unavailable on this Host.');
      const sessions = await deps.externalSessions.list().catch(() => undefined);
      if (sessions === undefined)
        return failure('unavailable', 'The Host could not read sessions from other products.');
      return { ok: true, value: { sessions } };
    },
    async createFromSessions(payload: unknown): Promise<BridgeResult<SessionBotCreated>> {
      if (human.caller === 'bot' || !isHostOwner())
        return failure('permission-required', 'Host Owner permission is required');
      const source = asObject(payload);
      const displayName = source['displayName'];
      if (typeof displayName !== 'string' || displayName.trim().length === 0)
        return invalidInput('displayName is required');
      const sessionIds = sessionSeedIds(source['sessionIds']);
      if (sessionIds === undefined)
        return invalidInput(`sessionIds must list 1 to ${SESSION_SEED_MAX} Session IDs`);
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      const persona = parseOptional(source, 'persona');
      if (!roles.ok || !description.ok || !persona.ok)
        return invalidInput('invalid create payload');
      const language = source['language'] === 'zh' ? 'zh' : 'en';
      const operationKey = source['operationKey'] ?? `sessions:${randomUUID()}`;
      if (typeof operationKey !== 'string' || !validBotCreationKey(operationKey))
        return invalidInput(
          'operationKey must be 8 to 128 letters, digits, dots, colons, underscores or hyphens',
        );
      const previewed = source['workspacePaths'];
      if (
        previewed !== undefined &&
        (!Array.isArray(previewed) || !previewed.every((path) => typeof path === 'string'))
      )
        return invalidInput('workspacePaths must list the previewed Workspace paths');
      const addFolders = source['addWorkspaces'] === true;
      const { nativeSessions, creations, grants } = deps;
      if (nativeSessions === undefined || creations === undefined || grants === undefined)
        return failure(
          'creation-unavailable',
          'Creating from Sessions is unavailable on this Host.',
        );

      const rows = sessionIds.every(isExternalSessionId)
        ? []
        : await nativeSessions.list().catch(() => undefined);
      if (rows === undefined) return failure('unavailable', 'Host Sessions are unavailable');
      const byId = new Map(rows.map((row) => [row.sessionId, row]));
      const seeds: { sessionId: string; title?: string; cwd: string }[] = [];
      const others = sessionIds.some(isExternalSessionId)
        ? await (deps.externalSessions?.list() ?? Promise.resolve([])).catch(() => [])
        : [];
      const otherById = new Map(others.map((row) => [row.sessionId, row]));
      for (const id of sessionIds) {
        if (isExternalSessionId(id)) {
          const other = otherById.get(id);
          if (other === undefined)
            return failure('session-not-found', `Unknown imported session: ${id}`);
          seeds.push({
            sessionId: id,
            ...(other.title === undefined ? {} : { title: other.title }),
            cwd: other.cwd,
          });
          continue;
        }
        const row = byId.get(id);
        if (
          row === undefined ||
          row.parentSessionId !== undefined ||
          deps.ownership.resolve(id) !== undefined
        )
          return failure('session-not-found', `Unknown DeepSeek Session: ${id}`);
        if (row.cwd === undefined)
          return failure('session-without-workspace', `Session ${id} has no Workspace`);
        seeds.push({
          sessionId: id,
          ...(row.title === undefined ? {} : { title: row.title }),
          cwd: row.cwd,
        });
      }
      const available = grants.availableWorkspaces();
      const workspaces = new Map<string, { id: string; path: string }>();
      const missing = new Set<string>();
      for (const seed of seeds) {
        const match = available
          .filter((workspace) => pathWithin(workspace.path, seed.cwd))
          .sort((a, b) => b.path.length - a.path.length)[0];
        if (match !== undefined) workspaces.set(match.id, match);
        else if (addFolders && tooBroadToAdd(seed.cwd))
          return failure(
            'workspace-too-broad',
            `${seed.cwd} is too broad to add as a Workspace; add a project folder in DSH first.`,
          );
        else if (addFolders && deps.registerWorkspace !== undefined && isFolder(seed.cwd))
          missing.add(seed.cwd);
        else return failure('workspace-unavailable', `No DSH Workspace contains ${seed.cwd}`);
      }
      const outermost = [...missing].filter(
        (path) => ![...missing].some((other) => other !== path && pathWithin(other, path)),
      );
      const resolved = [
        ...new Set([...[...workspaces.values()].map((workspace) => workspace.path), ...outermost]),
      ].sort();
      if (
        previewed !== undefined &&
        JSON.stringify([...new Set(previewed as string[])].sort()) !== JSON.stringify(resolved)
      )
        return failure(
          'workspace-preview-changed',
          `These Sessions would grant ${resolved.join(', ')}; review the Workspaces and try again.`,
        );

      const soul = persona.value?.trim();
      const input = {
        displayName: displayName.trim(),
        ...(soul ? { persona: soul } : {}),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
      };
      const scope = { kind: 'sessions-v1', sessionIds };
      let fresh: boolean;
      try {
        fresh = creations.lookup(operationKey, input, scope) === undefined;
      } catch (error) {
        if (error instanceof BotCreationError) return failure(error.code, error.message);
        throw error;
      }

      for (const path of outermost) {
        const added = await deps.registerWorkspace!(path).catch(() => undefined);
        if (added === undefined)
          return failure(
            'workspace-register-failed',
            'The Host could not add a session folder as a Workspace.',
          );
        if (added.path !== path)
          return failure(
            'workspace-preview-changed',
            `${path} was added as ${added.path}; review the Workspaces and try again.`,
          );
        workspaces.set(added.id, added);
      }

      let created;
      try {
        created = creations.create(input, operationKey, scope);
      } catch (error) {
        if (error instanceof BotCreationError) return failure(error.code, error.message);
        throw error;
      }
      const slug = created.record.slug;
      const granted: WorkspaceGrant[] = [];
      try {
        for (const workspace of workspaces.values()) {
          const current = grants
            .list(slug)
            .find((grant) => grant.workspaceId === workspace.id && grant.revokedAt === undefined);
          granted.push(current ?? (await grants.create(slug, workspace.id)));
        }
      } catch (error) {
        if (error instanceof WorkspaceGrantError) return failure(error.code, error.message);
        throw error;
      }
      const sent = await send({
        channelId: created.channelId,
        messageId: seedMessageId(operationKey),
        body: sessionSeedMessage(
          seeds,
          granted.map((grant) => grant.workspacePath),
          language,
        ),
      });
      if (!sent.ok) return sent;
      if (fresh)
        deps.telemetry?.capture?.('bot_library:sessions_import', {
          has_deepseek: sessionIds.some((id) => !isExternalSessionId(id)),
          has_claude_code: sessionIds.some((id) => id.startsWith('claude-code:')),
          has_codex: sessionIds.some((id) => id.startsWith('codex:')),
          added_workspace: outermost.length > 0,
        });
      return {
        ok: true,
        value: {
          ...detailOf(created.record),
          channelId: created.channelId,
          receipt: {
            ...(created.receipt ?? {
              botSlug: slug,
              status: 'created',
              channelId: created.channelId,
            }),
            operationKey,
          },
          grants: granted,
          seedMessageId: sent.value.message.id,
        },
      };
    },
  };
}
