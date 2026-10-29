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
  round?: number;
}

export interface AssignmentTimelineRound {
  index: number;
  kind: 'created' | 'continued';
  at: string;
  instruction?: string;
}

export interface AssignmentTimelineLane {
  role: 'main' | 'subagent';
  index: number;
  sessionId: string;
  title?: string;
  round?: number;
  entries: AssignmentTimelineEntry[];
  omitted: number;
}

export interface AssignmentTimeline {
  assignment: ProfileAssignment;
  rounds: AssignmentTimelineRound[];
  lanes: AssignmentTimelineLane[];
  omittedSubagents: number;
  omittedRounds: number;
}

export interface AssignmentTimelineGroup {
  round?: AssignmentTimelineRound;
  main: AssignmentTimelineEntry[];
  subagents: AssignmentTimelineLane[];
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
  const { status, kind, tool, detail, at, round } = entry;
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
    ...(typeof round === 'number' ? { round } : {}),
  };
}

function laneOf(value: unknown): AssignmentTimelineLane | undefined {
  const lane = record(value);
  const { role, index, sessionId, title, round, entries, omitted } = lane;
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
    ...(typeof round === 'number' ? { round } : {}),
    entries: entries.flatMap((entry) => entryOf(entry) ?? []),
    omitted: typeof omitted === 'number' && omitted > 0 ? omitted : 0,
  };
}

function roundOf(value: unknown): AssignmentTimelineRound | undefined {
  const { index, kind, at, instruction } = record(value);
  if (
    typeof index !== 'number' ||
    (kind !== 'created' && kind !== 'continued') ||
    typeof at !== 'string'
  )
    return undefined;
  return {
    index,
    kind,
    at,
    ...(typeof instruction === 'string' && instruction.trim() !== '' ? { instruction } : {}),
  };
}

function count(value: unknown): number {
  return typeof value === 'number' && value > 0 ? value : 0;
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
    rounds: Array.isArray(body['rounds'])
      ? body['rounds'].flatMap((round) => roundOf(round) ?? [])
      : [],
    lanes: body['lanes'].flatMap((lane) => laneOf(lane) ?? []),
    omittedSubagents: count(body['omittedSubagents']),
    omittedRounds: count(body['omittedRounds']),
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

export function groupTimeline(timeline: AssignmentTimeline): AssignmentTimelineGroup[] {
  const steps = timeline.lanes
    .filter((lane) => lane.role === 'main')
    .flatMap((lane) => lane.entries);
  const subagents = timeline.lanes.filter((lane) => lane.role === 'subagent');
  const known = new Set(timeline.rounds.map((round) => round.index));
  const earlier: AssignmentTimelineGroup = {
    main: steps.filter((step) => step.round === undefined || !known.has(step.round)),
    subagents: subagents.filter((lane) => lane.round === undefined || !known.has(lane.round)),
  };
  const groups = timeline.rounds.map((round) => ({
    round,
    main: steps.filter((step) => step.round === round.index),
    subagents: subagents.filter((lane) => lane.round === round.index),
  }));
  return earlier.main.length === 0 && earlier.subagents.length === 0 && groups.length > 0
    ? groups
    : [earlier, ...groups];
}
