import { isPresetSubEngineSelection, presetSubEngineTarget } from '../../models/preset-sub.js';
import { isModelRoute, type ModelRoute } from '../../models/presets.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import type {
  AssignmentDetail,
  AssignmentDirectoryPage,
  AssignmentDirectoryQuery,
  AssignmentSummary,
} from '../../runtime/bot-runtime.js';
import type { AssignmentPermissionSnapshot } from '../../workspaces/grants.js';
import type { AssignmentRow } from './events-types.js';
import type { AssignmentActivity } from '@botharness/host-protocol/wire';

export function permissionFromRow(row: AssignmentRow): AssignmentPermissionSnapshot | undefined {
  if (
    row.grant_id === null ||
    row.workspace_id === null ||
    row.primary_cwd === null ||
    (row.permission_mode !== 'workspace-write' && row.permission_mode !== 'danger-full-access') ||
    row.approval_policy !== 'ask' ||
    row.preset_revision === null
  )
    return undefined;
  return {
    grantId: row.grant_id,
    workspaceId: row.workspace_id,
    primaryCwd: row.primary_cwd,
    mode: row.permission_mode,
    approval: row.approval_policy,
    presetRevision: row.preset_revision,
  };
}

export function storedAssignmentTarget(row: AssignmentRow): RoutingTarget | ModelRoute | undefined {
  if (row.model_route_json === null) return undefined;
  const target: unknown = JSON.parse(row.model_route_json);
  if (isModelRoute(target)) return target;
  if (
    typeof target === 'object' &&
    target !== null &&
    'kind' in target &&
    target.kind === 'route' &&
    'route' in target &&
    isModelRoute(target.route)
  )
    return { kind: 'route', route: target.route };
  if (isPresetSubEngineSelection(target)) {
    const effort = 'reasoningEffort' in target ? target.reasoningEffort : undefined;
    if (effort === undefined) return presetSubEngineTarget(target);
    if (typeof effort === 'string' && effort.trim() !== '')
      return presetSubEngineTarget({ ...target, effort });
  }
  throw new Error(`Invalid Assignment model route: ${row.session_id}`);
}

export function assignmentTargetFromRow(row: AssignmentRow): RoutingTarget | undefined {
  const target = storedAssignmentTarget(row);
  return target === undefined || 'kind' in target ? target : { kind: 'route', route: target };
}

export function modelRouteFromRow(row: AssignmentRow): ModelRoute | undefined {
  const target = assignmentTargetFromRow(row);
  return target?.kind === 'route' ? target.route : undefined;
}

export function saveAssignmentTarget(target: RoutingTarget): string {
  return JSON.stringify(target.kind === 'route' ? target.route : target);
}

export function assignmentFromRow(row: AssignmentRow): AssignmentDetail {
  const latestReport =
    row.latest_report_state === null ||
    row.latest_report_summary === null ||
    row.latest_report_at === null
      ? undefined
      : {
          state: row.latest_report_state,
          summary: row.latest_report_summary,
          at: row.latest_report_at,
        };
  const openAsk =
    row.open_ask_source_event_id === null || row.open_ask_at === null
      ? undefined
      : {
          sourceEventId: row.open_ask_source_event_id,
          summary: row.open_ask_summary ?? row.latest_report_summary ?? '',
          at: row.open_ask_at,
        };
  return {
    sessionId: row.session_id,
    sourceEventId: row.source_event_id,
    botSlug: row.bot_slug,
    title: row.title,
    description: row.description,
    activity:
      row.stop_state === 'requested'
        ? 'stopping'
        : row.stop_state === 'stopped'
          ? 'stopped'
          : row.activity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(latestReport === undefined ? {} : { latestReport }),
    ...(row.continuity_key === null ? {} : { continuityKey: row.continuity_key }),
    ...(openAsk === undefined ? {} : { openAsk }),
    ...(permissionFromRow(row) === undefined ? {} : { permission: permissionFromRow(row)! }),
    ...(modelRouteFromRow(row) === undefined ? {} : { modelRoute: modelRouteFromRow(row)! }),
    ...(typeof row.model_group_id === 'string' ? { modelGroupId: row.model_group_id } : {}),
    ...(typeof row.model_effort === 'string' ? { modelGroupEffort: row.model_effort } : {}),
    ...(typeof row.agent_preset === 'string' ? { agentPreset: row.agent_preset } : {}),
    ...(isArchivedRow(row) ? { archivedAt: row.archived_at } : {}),
  };
}

