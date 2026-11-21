import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import * as people from '@botharness/host-client/people';
import * as accessReaders from '@botharness/host-client/access-readers';
import { readAssignmentTimeline } from '@botharness/host-client/assignment-timeline';
import type { WireAssignmentAccessPreset } from '@botharness/host-protocol/wire';
import * as channels from '@botharness/host-client/channel-management';
import type { ChannelAssignmentSummary } from '@botharness/host-protocol/wire';
import type { HumanAssignmentContext } from '../../bridge.js';
import { parseSessionModelRoute, type SessionModelRoute } from '../../session-model-route.js';

export async function loadChannelAssignments(
  call: BridgeCall,
  channelId: string,
): Promise<ChannelAssignmentSummary[]> {
  return channels.readChannelAssignments(bridgeHost(call), channelId);
}

const SUBAGENT_LANE_STATES = ['running', 'done', 'failed', 'cancelled', 'idle'];

export interface SessionSubagent {
  sessionId: string;
  index: number;
  title?: string;
  route?: SessionModelRoute;
  state: 'running' | 'done' | 'failed' | 'cancelled' | 'idle';
  updatedAt?: string;
  toolCount: number;
}

export async function loadSessionSubagents(
  call: BridgeCall,
  slug: string,
  sessionId: string,
): Promise<{ subagents: SessionSubagent[]; omitted: number }> {
  const value = asRecord(await unwrap(call, 'sessionSubagents', { slug, sessionId }));
  const lanes = value?.['lanes'];
  const omitted = value?.['omittedSubagents'];
  if (!Array.isArray(lanes) || typeof omitted !== 'number')
    throw new Error('invalid sessionSubagents response');
  const subagents = lanes.flatMap((entry): SessionSubagent[] => {
    const lane = asRecord(entry);
    const id = lane?.['sessionId'];
    const index = lane?.['index'];
    const state = lane?.['state'];
    if (
      typeof id !== 'string' ||
      typeof index !== 'number' ||
      !SUBAGENT_LANE_STATES.includes(state as string)
    )
      return [];
    const title = lane?.['title'];
    const updatedAt = lane?.['updatedAt'];
    const route = parseSessionModelRoute(lane?.['route']);
    const entries = lane?.['entries'];
    const extra = lane?.['omitted'];
    return [
      {
        sessionId: id,
        index,
        ...(typeof title === 'string' && title !== '' ? { title } : {}),
        ...(route === undefined ? {} : { route }),
        state: state as SessionSubagent['state'],
        ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
        toolCount:
          (Array.isArray(entries) ? entries.length : 0) + (typeof extra === 'number' ? extra : 0),
      },
    ];
  });
  return { subagents, omitted };
}

export interface SessionGoal {
  objective: string;
  phase: 'active' | 'paused' | 'blocked' | 'complete';
  roundsStarted: number;
  maxGoalRounds: number;
  blockedReason?: string;
}

