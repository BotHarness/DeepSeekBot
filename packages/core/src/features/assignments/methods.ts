import {
  asNonBlank,
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { type HumanContext } from '../../humans/context.js';
import { type HumanAssignmentContext } from '../../runtime/assignment-human-context.js';
import { summarizeSessionProgress, type SessionProgress } from '../../runtime/session-progress.js';
import {
  summarizeAssignmentTimeline,
  summarizeSubagentLanes,
  TIMELINE_SUBAGENTS,
  type AssignmentTimelineLane,
  type AssignmentTimelineSession,
} from '../../runtime/assignment-timeline.js';
import { z } from 'zod';
import type { SessionOwnership, SessionRootRole } from '../../sessions/ownership.js';
import type { DshUsageSessionLogReader } from '../../usage/usage.js';
import type {
  AssignmentAccessStore,
  AssignmentAccessPreset,
} from '../../workspaces/assignment-access.js';
import { queryAssignmentDirectory } from '../../runtime/bot-runtime.js';
import type {
  AssignmentDetail,
  AssignmentSummary,
  ChannelAssignmentSummary,
} from '../../runtime/bot-runtime.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface AssignmentsBridgeDeps {
  assignmentAccess?: AssignmentAccessStore;
}

export interface AssignmentsBridgeMethods {
  humanAssignmentContext(payload: unknown): BridgeResult<{ context: HumanAssignmentContext }>;
  assignments(payload: unknown): BridgeResult<{ assignments: AssignmentSummary[] }>;
  channelAssignments(payload: unknown): BridgeResult<{ assignments: ChannelAssignmentSummary[] }>;
  assignment(payload: unknown): BridgeResult<{ assignment: AssignmentDetail }>;
  assignmentTimeline(payload: unknown): Promise<
    BridgeResult<{
      assignment: AssignmentDetail;
      lanes: AssignmentTimelineLane[];
      omittedSubagents: number;
    }>
  >;
  sessionSubagents(payload: unknown): Promise<
    BridgeResult<{
      sessionId: string;
      role: SessionRootRole;
      lanes: AssignmentTimelineLane[];
      omittedSubagents: number;
    }>
  >;
  sessionProgress(payload: unknown): Promise<BridgeResult<{ sessions: SessionProgressEntry[] }>>;
  assignmentAccessGet(payload: unknown): BridgeResult<{ preset: AssignmentAccessPreset }>;
  assignmentAccessSet(payload: unknown): BridgeResult<{ preset: AssignmentAccessPreset }>;
}

function unknownAssignment(sessionId: string): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: `unknown Assignment: ${sessionId}` },
  };
}

export const SESSION_PROGRESS_LIMIT = 30;

export type SessionProgressEntry = { sessionId: string } & (
  | SessionProgress
  | { error: 'not-found' | 'unavailable' }
);

async function sessionLogOf(
  read: DshUsageSessionLogReader,
  sessionId: string,
): Promise<AssignmentTimelineSession> {
  return { sessionId, events: (await read(sessionId))?.events ?? [] };
}

async function subagentSessionsOf(
  ownership: SessionOwnership,
  read: DshUsageSessionLogReader,
  slug: string,
  sessionId: string,
): Promise<AssignmentTimelineSession[]> {
  const subagents = ownership
    .descendantsOf(sessionId)
    .filter((record) => record.botSlug === slug && record.provenance === 'subagent');
  const skipped = Math.max(0, subagents.length - TIMELINE_SUBAGENTS);
  return [
    ...subagents.slice(0, skipped).map((record) => ({ sessionId: record.sessionId, events: [] })),
    ...(await Promise.all(
      subagents.slice(skipped).map((record) => sessionLogOf(read, record.sessionId)),
    )),
  ];
}

