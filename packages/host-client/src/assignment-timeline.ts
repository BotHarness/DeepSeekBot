import type {
  WireAssignmentTimeline,
  WireAssignmentTimelineEntry,
  WireAssignmentTimelineLane,
  WireAssignmentTimelineRound,
} from '@botharness/host-protocol/wire';
import { isAssignment } from './channel-management';
import {
  answer,
  count,
  HostAnswerInvalid,
  optional,
  record,
  text,
  type HostCall,
} from './host-answer';

const entryStatuses: ReadonlySet<unknown> = new Set<WireAssignmentTimelineEntry['status']>([
  'running',
  'done',
  'failed',
  'denied',
  'cancelled',
]);
const toolKinds: ReadonlySet<unknown> = new Set<WireAssignmentTimelineEntry['kind']>([
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'fetch',
  'other',
]);
const laneStates: ReadonlySet<unknown> = new Set<WireAssignmentTimelineLane['state']>([
  'running',
  'done',
  'failed',
  'cancelled',
  'idle',
]);

function isEntry(value: unknown): value is WireAssignmentTimelineEntry {
  const row = record(value);
  return (
    row !== undefined &&
    entryStatuses.has(row['status']) &&
    toolKinds.has(row['kind']) &&
    text(row['tool']) &&
    text(row['at']) &&
    optional(row['detail'], text) &&
    optional(row['round'], count)
  );
}

function isModelRoute(value: unknown): boolean {
  const row = record(value);
  return text(row?.['provider']) && text(row['model']) && optional(row['reasoningEffort'], text);
}

function isLane(value: unknown): value is WireAssignmentTimelineLane {
  const row = record(value);
  return (
    (row?.['role'] === 'main' || row?.['role'] === 'subagent') &&
    count(row['index']) &&
    text(row['sessionId']) &&
    laneStates.has(row['state']) &&
    optional(row['title'], text) &&
    optional(row['route'], isModelRoute) &&
    optional(row['startedAt'], text) &&
    optional(row['updatedAt'], text) &&
    optional(row['round'], count) &&
    Array.isArray(row['entries']) &&
    row['entries'].every(isEntry) &&
    count(row['omitted'])
  );
}

function isRound(value: unknown): value is WireAssignmentTimelineRound {
  const row = record(value);
  return (
    (row?.['kind'] === 'created' || row?.['kind'] === 'continued') &&
    count(row['index']) &&
    text(row['at']) &&
    optional(row['instruction'], text)
  );
}

function isAssignmentDetail(value: unknown): value is WireAssignmentTimeline['assignment'] {
  const row = record(value);
  return (
    row !== undefined &&
    isAssignment(value) &&
    text(row['sourceEventId']) &&
    optional(row['continuityKey'], text) &&
    optional(row['agentPreset'], text) &&
    optional(
      row['executionWait'],
      (state) => state === 'waiting-human' || state === 'waiting-capacity',
    ) &&
    optional(row['openAsk'], (value) => {
      const ask = record(value);
      return text(ask?.['sourceEventId']) && text(ask['summary']) && text(ask['at']);
    }) &&
    optional(row['permission'], (value) => {
      const permission = record(value);
      return (
        text(permission?.['grantId']) &&
        text(permission['workspaceId']) &&
        text(permission['primaryCwd']) &&
        (permission['mode'] === 'workspace-write' || permission['mode'] === 'danger-full-access') &&
        (permission['approval'] === 'ask' || permission['approval'] === 'never') &&
        count(permission['presetRevision'])
      );
    })
  );
}

function isTimeline(value: unknown): value is WireAssignmentTimeline {
  const row = record(value);
  return (
    isAssignmentDetail(row?.['assignment']) &&
    Array.isArray(row['lanes']) &&
    row['lanes'].every(isLane) &&
    optional(row['rounds'], (rows) => Array.isArray(rows) && rows.every(isRound)) &&
    count(row['omittedSubagents']) &&
    optional(row['omittedRounds'], count)
  );
}

export function parseAssignmentTimeline(value: unknown): WireAssignmentTimeline {
  return answer(value, isTimeline, 'assignmentTimeline');
}

export async function readAssignmentTimeline(
  host: HostCall,
  args: { slug: string; sessionId: string },
): Promise<WireAssignmentTimeline> {
  const result = parseAssignmentTimeline(await host.call('assignmentTimeline', args));
  if (result.assignment.botSlug !== args.slug || result.assignment.sessionId !== args.sessionId)
    throw new HostAnswerInvalid('assignmentTimeline returned a different Assignment.');
  return result;
}
