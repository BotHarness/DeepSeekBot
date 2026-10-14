import type { DshSessionEvent } from '../sessions/source.js';
import type { DirectBotToolCall } from '../runtime/bot-runtime.js';

export type ToolCallOutcome = 'ok' | 'error' | 'denied' | 'cancelled' | 'pending';

export interface ToolCallTrace {
  readonly name: string;
  readonly callId: string;
  readonly args: unknown;
  readonly outcome: ToolCallOutcome;
  readonly approval?: string;
  readonly result: string;
}

export interface TurnTrace {
  readonly turn: number;
  readonly startedAt?: string;
  readonly endReason?: string;
  readonly calls: ToolCallTrace[];
  readonly noToolCalls: boolean;
}

const SECRET_TOOLS = new Set(['secret_cli', 'secret_mcp_connect', 'ask_secret']);
const VALUE_LIMIT = 200;
const RESULT_LIMIT = 300;

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function clip(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function boundedArgs(raw: unknown): unknown {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return clip(raw, VALUE_LIMIT);
    }
  }
  const visit = (value: unknown, depth: number): unknown => {
    if (typeof value === 'string') return clip(value, VALUE_LIMIT);
    if (typeof value !== 'object' || value === null) return value;
    if (depth >= 3) return '…';
    if (Array.isArray(value)) return value.slice(0, 10).map((item) => visit(item, depth + 1));
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, item]) => [key, visit(item, depth + 1)]),
    );
  };
  return visit(parsed, 0);
}

function resultText(data: Record<string, unknown>): string {
  const message = object(data['message']);
  const content = Array.isArray(message['content']) ? message['content'] : [];
  const texts = content
    .map(object)
    .map((part) =>
      part['type'] === 'text' && typeof part['text'] === 'string'
        ? part['text']
        : part['type'] === 'image'
          ? '[image]'
          : '',
    )
    .filter((part) => part !== '');
  const error = object(data['error']);
  const reason = typeof error['reason'] === 'string' ? error['reason'] : undefined;
  return clip(texts.join('\n') || reason || '', RESULT_LIMIT);
}

export function summarizeToolTrace(
  events: readonly DshSessionEvent[],
  options: { turns: number },
): { turns: TurnTrace[] } {
  const turns = new Map<
    number,
    { turn: number; startedAt?: string; endReason?: string; calls: Map<string, ToolCallTrace> }
  >();
  const callTurn = new Map<string, number>();
  const approvals = new Map<string, string>();
  const turnOf = (turn: number) => {
    let entry = turns.get(turn);
    if (entry === undefined) {
      entry = { turn, calls: new Map() };
      turns.set(turn, entry);
    }
    return entry;
  };
  const update = (callId: string, change: Partial<ToolCallTrace>) => {
    const turn = callTurn.get(callId);
    if (turn === undefined) return;
    const entry = turnOf(turn);
    const current = entry.calls.get(callId);
    if (current !== undefined) entry.calls.set(callId, { ...current, ...change });
  };
  for (const event of events) {
    const data = object(event.data);
    const turn = typeof data['turn'] === 'number' ? data['turn'] : undefined;
    if (event.type === 'turn/start' && turn !== undefined) {
      turnOf(turn).startedAt = new Date(event.time).toISOString();
    } else if (event.type === 'turn/end' && turn !== undefined) {
      const reason = data['reason'];
      const kind = object(reason)['kind'];
      turnOf(turn).endReason =
        typeof reason === 'string' ? reason : typeof kind === 'string' ? kind : 'ended';
    } else if (event.type === 'tool/call' && turn !== undefined) {
      const callId = typeof data['callId'] === 'string' ? data['callId'] : '';
      const name = typeof data['name'] === 'string' ? data['name'] : 'unknown';
      if (callId === '') continue;
      callTurn.set(callId, turn);
      turnOf(turn).calls.set(callId, {
        name,
        callId,
        args: SECRET_TOOLS.has(name) ? '[redacted]' : boundedArgs(data['arguments']),
        outcome: 'pending',
        result: '',
      });
    } else if (event.type === 'approval/asked') {
      const callId = typeof data['callId'] === 'string' ? data['callId'] : undefined;
      const id = typeof data['id'] === 'string' ? data['id'] : undefined;
      if (callId !== undefined && id !== undefined) approvals.set(id, callId);
    } else if (event.type === 'approval/decided') {
      const callId = approvals.get(typeof data['id'] === 'string' ? data['id'] : '');
      const outcome = typeof data['outcome'] === 'string' ? data['outcome'] : undefined;
      if (callId !== undefined && outcome !== undefined) update(callId, { approval: outcome });
    } else if (event.type === 'tool/result') {
      const message = object(data['message']);
      const callId = typeof message['toolCallId'] === 'string' ? message['toolCallId'] : '';
      const turnNumber = callTurn.get(callId);
      if (turnNumber === undefined) continue;
      const call = turnOf(turnNumber).calls.get(callId)!;
      const failed = message['isError'] === true || data['error'] !== undefined;
      const outcome: ToolCallOutcome = !failed
        ? 'ok'
        : call.approval === 'rejected' || call.approval === 'unavailable'
          ? 'denied'
          : call.approval === 'cancelled'
            ? 'cancelled'
            : 'error';
      update(callId, {
        outcome,
        result: SECRET_TOOLS.has(call.name) ? '[redacted]' : resultText(data),
      });
    }
  }
  const newest = [...turns.values()].sort((a, b) => a.turn - b.turn).slice(-options.turns);
  return {
    turns: newest.map((entry) => {
      const calls = [...entry.calls.values()];
      return {
        turn: entry.turn,
        ...(entry.startedAt === undefined ? {} : { startedAt: entry.startedAt }),
        ...(entry.endReason === undefined ? {} : { endReason: entry.endReason }),
        calls,
        noToolCalls: calls.length === 0,
      };
    }),
  };
}

export function directToolTrace(
  calls: readonly DirectBotToolCall[],
  options: { turns: number },
): TurnTrace[] {
  return calls.slice(-options.turns).map((call, index, newest) => ({
    turn: calls.length - newest.length + index + 1,
    startedAt: call.at,
    endReason: 'direct',
    noToolCalls: false,
    calls: [
      {
        name: call.tool,
        callId: call.callId,
        args: SECRET_TOOLS.has(call.tool) ? '[redacted]' : boundedArgs(call.args),
        outcome: call.outcome,
        result: SECRET_TOOLS.has(call.tool) ? '[redacted]' : clip(call.result, RESULT_LIMIT),
      },
    ],
  }));
}