export function createAssignmentsBridgeMethods(
  human: HumanContext,
  deps: AssignmentsBridgeDeps &
    Pick<
      BridgeMethodsDeps,
      | 'channels'
      | 'defaultModel'
      | 'describeToolCall'
      | 'humanAttention'
      | 'ownership'
      | 'readUsageSessionLog'
      | 'registry'
      | 'runtime'
      | 'usage'
    >,
): AssignmentsBridgeMethods {
  return {
    humanAssignmentContext(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const sessionId = asNonBlank(source, 'sessionId');
      const sourceEventId = asNonBlank(source, 'sourceEventId');
      if (
        slug === undefined ||
        sessionId === undefined ||
        sessionId.length > 150 ||
        sourceEventId === undefined ||
        sourceEventId.length > 150
      )
        return invalidInput('Bot, Assignment Session and report Source Event are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const context = deps.humanAttention?.assignmentContext(slug, sessionId, sourceEventId);
      if (context === undefined)
        return invalidInput('Assignment report is unavailable for this Bot');
      return {
        ok: true,
        value: {
          context: {
            ...context,
            canReply:
              context.canReply &&
              deps.registry.get(slug)?.paused !== true &&
              deps.channels.get('dm-' + slug)?.botSlug === slug,
          },
        },
      };
    },
    assignments(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignments = deps.runtime?.listAssignments(slug) ?? [];
      const filter = z
        .object({
          query: z.string().max(200).optional(),
          activity: z.array(z.enum(['working', 'idle', 'error', 'stopping', 'stopped'])).optional(),
          includeArchived: z.boolean().optional(),
          limit: z.number().int().optional(),
          cursor: z.string().optional(),
        })
        .safeParse(asObject(payload));
      if (!filter.success) return invalidInput('invalid Assignment Directory query');
      const { query, includeArchived, limit, cursor } = filter.data;
      const activity = filter.data.activity?.length === 0 ? undefined : filter.data.activity;
      if ([query, activity, includeArchived, limit, cursor].every((value) => value === undefined))
        return { ok: true, value: { assignments } };
      try {
        return {
          ok: true,
          value: queryAssignmentDirectory(assignments, {
            ...(query === undefined ? {} : { query }),
            ...(activity === undefined ? {} : { activity }),
            ...(includeArchived === undefined ? {} : { includeArchived }),
            ...(limit === undefined ? {} : { limit }),
            ...(cursor === undefined ? {} : { cursor }),
          }),
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    channelAssignments(payload) {
      const parsed = z.object({ channelId: z.string().min(1) }).safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group channel');
      const channel = deps.channels.get(parsed.data.channelId);
      if (
        channel?.type !== 'group' ||
        channel.deletedAt ||
        !deps.channels
          .listHumanMembers(human, channel.id)
          .some((member) => member.humanId === human.humanId)
      )
        return invalidInput('Group channel unavailable');
      const assignments = deps.runtime?.listChannelAssignments?.(channel.id) ?? [];
      const subagentCounts = deps.ownership.subagentCounts(
        assignments.map((assignment) => assignment.sessionId),
      );
      return {
        ok: true,
        value: {
          assignments: assignments.map((assignment) => {
            const subagentCount = subagentCounts.get(assignment.sessionId);
            const modelRoute =
              deps.usage?.latestRoute(assignment.sessionId) ??
              assignment.modelRoute ??
              deps.registry.get(assignment.botSlug)?.modelPlan?.assignmentDefault ??
              deps.defaultModel?.currentSelection();
            return {
              ...assignment,
              ...(modelRoute === undefined ? {} : { modelRoute }),
              ...(subagentCount === undefined ? {} : { subagentCount }),
            };
          }),
        },
      };
    },
    assignment(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignment = deps.runtime?.getAssignment(slug, sessionId);
      if (assignment === undefined) return unknownAssignment(sessionId);
      return { ok: true, value: { assignment } };
    },
    async assignmentTimeline(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const assignment = deps.runtime?.getAssignment(slug, sessionId);
      if (assignment === undefined) return unknownAssignment(sessionId);
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const [main, subagents] = await Promise.all([
        sessionLogOf(read, sessionId),
        subagentSessionsOf(deps.ownership, read, slug, sessionId),
      ]);
      const timeline = summarizeAssignmentTimeline({
        main,
        subagents,
        describe: (id, name, args) => deps.describeToolCall?.(id, name, args),
      });
      return { ok: true, value: { assignment, ...timeline } };
    },
    async sessionSubagents(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const owner = deps.ownership.resolve(sessionId);
      if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
        return {
          ok: false,
          error: {
            code: 'not-found',
            message: `unknown root Session: ${sessionId}`,
          },
        };
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const children = summarizeSubagentLanes({
        subagents: await subagentSessionsOf(deps.ownership, read, slug, sessionId),
        describe: (id, name, args) => deps.describeToolCall?.(id, name, args),
      });
      return {
        ok: true,
        value: { sessionId, role: owner.rootRole, ...children },
      };
    },
    async sessionProgress(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      if (slug === undefined) return invalidInput('slug is required');
      const ids = source?.['sessionIds'];
      if (
        !Array.isArray(ids) ||
        ids.length === 0 ||
        ids.length > SESSION_PROGRESS_LIMIT ||
        !ids.every((id) => typeof id === 'string' && id.trim() !== '')
      )
        return invalidInput(`sessionIds must list 1 to ${SESSION_PROGRESS_LIMIT} Session ids`);
      if (deps.registry.getHistorical(slug) === undefined) return unknownBot(slug);
      const read = deps.readUsageSessionLog;
      if (read === undefined) return unavailable();
      const sessions = await Promise.all(
        [...new Set(ids as string[])].map(async (sessionId): Promise<SessionProgressEntry> => {
          const owner = deps.ownership.resolve(sessionId);
          if (owner?.botSlug !== slug || owner.parentSessionId !== undefined)
            return { sessionId, error: 'not-found' };
          try {
            const log = await read(sessionId);
            return { sessionId, ...summarizeSessionProgress(log?.events ?? []) };
          } catch {
            return { sessionId, error: 'unavailable' };
          }
        }),
      );
      return { ok: true, value: { sessions } };
    },
    assignmentAccessGet(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return {
        ok: true,
        value: {
          preset: deps.assignmentAccess?.get(slug) ?? {
            botSlug: slug,
            mode: 'workspace-write',
            scope: 'chat',
            revision: 0,
          },
        },
      };
    },
    assignmentAccessSet(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const mode = source['mode'];
      if (slug === undefined || (mode !== 'workspace-write' && mode !== 'danger-full-access'))
        return invalidInput('slug and valid mode are required');
      if (mode === 'danger-full-access' && source['acknowledgeRisk'] !== true)
        return invalidInput('Dangerous access requires explicit Human risk acknowledgement');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.assignmentAccess === undefined)
        return invalidInput('Assignment access is unavailable');
      const scope = source['scope'];
      if (scope !== undefined && scope !== 'chat' && scope !== 'assignments')
        return invalidInput('scope must be chat or assignments');
      return {
        ok: true,
        value: { preset: deps.assignmentAccess.set(slug, mode, scope, human) },
      };
    },
  };
}
