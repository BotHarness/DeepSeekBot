import type { ToolCallKind } from '@deepseek-ai/dsh-tools';

import type { DshSessionEvent } from '../sessions/source.js';
import { isPublicToolDetail, isSessionActivityName } from '../state/tool-activity.js';

export type AssignmentTimelineStatus = 'running' | 'done' | 'failed' | 'denied' | 'cancelled';

export interface AssignmentTimelineEntry {
  status: AssignmentTimelineStatus;
  kind: ToolCallKind;
  tool: string;
  detail?: string;
  at: string;
}

export interface TimelineModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export type AssignmentTimelineLaneState = 'running' | 'done' | 'failed' | 'cancelled' | 'idle';

export interface AssignmentTimelineLane {
  role: 'main' | 'subagent';
  index: number;
  sessionId: string;
  title?: string;
  route?: TimelineModelRoute;
  state: AssignmentTimelineLaneState;
  startedAt?: string;
  updatedAt?: string;
  entries: AssignmentTimelineEntry[];
  omitted: number;
}

export interface AssignmentTimelineSession {
  sessionId: string;
  events: readonly DshSessionEvent[];
}

export interface PublicToolCall {
  kind: ToolCallKind;
  detail?: string;
}

export const TIMELINE_LANE_ENTRIES = 40;
export const TIMELINE_SUBAGENTS = 20;