export function isArchivedRow(row: AssignmentRow): row is AssignmentRow & { archived_at: string } {
  return typeof row.archived_at === 'string';
}

const ASSIGNMENT_DIRECTORY_DEFAULT_LIMIT = 20;

const ASSIGNMENT_DIRECTORY_MAX_LIMIT = 50;

const ASSIGNMENT_ACTIVITIES: readonly AssignmentActivity[] = [
  'working',
  'idle',
  'error',
  'stopping',
  'stopped',
];

function encodeDirectoryCursor(assignment: AssignmentSummary): string {
  return Buffer.from(
    JSON.stringify({ u: assignment.updatedAt, s: assignment.sessionId }),
    'utf8',
  ).toString('base64url');
}

function decodeDirectoryCursor(cursor: string): {
  updatedAt: string;
  sessionId: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    parsed = undefined;
  }
  const fields = parsed as { u?: unknown; s?: unknown } | null | undefined;
  if (typeof fields?.u !== 'string' || typeof fields.s !== 'string')
    throw new Error('Invalid Assignment Directory cursor; restart from the first page');
  return { updatedAt: fields.u, sessionId: fields.s };
}

export function queryAssignmentDirectory(
  assignments: readonly AssignmentSummary[],
  input: AssignmentDirectoryQuery,
): AssignmentDirectoryPage {
  const limit = input.limit ?? ASSIGNMENT_DIRECTORY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > ASSIGNMENT_DIRECTORY_MAX_LIMIT)
    throw new Error(
      `Assignment Directory limit must be an integer from 1 to ${ASSIGNMENT_DIRECTORY_MAX_LIMIT}`,
    );
  const activity = input.activity === undefined ? undefined : new Set(input.activity);
  for (const value of activity ?? [])
    if (!ASSIGNMENT_ACTIVITIES.includes(value))
      throw new Error(`Unknown Assignment activity filter: ${String(value)}`);
  const text = input.query?.trim().toLocaleLowerCase();
  const after = input.cursor === undefined ? undefined : decodeDirectoryCursor(input.cursor);
  const matches = assignments.filter((assignment) => {
    if (input.includeArchived !== true && assignment.archivedAt !== undefined) return false;
    if (activity !== undefined && !activity.has(assignment.activity)) return false;
    if (text !== undefined && text !== '') {
      const haystack = [
        assignment.title,
        assignment.description,
        assignment.continuityKey ?? '',
        assignment.latestReport?.summary ?? '',
      ]
        .join('\n')
        .toLocaleLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (after !== undefined)
      return (
        assignment.updatedAt < after.updatedAt ||
        (assignment.updatedAt === after.updatedAt && assignment.sessionId > after.sessionId)
      );
    return true;
  });
  const ordered = [...matches].sort((left, right) =>
    left.updatedAt === right.updatedAt
      ? left.sessionId < right.sessionId
        ? -1
        : left.sessionId > right.sessionId
          ? 1
          : 0
      : left.updatedAt < right.updatedAt
        ? 1
        : -1,
  );
  const page = ordered.slice(0, limit);
  const last = page.at(-1);
  return {
    assignments: page,
    ...(ordered.length > limit && last !== undefined
      ? { nextCursor: encodeDirectoryCursor(last) }
      : {}),
  };
}
