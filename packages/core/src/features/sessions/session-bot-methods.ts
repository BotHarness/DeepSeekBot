import { createHash, randomUUID } from 'node:crypto';
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
      const { nativeSessions, creations, grants } = deps;
      if (nativeSessions === undefined || creations === undefined || grants === undefined)
        return failure(
          'creation-unavailable',
          'Creating from Sessions is unavailable on this Host.',
        );

      const rows = await nativeSessions.list().catch(() => undefined);
      if (rows === undefined) return failure('unavailable', 'Host Sessions are unavailable');
      const byId = new Map(rows.map((row) => [row.sessionId, row]));
      const seeds: { sessionId: string; title?: string; cwd: string }[] = [];
      for (const id of sessionIds) {
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
      for (const seed of seeds) {
        const match = available
          .filter((workspace) => pathWithin(workspace.path, seed.cwd))
          .sort((a, b) => b.path.length - a.path.length)[0];
        if (match === undefined)
          return failure('workspace-unavailable', `No DSH Workspace contains ${seed.cwd}`);
        workspaces.set(match.id, match);
      }

      let created;
      try {
        const soul = persona.value?.trim();
        created = creations.create(
          {
            displayName: displayName.trim(),
            ...(soul ? { persona: soul } : {}),
            ...(description.value === undefined ? {} : { description: description.value }),
            ...(roles.value === undefined ? {} : { roles: roles.value }),
          },
          operationKey,
          { kind: 'sessions-v1', sessionIds },
        );
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