const TOOL_NAME = /^[A-Za-z0-9_.:/-]{1,80}$/;
const KINDS: readonly ToolCallKind[] = [
  'read',
  'edit',
  'delete',
  'move',
  'search',
  'execute',
  'fetch',
  'other',
];

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function parsedArgs(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const ROUTE_PART = /^[A-Za-z0-9_.:/@+-]{1,120}$/;

function routeOf(value: unknown): TimelineModelRoute | undefined {
  const record = object(value);
  const { provider, model, reasoningEffort } = record;
  if (typeof provider !== 'string' || typeof model !== 'string') return undefined;
  if (!ROUTE_PART.test(provider) || !ROUTE_PART.test(model)) return undefined;
  return {
    provider,
    model,
    ...(typeof reasoningEffort === 'string' && ROUTE_PART.test(reasoningEffort)
      ? { reasoningEffort }
      : {}),
  };
}

function requestRoute(type: string, data: Record<string, unknown>): TimelineModelRoute | undefined {
  if (type === 'request/header') return routeOf(object(data['header'])['config']);
  if (type === 'request/context') return routeOf(data);
  return undefined;
}

function endState(reason: unknown): AssignmentTimelineLaneState {
  const kind = typeof reason === 'string' ? reason : object(reason)['kind'];
  return kind === 'error' ? 'failed' : kind === 'aborted' ? 'cancelled' : 'done';
}

function isoTime(time: unknown): string {
  return new Date(Number.isSafeInteger(time) ? (time as number) : 0).toISOString();
}

function lane(
  role: AssignmentTimelineLane['role'],
  index: number,
  session: AssignmentTimelineSession,
  describe: (sessionId: string, name: string, args: unknown) => PublicToolCall | undefined,
): AssignmentTimelineLane {
  let title: string | undefined;
  let route: TimelineModelRoute | undefined;
  let state: AssignmentTimelineLaneState = 'idle';
  let startedAt: string | undefined;
  let updatedAt: string | undefined;
  const entries: AssignmentTimelineEntry[] = [];
  const open = new Map<string, AssignmentTimelineEntry>();
  const approvals = new Map<string, string>();
  const decided = new Map<string, string>();
  const settleOpen = (status: AssignmentTimelineStatus) => {
    for (const entry of open.values()) entry.status = status;
    open.clear();
  };
  for (const event of session.events) {
    const data = object(event.data);
    if (Number.isSafeInteger(event.time)) {
      updatedAt = isoTime(event.time);
      startedAt ??= updatedAt;
    }
    const requested = requestRoute(event.type, data);
    if (requested !== undefined) {
      route =
        route !== undefined &&
        requested.reasoningEffort === undefined &&
        route.provider === requested.provider &&
        route.model === requested.model
          ? route
          : requested;
      continue;
    }
    if (event.type === 'turn/start') {
      state = 'running';
    } else if (event.type === 'session/title') {
      title = isSessionActivityName(data['title']) ? data['title'] : undefined;
    } else if (event.type === 'tool/call') {
      const callId = typeof data['callId'] === 'string' ? data['callId'] : '';
      const name = typeof data['name'] === 'string' ? data['name'] : '';
      if (callId === '' || !TOOL_NAME.test(name)) continue;
      let call: PublicToolCall | undefined;
      try {
        call = describe(session.sessionId, name, parsedArgs(data['arguments']));
      } catch {
        call = undefined;
      }
      const entry: AssignmentTimelineEntry = {
        status: 'running',
        kind: call !== undefined && KINDS.includes(call.kind) ? call.kind : 'other',
        tool: name,
        ...(isPublicToolDetail(call?.detail) ? { detail: call.detail } : {}),
        at: isoTime(event.time),
      };
      entries.push(entry);
      open.set(callId, entry);
    } else if (event.type === 'approval/asked') {
      if (typeof data['id'] === 'string' && typeof data['callId'] === 'string')
        approvals.set(data['id'], data['callId']);
    } else if (event.type === 'approval/decided') {
      const callId = approvals.get(typeof data['id'] === 'string' ? data['id'] : '');
      if (callId !== undefined && typeof data['outcome'] === 'string')
        decided.set(callId, data['outcome']);
    } else if (event.type === 'tool/result') {
      const message = object(data['message']);
      const callId = typeof message['toolCallId'] === 'string' ? message['toolCallId'] : '';
      const entry = open.get(callId);
      if (entry === undefined) continue;
      open.delete(callId);
      const failed = message['isError'] === true || data['error'] !== undefined;
      const approval = decided.get(callId);
      entry.status = !failed
        ? 'done'
        : approval === 'rejected' || approval === 'unavailable'
          ? 'denied'
          : approval === 'cancelled'
            ? 'cancelled'
            : 'failed';
    } else if (event.type === 'turn/end') {
      settleOpen('cancelled');
      state = endState(data['reason']);
    }
  }
  const kept = entries.slice(-TIMELINE_LANE_ENTRIES);
  return {
    role,
    index,
    sessionId: session.sessionId,
    ...(title === undefined ? {} : { title }),
    ...(route === undefined ? {} : { route }),
    state,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    entries: kept,
    omitted: entries.length - kept.length,
  };
}

export function summarizeSubagentLanes(input: {
  subagents: readonly AssignmentTimelineSession[];
  describe?: (sessionId: string, name: string, args: unknown) => PublicToolCall | undefined;
}): { lanes: AssignmentTimelineLane[]; omittedSubagents: number } {
  const describe = input.describe ?? (() => undefined);
  const subagents = input.subagents.slice(-TIMELINE_SUBAGENTS);
  const skipped = input.subagents.length - subagents.length;
  return {
    lanes: subagents.map((session, index) =>
      lane('subagent', skipped + index + 1, session, describe),
    ),
    omittedSubagents: skipped,
  };
}

export function summarizeAssignmentTimeline(input: {
  main: AssignmentTimelineSession;
  subagents: readonly AssignmentTimelineSession[];
  describe?: (sessionId: string, name: string, args: unknown) => PublicToolCall | undefined;
}): { lanes: AssignmentTimelineLane[]; omittedSubagents: number } {
  const describe = input.describe ?? (() => undefined);
  const children = summarizeSubagentLanes(input);
  return {
    lanes: [lane('main', 0, input.main, describe), ...children.lanes],
    omittedSubagents: children.omittedSubagents,
  };
}
