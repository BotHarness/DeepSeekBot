import type { ToolCallKind } from '@deepseek-ai/dsh-tools';

import { PRIVATE_INPUT_TOOLS } from '../credentials/tool-contract.js';
import type { DshSessionEvent } from '../sessions/source.js';
import { type InboundEnvelope, parseInboundEnvelope } from './inbound-envelope.js';
import { isPublicToolDetail } from '../state/tool-activity.js';
import { sessionDirectBody } from './session-direct-message.js';
import type { AssignmentTimelineStatus, PublicToolCall } from './assignment-timeline.js';

export type SessionTranscriptTrigger =
  | 'request'
  | 'goal'
  | 'agent'
  | 'team'
  | 'subagent'
  | 'github'
  | 'webhook'
  | 'schedule'
  | 'job'
  | 'plugin';

export interface SessionTurnUsage {
  tokens: number;
  output: number;
  outputMs: number;
}

export interface SessionTranscriptEnvelope {
  kind: InboundEnvelope['kind'];
  channelId?: string;
  messageId?: string;
}

export type SessionTranscriptItem =
  | {
      kind: 'input';
      text: string;
      at: string;
      turn: number;
      source: 'user' | 'system';
      trigger?: SessionTranscriptTrigger;
      origin?: 'session-detail';
      envelope?: SessionTranscriptEnvelope;
    }
  | { kind: 'reply'; text: string; at: string }
  | { kind: 'reasoning'; text: string; at: string; durationMs?: number }
  | {
      kind: 'tool';
      id: string;
      tool: string;
      toolKind: ToolCallKind;
      status: AssignmentTimelineStatus;
      detail?: string;
      command?: string;
      path?: string;
      url?: string;
      added?: number;
      removed?: number;
      at: string;
      endedAt?: string;
    }
  | {
      kind: 'turn-end';
      state: 'done' | 'failed' | 'cancelled';
      at: string;
      message?: string;
      usage?: SessionTurnUsage;
    };

export interface SessionTranscript {
  items: SessionTranscriptItem[];
  omitted: number;
  running: boolean;
  seq: number;
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

function rawJoined(parts: Record<string, unknown>[], type: string): string {
  return parts
    .filter((part) => part['type'] === type && typeof part['text'] === 'string')
    .map((part) => part['text'] as string)
    .join('\n\n');
}

function joined(parts: Record<string, unknown>[], type: string): string {
  return clip(rawJoined(parts, type));
}

const HOST_BLOCK = /\n+\[Host [^\]\n]{1,80}\][\s\S]*$/u;
const CONTEXT_SOURCES = new Set(['runtime-context', 'skill-catalog']);
const TARGET_CHARS = 400;
const SOURCE_TRIGGERS: Record<string, SessionTranscriptTrigger> = {
  goal: 'goal',
  'agent-message': 'agent',
  'team-message': 'team',
  'subagent-settled': 'subagent',
  schedule: 'schedule',
  'tool-jobs': 'job',
  'cordis-host-runner': 'plugin',
};

export function transcriptTrigger(source: Record<string, unknown>): SessionTranscriptTrigger {
  const kind = typeof source['kind'] === 'string' ? source['kind'] : '';
  if (kind === 'webhook') return source['provider'] === 'github' ? 'github' : 'webhook';
  return SOURCE_TRIGGERS[kind] ?? 'request';
}

function text(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.length <= TARGET_CHARS ? trimmed : `${trimmed.slice(0, TARGET_CHARS - 1)}…`;
}

