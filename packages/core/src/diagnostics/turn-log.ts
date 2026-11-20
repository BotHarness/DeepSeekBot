import { assistantStreamFirstTokenTime, type AssistantStreamRecord } from '@deepseek-ai/dsh-llm';

import type { DshSessionEvent } from '../sessions/source.js';
import type { DiagnosticEventFields, DiagnosticEvents } from './diagnostic-log.js';

export const TURN_LOG_SOURCE = 'bot-turn';
const MAX_OPEN_TURNS = 200;
const MAX_OPEN_CALLS = 64;
const MAX_ROUTES = 1000;

interface OpenTurn {
  turn: number;
  startedAt: number;
  steps: number;
  tools: number;
  toolErrors: number;
  lastToolError: string | undefined;
  slowestTool: string | undefined;
  slowestToolMs: number;
  firstTokenMs: number | undefined;
  stepStartedAt: number | undefined;
  modelMs: number;
  inputTokens: number;
  outputTokens: number;
  approvals: number;
  calls: Map<string, { name: string; at: number }>;
}

export interface TurnLogOwner {
  botSlug: string;
  rootRole: string;
}

export interface TurnLog {
  observe(sessionId: string, event: DshSessionEvent): void;
  forget(sessionId: string): void;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function label(value: unknown, max = 64): string | undefined {
  return typeof value === 'string' && value !== '' ? value.slice(0, max) : undefined;
}

function firstTokenAt(stream: unknown): number | undefined {
  if (!Array.isArray(stream) || stream.length === 0) return;
  try {
    return assistantStreamFirstTokenTime(stream as readonly AssistantStreamRecord[]);
  } catch {
    return;
  }
}

export function createTurnLog(options: {
  events: DiagnosticEvents;
  owner(sessionId: string): TurnLogOwner | undefined;
}): TurnLog {
  const open = new Map<string, OpenTurn>();
  const routes = new Map<string, { provider?: string; model?: string }>();

  const close = (sessionId: string, state: OpenTurn, event: DshSessionEvent): void => {
    open.delete(sessionId);
    const data = record(event.data);
    const reason = record(data?.['reason']);
    const kind = label(reason?.['kind'], 32) ?? 'unknown';
    const error = record(reason?.['error']);
    const aborted = record(reason?.['reason']);
    const owner = options.owner(sessionId);
    const route = routes.get(sessionId);
    const fields: DiagnosticEventFields = {
      session: sessionId,
      turn: state.turn,
      role: owner?.rootRole ?? 'unowned',
      durationMs: Math.max(0, Math.round(event.time - state.startedAt)),
      steps: state.steps,
      tools: state.tools,
      toolErrors: state.toolErrors,
      approvals: state.approvals,
      provider: route?.provider,
      model: route?.model,
      modelMs: state.modelMs,
      firstTokenMs: state.firstTokenMs,
      inputTokens: state.inputTokens || undefined,
      outputTokens: state.outputTokens || undefined,
      slowestTool: state.slowestTool,
      slowestToolMs: state.slowestTool === undefined ? undefined : state.slowestToolMs,
      lastToolError: state.lastToolError,
      errorCode: label(error?.['code']),
      status: count(error?.['status']),
      abortedBy: label(aborted?.['kind'], 32),
    };
    options.events.record(
      TURN_LOG_SOURCE,
      kind.toLowerCase().replace(/[^a-z0-9.-]+/gu, '-'),
      fields,
      {
        ...(owner === undefined ? {} : { bot: owner.botSlug }),
        level: kind === 'completed' ? 'info' : 'warn',
      },
    );
  };

  return {
    observe(sessionId, event) {
      try {
        const data = record(event.data);
        if (event.type === 'request/header') {
          const config = record(record(data?.['header'])?.['config']);
          const provider = label(config?.['provider']);
          const model = label(config?.['model']);
          if (!routes.has(sessionId) && routes.size >= MAX_ROUTES)
            routes.delete(routes.keys().next().value!);
          routes.set(sessionId, {
            ...(provider === undefined ? {} : { provider }),
            ...(model === undefined ? {} : { model }),
          });
          return;
        }
        if (event.type === 'turn/start') {
          if (open.size >= MAX_OPEN_TURNS && !open.has(sessionId)) return;
          open.set(sessionId, {
            turn: count(data?.['turn']) ?? 0,
            startedAt: event.time,
            steps: 0,
            tools: 0,
            toolErrors: 0,
            lastToolError: undefined,
            slowestTool: undefined,
            slowestToolMs: 0,
            firstTokenMs: undefined,
            stepStartedAt: undefined,
            modelMs: 0,
            inputTokens: 0,
            outputTokens: 0,
            approvals: 0,
            calls: new Map(),
          });
          return;
        }
        const state = open.get(sessionId);
        if (state === undefined) return;
        switch (event.type) {
          case 'step/start':
            state.steps += 1;
            state.stepStartedAt = event.time;
            return;
          case 'assistant/message': {
            const stepStart = state.stepStartedAt;
            state.stepStartedAt = undefined;
            if (stepStart !== undefined) {
              state.modelMs += Math.max(0, Math.round(event.time - stepStart));
              const first = firstTokenAt(data?.['stream']);
              if (
                state.firstTokenMs === undefined &&
                first !== undefined &&
                first >= stepStart &&
                first <= event.time
              )
                state.firstTokenMs = Math.round(first - stepStart);
            }
            const usage = record(data?.['usage']);
            state.inputTokens += count(usage?.['inputTokens']) ?? 0;
            state.outputTokens += count(usage?.['outputTokens']) ?? 0;
            return;
          }
          case 'tool/call': {
            state.tools += 1;
            const callId = label(data?.['callId'], 128);
            const name = label(data?.['name']);
            if (callId !== undefined && name !== undefined && state.calls.size < MAX_OPEN_CALLS)
              state.calls.set(callId, { name, at: event.time });
            return;
          }
          case 'tool/result': {
            const message = record(data?.['message']);
            const callId = label(message?.['toolCallId'], 128);
            const call = callId === undefined ? undefined : state.calls.get(callId);
            if (callId !== undefined) state.calls.delete(callId);
            if (call !== undefined) {
              const ms = Math.max(0, Math.round(event.time - call.at));
              if (ms >= state.slowestToolMs) {
                state.slowestToolMs = ms;
                state.slowestTool = call.name;
              }
            }
            const error = record(data?.['error']);
            if (error !== undefined || message?.['isError'] === true) {
              state.toolErrors += 1;
              state.lastToolError = `${call?.name ?? 'tool'}:${label(error?.['code'], 48) ?? 'error'}`;
            }
            return;
          }
          case 'approval/asked':
            state.approvals += 1;
            return;
          case 'turn/end':
            close(sessionId, state, event);
            return;
        }
      } catch {}
    },
    forget(sessionId) {
      open.delete(sessionId);
      routes.delete(sessionId);
    },
  };
}
