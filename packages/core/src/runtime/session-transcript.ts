import type { ToolCallKind } from '@deepseek-ai/dsh-tools';

import type { DshSessionEvent } from '../sessions/source.js';
import { isPublicToolDetail } from '../state/tool-activity.js';
import type { AssignmentTimelineStatus, PublicToolCall } from './assignment-timeline.js';

export type SessionTranscriptItem =
  | { kind: 'input'; text: string; at: string; turn: number; source: 'user' | 'system' }
  | { kind: 'reply'; text: string; at: string }
  | { kind: 'reasoning'; text: string; at: string }
  | {
      kind: 'tool';
      id: string;
      tool: string;
      toolKind: ToolCallKind;
      status: AssignmentTimelineStatus;
      detail?: string;
      at: string;
    }
  | { kind: 'turn-end'; state: 'done' | 'failed' | 'cancelled'; at: string; message?: string };

export interface SessionTranscript {
  items: SessionTranscriptItem[];
  omitted: number;
  running: boolean;
}

export const TRANSCRIPT_ITEMS = 200;
export const TRANSCRIPT_TEXT_CHARS = 8000;

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

function isoTime(time: unknown): string {
  return new Date(Number.isSafeInteger(time) ? (time as number) : 0).toISOString();
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= TRANSCRIPT_TEXT_CHARS
    ? trimmed
    : `${trimmed.slice(0, TRANSCRIPT_TEXT_CHARS - 1)}…`;
}

function blocks(data: Record<string, unknown>): Record<string, unknown>[] {
  const content = object(data['message'])['content'] ?? data['content'];
  return Array.isArray(content) ? content.map(object) : [];
}

function joined(parts: Record<string, unknown>[], type: string): string {
  return clip(
    parts
      .filter((part) => part['type'] === type && typeof part['text'] === 'string')
      .map((part) => part['text'] as string)
      .join('\n\n'),
  );
}

const HOST_BLOCK = /\n+\[Host [^\]\n]{1,80}\][\s\S]*$/u;

function parsedArgs(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export function summarizeSessionTranscript(input: {
  sessionId: string;
  events: readonly DshSessionEvent[];
  describe?: (sessionId: string, name: string, args: unknown) => PublicToolCall | undefined;
}): SessionTranscript {
  const describe = input.describe ?? (() => undefined);
  const items: SessionTranscriptItem[] = [];
  const open = new Map<string, Extract<SessionTranscriptItem, { kind: 'tool' }>>();
  const approvals = new Map<string, string>();
  const decided = new Map<string, string>();
  let turn = 0;
  let running = false;
  for (const event of input.events) {
    const data = object(event.data);
    const at = isoTime(event.time);
    if (event.type === 'turn/start') {
      turn += 1;
      running = true;
    } else if (event.type === 'user/message') {
      const kind = object(data['source'])['kind'];
      const text = joined(blocks(data), 'text').replace(HOST_BLOCK, '').trim();
      if (text !== '')
        items.push({
          kind: 'input',
          text,
          at,
          turn: Math.max(turn, 1),
          source: kind === undefined || kind === 'user' ? 'user' : 'system',
        });
    } else if (event.type === 'assistant/message') {
      const parts = blocks(data);
      const reasoning = joined(parts, 'reasoning');
      const text = joined(parts, 'text');
      if (reasoning !== '') items.push({ kind: 'reasoning', text: reasoning, at });
      if (text !== '') items.push({ kind: 'reply', text, at });
    } else if (event.type === 'tool/call') {
      const id = typeof data['callId'] === 'string' ? data['callId'] : '';
      const name = typeof data['name'] === 'string' ? data['name'] : '';
      if (id === '' || !TOOL_NAME.test(name)) continue;
      let call: PublicToolCall | undefined;
      try {
        call = describe(input.sessionId, name, parsedArgs(data['arguments']));
      } catch {
        call = undefined;
      }
      const item: Extract<SessionTranscriptItem, { kind: 'tool' }> = {
        kind: 'tool',
        id,
        tool: name,
        toolKind: call !== undefined && KINDS.includes(call.kind) ? call.kind : 'other',
        status: 'running',
        ...(isPublicToolDetail(call?.detail) ? { detail: call.detail } : {}),
        at,
      };
      items.push(item);
      open.set(id, item);
    } else if (event.type === 'approval/asked') {
      if (typeof data['id'] === 'string' && typeof data['callId'] === 'string')
        approvals.set(data['id'], data['callId']);
    } else if (event.type === 'approval/decided') {
      const callId = approvals.get(typeof data['id'] === 'string' ? data['id'] : '');
      if (callId !== undefined && typeof data['outcome'] === 'string')
        decided.set(callId, data['outcome']);
    } else if (event.type === 'tool/result') {
      const message = object(data['message']);
      const id = typeof message['toolCallId'] === 'string' ? message['toolCallId'] : '';
      const item = open.get(id);
      if (item === undefined) continue;
      open.delete(id);
      const failed = message['isError'] === true || data['error'] !== undefined;
      const approval = decided.get(id);
      item.status = !failed
        ? 'done'
        : approval === 'rejected' || approval === 'unavailable'
          ? 'denied'
          : approval === 'cancelled'
            ? 'cancelled'
            : 'failed';
    } else if (event.type === 'turn/end') {
      for (const item of open.values()) item.status = 'cancelled';
      open.clear();
      running = false;
      const reason = data['reason'];
      const kind = typeof reason === 'string' ? reason : object(reason)['kind'];
      const failure = object(object(reason)['error'])['message'];
      items.push({
        kind: 'turn-end',
        state: kind === 'error' ? 'failed' : kind === 'aborted' ? 'cancelled' : 'done',
        at,
        ...(kind === 'error' && typeof failure === 'string' && failure.trim() !== ''
          ? { message: failure.trim().slice(0, 280) }
          : {}),
      });
    }
  }
  const kept = items.slice(-TRANSCRIPT_ITEMS);
  return { items: kept, omitted: items.length - kept.length, running };
}
