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

export interface AssignmentTimelineLane {
  role: 'main' | 'subagent';
  index: number;
  sessionId: string;
  title?: string;
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

function lane(
  role: AssignmentTimelineLane['role'],
  index: number,
  session: AssignmentTimelineSession,
  describe: (sessionId: string, name: string, args: unknown) => PublicToolCall | undefined,
): AssignmentTimelineLane {
  let title: string | undefined;
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
    if (event.type === 'session/title') {
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
        at: new Date(Number.isSafeInteger(event.time) ? event.time : 0).toISOString(),
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
    }
  }
  const kept = entries.slice(-TIMELINE_LANE_ENTRIES);
  return {
    role,
    index,
    sessionId: session.sessionId,
    ...(title === undefined ? {} : { title }),
    entries: kept,
    omitted: entries.length - kept.length,
  };
}

export function summarizeAssignmentTimeline(input: {
  main: AssignmentTimelineSession;
  subagents: readonly AssignmentTimelineSession[];
  describe?: (sessionId: string, name: string, args: unknown) => PublicToolCall | undefined;
}): { lanes: AssignmentTimelineLane[]; omittedSubagents: number } {
  const describe = input.describe ?? (() => undefined);
  const subagents = input.subagents.slice(-TIMELINE_SUBAGENTS);
  const skipped = input.subagents.length - subagents.length;
  return {
    lanes: [
      lane('main', 0, input.main, describe),
      ...subagents.map((session, index) =>
        lane('subagent', skipped + index + 1, session, describe),
      ),
    ],
    omittedSubagents: skipped,
  };
}
