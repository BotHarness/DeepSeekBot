import type { HostClient } from './client';
import type { ProfileAssignment } from './bot-profile';

export type AssignmentTimelineStatus = 'running' | 'done' | 'failed' | 'denied' | 'cancelled';

export type AssignmentToolKind =
  | 'read'
  | 'edit'
  | 'delete'
  | 'move'
  | 'search'
  | 'execute'
  | 'fetch'
  | 'other';

export interface AssignmentTimelineEntry {
  status: AssignmentTimelineStatus;
  kind: AssignmentToolKind;
  tool: string;
  detail?: string;
  at: string;
}

export interface AssignmentTimelineLane {
  role: 'main' | 'subagent';
  index: number;
  sessionId: string;
  title?: string;
  entries: AssignmentTimelineEntry[];
  omitted: number;
}

export interface AssignmentTimeline {
  assignment: ProfileAssignment;
  lanes: AssignmentTimelineLane[];
  omittedSubagents: number;
}

const STATUSES: readonly string[] = ['running', 'done', 'failed', 'denied', 'cancelled'];
const KINDS: readonly string[] = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'fetch',
  'other',
];

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function entryOf(value: unknown): AssignmentTimelineEntry | undefined {
  const entry = record(value);
  const { status, kind, tool, detail, at } = entry;
  if (
    typeof status !== 'string' ||
    !STATUSES.includes(status) ||
    typeof tool !== 'string' ||
    typeof at !== 'string'
  )
    return undefined;
  return {
    status: status as AssignmentTimelineStatus,
    kind: typeof kind === 'string' && KINDS.includes(kind) ? (kind as AssignmentToolKind) : 'other',
    tool,
    ...(typeof detail === 'string' && detail.trim() !== '' ? { detail } : {}),
    at,
  };
}

function laneOf(value: unknown): AssignmentTimelineLane | undefined {
  const lane = record(value);
  const { role, index, sessionId, title, entries, omitted } = lane;
  if (
    (role !== 'main' && role !== 'subagent') ||
    typeof index !== 'number' ||
    typeof sessionId !== 'string' ||
    !Array.isArray(entries)
  )
    return undefined;
  return {
    role,
    index,
    sessionId,
    ...(typeof title === 'string' && title.trim() !== '' ? { title } : {}),
    entries: entries.flatMap((entry) => entryOf(entry) ?? []),
    omitted: typeof omitted === 'number' && omitted > 0 ? omitted : 0,
  };
}

export function parseAssignmentTimeline(value: unknown): AssignmentTimeline {
  const body = record(value);
  const assignment = record(body['assignment']);
  if (
    typeof assignment['sessionId'] !== 'string' ||
    typeof assignment['title'] !== 'string' ||
    typeof assignment['updatedAt'] !== 'string' ||
    !Array.isArray(body['lanes'])
  )
    throw new Error('The Host sent an unreadable Assignment timeline.');
  return {
    assignment: assignment as unknown as ProfileAssignment,
    lanes: body['lanes'].flatMap((lane) => laneOf(lane) ?? []),
    omittedSubagents:
      typeof body['omittedSubagents'] === 'number' && body['omittedSubagents'] > 0
        ? body['omittedSubagents']
        : 0,
  };
}

export async function loadAssignmentTimeline(
  client: HostClient,
  slug: string,
  sessionId: string,
): Promise<AssignmentTimeline> {
  return parseAssignmentTimeline(
    await client.call<unknown>('assignmentTimeline', { slug, sessionId }),
  );
}

export function laneLabel(lane: Pick<AssignmentTimelineLane, 'role' | 'index'>): string {
  return lane.role === 'main' ? 'MAIN' : `SUBAGENT ${String(lane.index).padStart(2, '0')}`;
}