export function toolTargets(
  name: string,
  args: unknown,
): Partial<Record<'command' | 'path' | 'url', string>> {
  if (PRIVATE_INPUT_TOOLS.has(name)) return {};
  const source = object(args);
  const command = text(source['command']) ?? text(source['cmd']);
  const path = text(source['file_path']) ?? text(source['path']) ?? text(source['filePath']);
  const url = text(source['url']);
  return {
    ...(command === undefined ? {} : { command }),
    ...(path === undefined ? {} : { path }),
    ...(url === undefined || !/^https?:\/\//iu.test(url) ? {} : { url }),
  };
}

function lineCounts(oldText: string | null, newText: string): { added: number; removed: number } {
  const before = oldText === null || oldText === '' ? [] : oldText.split('\n');
  const after = newText === '' ? [] : newText.split('\n');
  const pool = new Map<string, number>();
  for (const line of before) pool.set(line, (pool.get(line) ?? 0) + 1);
  let kept = 0;
  for (const line of after) {
    const left = pool.get(line) ?? 0;
    if (left > 0) {
      pool.set(line, left - 1);
      kept += 1;
    }
  }
  return { added: after.length - kept, removed: before.length - kept };
}

export function diffTotals(meta: unknown): { added: number; removed: number } | undefined {
  const diffs = object(meta)['diffs'];
  if (!Array.isArray(diffs)) return undefined;
  let added = 0;
  let removed = 0;
  for (const diff of diffs.map(object)) {
    const oldText = typeof diff['oldText'] === 'string' ? diff['oldText'] : null;
    if (typeof diff['newText'] !== 'string') continue;
    const counts = lineCounts(oldText, diff['newText']);
    added += counts.added;
    removed += counts.removed;
  }
  return { added, removed };
}

function streamSpan(
  stream: unknown,
): { start: number; end: number; reasoning: number } | undefined {
  if (!Array.isArray(stream)) return undefined;
  let start = Infinity;
  let end = -Infinity;
  let reasoningStart: number | undefined;
  let reasoning = 0;
  for (const record of stream.map(object)) {
    const from =
      typeof record['time0'] === 'number'
        ? record['time0']
        : typeof record['time'] === 'number'
          ? record['time']
          : undefined;
    if (from === undefined) continue;
    const dt = Array.isArray(record['dt'])
      ? record['dt'].reduce<number>((sum, step) => sum + (typeof step === 'number' ? step : 0), 0)
      : 0;
    start = Math.min(start, from);
    end = Math.max(end, from + dt);
    const chunk = object(record['chunk']);
    if (chunk['type'] === 'block-start' && chunk['blockType'] === 'reasoning')
      reasoningStart = from;
    if (chunk['type'] === 'block-end' && object(chunk['block'])['type'] === 'reasoning') {
      if (reasoningStart !== undefined) reasoning += Math.max(0, from - reasoningStart);
      reasoningStart = undefined;
    }
  }
  return Number.isFinite(start) ? { start, end, reasoning } : undefined;
}

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
  let seq = 0;
  let usage: SessionTurnUsage | undefined;
  for (const event of input.events) {
    const data = object(event.data);
    const at = isoTime(event.time);
    if (typeof event.seq === 'number') seq = Math.max(seq, event.seq);
    if (event.type === 'turn/start') {
      turn += 1;
      running = true;
      usage = undefined;
    } else if (event.type === 'user/message') {
      const source = object(data['source']);
      const kind = source['kind'];
      if (typeof kind === 'string' && CONTEXT_SOURCES.has(kind)) continue;
      const raw = rawJoined(blocks(data), 'text');
      const direct = sessionDirectBody(raw);
      const text = direct === undefined ? clip(raw).replace(HOST_BLOCK, '').trim() : clip(direct);
      const human = direct !== undefined || kind === undefined || kind === 'user';
      const parsed = direct === undefined && human ? parseInboundEnvelope(text) : undefined;
      const envelope =
        parsed === undefined || parsed.body.trim() === ''
          ? undefined
          : {
              kind: parsed.kind,
              ...(parsed.channelId === undefined ? {} : { channelId: parsed.channelId }),
              ...(parsed.messageId === undefined ? {} : { messageId: parsed.messageId }),
            };
      if (text !== '')
        items.push({
          kind: 'input',
          text: envelope === undefined ? text : parsed!.body.trim(),
          at,
          turn: Math.max(turn, 1),
          source: human ? 'user' : 'system',
          ...(human ? {} : { trigger: transcriptTrigger(source) }),
          ...(direct === undefined ? {} : { origin: 'session-detail' as const }),
          ...(envelope === undefined ? {} : { envelope }),
        });
    } else if (event.type === 'assistant/message') {
      const parts = blocks(data);
      const reasoning = joined(parts, 'reasoning');
      const text = joined(parts, 'text');
      const span = streamSpan(data['stream']);
      const tokens = object(data['usage']);
      const count = (key: string): number => {
        const value = tokens[key];
        return typeof value === 'number' && Number.isFinite(value) ? value : 0;
      };
      if (typeof tokens['outputTokens'] === 'number') {
        usage ??= { tokens: 0, output: 0, outputMs: 0 };
        usage.tokens +=
          count('inputTokens') +
          count('outputTokens') +
          count('cacheReadTokens') +
          count('cacheWriteTokens');
        usage.output += count('outputTokens');
        usage.outputMs += span === undefined ? 0 : Math.max(0, span.end - span.start);
      }
      if (reasoning !== '')
        items.push({
          kind: 'reasoning',
          text: reasoning,
          at,
          ...(span !== undefined && span.reasoning > 0 ? { durationMs: span.reasoning } : {}),
        });
      if (text !== '') items.push({ kind: 'reply', text, at });
    } else if (event.type === 'tool/call') {
      const id = typeof data['callId'] === 'string' ? data['callId'] : '';
      const name = typeof data['name'] === 'string' ? data['name'] : '';
      if (id === '' || !TOOL_NAME.test(name)) continue;
      const args = parsedArgs(data['arguments']);
      let call: PublicToolCall | undefined;
      try {
        call = describe(input.sessionId, name, args);
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
        ...toolTargets(name, args),
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
      const totals = failed ? undefined : diffTotals(data['meta']);
      if (totals !== undefined) Object.assign(item, totals);
      item.endedAt = at;
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
        ...(usage === undefined ? {} : { usage }),
      });
      usage = undefined;
    }
  }
  const kept = items.slice(-TRANSCRIPT_ITEMS);
  return { items: kept, omitted: items.length - kept.length, running, seq };
}
