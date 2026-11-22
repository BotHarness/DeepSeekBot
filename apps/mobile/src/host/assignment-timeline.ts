import {
  parseAssignmentTimeline as parseTimeline,
  readAssignmentTimeline,
} from '@botharness/host-client/assignment-timeline';
import type {
  WireAssignmentTimeline,
  WireAssignmentTimelineEntry,
  WireAssignmentTimelineLane,
  WireAssignmentTimelineRound,
} from '@botharness/host-protocol/wire';
import type { HostCall } from '@botharness/host-client/host-answer';
import type { ProfileAssignment } from './bot-profile';

export type AssignmentTimelineStatus = WireAssignmentTimelineEntry['status'];
export type AssignmentToolKind = WireAssignmentTimelineEntry['kind'];
export type AssignmentTimelineEntry = WireAssignmentTimelineEntry;
export type AssignmentTimelineRound = WireAssignmentTimelineRound;
export type AssignmentTimelineLane = Pick<
  WireAssignmentTimelineLane,
  'role' | 'index' | 'sessionId' | 'title' | 'round' | 'entries' | 'omitted'
>;

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

function timelineView(timeline: WireAssignmentTimeline): AssignmentTimeline {
  return { ...timeline, rounds: timeline.rounds ?? [], omittedRounds: timeline.omittedRounds ?? 0 };
}

export function parseAssignmentTimeline(value: unknown): AssignmentTimeline {
  return timelineView(parseTimeline(value));
}

export async function loadAssignmentTimeline(
  client: HostCall,
  slug: string,
  sessionId: string,
): Promise<AssignmentTimeline> {
  return timelineView(await readAssignmentTimeline(client, { slug, sessionId }));
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