export interface SessionTodo {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SessionProgress {
  goal?: SessionGoal;
  todos?: SessionTodo[];
  lastEventAt?: number;
}

const GOAL_PHASES = ['active', 'paused', 'blocked', 'complete'];

const TODO_STATUSES = ['pending', 'in_progress', 'completed'];

function parseSessionGoal(value: unknown): SessionGoal | undefined {
  const goal = asRecord(value);
  const objective = goal?.['objective'];
  const phase = goal?.['phase'];
  const rounds = goal?.['roundsStarted'];
  const max = goal?.['maxGoalRounds'];
  const reason = goal?.['blockedReason'];
  if (
    typeof objective !== 'string' ||
    !GOAL_PHASES.includes(phase as string) ||
    typeof rounds !== 'number' ||
    typeof max !== 'number'
  )
    return undefined;
  return {
    objective,
    phase: phase as SessionGoal['phase'],
    roundsStarted: rounds,
    maxGoalRounds: max,
    ...(typeof reason === 'string' ? { blockedReason: reason } : {}),
  };
}

function parseSessionTodos(value: unknown): SessionTodo[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const todos = value.flatMap((entry): SessionTodo[] => {
    const todo = asRecord(entry);
    const content = todo?.['content'];
    const status = todo?.['status'];
    return typeof content === 'string' && TODO_STATUSES.includes(status as string)
      ? [{ content, status: status as SessionTodo['status'] }]
      : [];
  });
  return todos.length === 0 ? undefined : todos;
}

export async function loadSessionProgress(
  call: BridgeCall,
  slug: string,
  sessionIds: readonly string[],
): Promise<Record<string, SessionProgress>> {
  const value = asRecord(await unwrap(call, 'sessionProgress', { slug, sessionIds }));
  const sessions = value?.['sessions'];
  if (!Array.isArray(sessions)) throw new Error('invalid sessionProgress response');
  const progress: Record<string, SessionProgress> = {};
  for (const entry of sessions) {
    const session = asRecord(entry);
    const id = session?.['sessionId'];
    if (session === undefined || typeof id !== 'string' || session['error'] !== undefined) continue;
    const goal = parseSessionGoal(session['goal']);
    const todos = parseSessionTodos(session['todos']);
    const at = session['lastEventAt'];
    progress[id] = {
      ...(goal === undefined ? {} : { goal }),
      ...(todos === undefined ? {} : { todos }),
      ...(typeof at === 'number' ? { lastEventAt: at } : {}),
    };
  }
  return progress;
}

export interface AssignmentWorkStep {
  status: 'running' | 'done' | 'failed' | 'denied' | 'cancelled';
  kind: string;
  tool: string;
  detail?: string;
  at: string;
  round?: number;
}

export interface AssignmentWorkLane {
  role: 'main' | 'subagent';
  index: number;
  sessionId: string;
  title?: string;
  route?: SessionModelRoute;
  state: SessionSubagent['state'];
  round?: number;
  entries: AssignmentWorkStep[];
  omitted: number;
}

export interface AssignmentWorkRound {
  index: number;
  kind: 'created' | 'continued';
  at: string;
  instruction?: string;
}

export interface AssignmentWork {
  title: string;
  description: string;
  activity: ChannelAssignmentSummary['activity'];
  latestReport?: {
    state: NonNullable<ChannelAssignmentSummary['latestReport']>['state'];
    summary: string;
    at?: string;
  };
  rounds: AssignmentWorkRound[];
  lanes: AssignmentWorkLane[];
  omittedSubagents: number;
  omittedRounds: number;
}

export async function loadAssignmentWork(
  call: BridgeCall,
  slug: string,
  sessionId: string,
): Promise<AssignmentWork> {
  const { assignment, rounds, lanes, omittedSubagents, omittedRounds } =
    await readAssignmentTimeline(bridgeHost(call), { slug, sessionId });
  const { title, description, activity, latestReport } = assignment;
  return {
    title,
    description,
    activity,
    ...(latestReport === undefined ? {} : { latestReport }),
    rounds: rounds ?? [],
    lanes,
    omittedSubagents,
    omittedRounds: omittedRounds ?? 0,
  };
}

export async function loadHumanAssignmentContext(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  sourceEventId: string,
  signal?: AbortSignal,
): Promise<HumanAssignmentContext> {
  const { context } = await people.readHumanAssignmentContext(bridgeHost(call, signal), {
    slug,
    sessionId,
    sourceEventId,
  });
  return context;
}

export type AssignmentAccessPresetView = WireAssignmentAccessPreset;

export async function loadAssignmentAccess(
  call: BridgeCall,
  slug: string,
): Promise<AssignmentAccessPresetView> {
  return (await accessReaders.readAssignmentAccess(bridgeHost(call), slug)).preset;
}

export async function setAssignmentAccess(
  call: BridgeCall,
  slug: string,
  mode: AssignmentAccessPresetView['mode'],
  acknowledgeRisk: boolean,
  scope?: 'chat' | 'assignments',
): Promise<AssignmentAccessPresetView> {
  return (
    await accessReaders.writeAssignmentAccess(bridgeHost(call), {
      slug,
      mode,
      acknowledgeRisk,
      ...(scope === undefined ? {} : { scope }),
    })
  ).preset;
}
