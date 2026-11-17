import {
  CONTEXT_SOURCES,
  contextSources,
  textShares,
  type ContextSourceSurface,
} from '../runtime/context-sources.js';
import {
  BOT_TURN_OUTCOMES,
  BOT_TURN_ROLES,
  BOT_TURN_TRIGGERS,
  contextSourceProperty,
} from './bot-turn-spec.js';
import type { DshSessionEvent } from '../sessions/source.js';
import { reportedBuckets } from '../usage/usage.js';
import type { TelemetryService, TelemetryValue } from './service.js';

const MAX_OPEN_TURNS = 200;

interface OpenTurn {
  startSeq: number | undefined;
  steps: number;
  tools: number;
  trigger: (typeof BOT_TURN_TRIGGERS)[number] | undefined;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  unknownUsage: boolean;
}

export interface BotTurnTelemetry {
  observe(sessionId: string, event: DshSessionEvent): void;
  forget(sessionId: string): void;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function triggerOf(event: DshSessionEvent): (typeof BOT_TURN_TRIGGERS)[number] | undefined {
  const data = record(event.data);
  const message = record(data?.['message']) ?? data;
  if (record(message?.['source'])?.['kind'] !== 'user') return undefined;
  const content = Array.isArray(message?.['content']) ? (message['content'] as unknown[]) : [];
  const found = new Set<string>();
  for (const block of content) {
    const text = record(block)?.['text'];
    if (typeof text !== 'string') continue;
    for (const [source] of textShares(text)) found.add(source);
  }
  const human = found.has('human');
  const inbox = [...found].some((source) => source.startsWith('inbox-'));
  return human && inbox ? 'mixed' : inbox ? 'inbox' : human ? 'human' : 'other';
}

function outcomeOf(event: DshSessionEvent): (typeof BOT_TURN_OUTCOMES)[number] {
  const kind = record(record(event.data)?.['reason'])?.['kind'];
  if (typeof kind !== 'string') return 'other';
  const normalized = kind.toLowerCase();
  if (normalized === 'completed') return 'completed';
  if (normalized === 'failed' || normalized === 'error') return 'failed';
  if (normalized === 'cancelled' || normalized === 'canceled' || normalized === 'aborted')
    return 'cancelled';
  return 'other';
}

export function createBotTurnTelemetry(options: {
  telemetry: Pick<TelemetryService, 'enabled' | 'capture'>;
  role(sessionId: string): string | undefined;
  measure(sessionId: string): ContextSourceSurface | undefined;
  log?: (message: string) => void;
}): BotTurnTelemetry {
  const open = new Map<string, OpenTurn>();

  const close = (sessionId: string, state: OpenTurn, event: DshSessionEvent): void => {
    open.delete(sessionId);
    const role = options.role(sessionId);
    if (role === undefined) return;
    const properties: Record<string, TelemetryValue> = {
      role: (BOT_TURN_ROLES as readonly string[]).includes(role) ? role : 'other',
      outcome: outcomeOf(event),
      trigger: state.trigger ?? 'other',
      step_count: state.steps,
      tool_call_count: state.tools,
      input_token_count: state.input,
      output_token_count: state.output,
      cache_read_token_count: state.cacheRead,
      cache_write_token_count: state.cacheWrite,
      is_partial: state.unknownUsage,
    };
    const measured = options.measure(sessionId);
    if (measured !== undefined) {
      const whole = contextSources(measured);
      const start = state.startSeq;
      const addedNodes =
        start === undefined ? [] : measured.nodes.filter((node) => Number(node.seq) >= start);
      const added = contextSources({
        nodes: addedNodes,
        totalTokens: addedNodes.reduce((sum, node) => sum + node.tokens, 0),
        eventAt: (seq) => measured.eventAt(seq),
      });
      properties['context_token_count'] = Math.max(0, Math.round(measured.totalTokens));
      for (const source of CONTEXT_SOURCES) {
        properties[contextSourceProperty(source, 'context')] =
          whole.find((row) => row.source === source)?.tokens ?? 0;
        properties[contextSourceProperty(source, 'added')] =
          added.find((row) => row.source === source)?.tokens ?? 0;
      }
    }
    options.telemetry.capture('chat:bot_turn_complete', properties);
  };

  return {
    observe(sessionId, event) {
      try {
        if (!options.telemetry.enabled) {
          open.clear();
          return;
        }
        if (event.type === 'turn/start') {
          if (open.size >= MAX_OPEN_TURNS && !open.has(sessionId)) return;
          open.set(sessionId, {
            startSeq: event.seq,
            steps: 0,
            tools: 0,
            trigger: undefined,
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            unknownUsage: false,
          });
          return;
        }
        const state = open.get(sessionId);
        if (state === undefined) return;
        switch (event.type) {
          case 'user/message':
            state.trigger ??= triggerOf(event);
            return;
          case 'step/start':
            state.steps += 1;
            return;
          case 'tool/call':
            state.tools += 1;
            return;
          case 'assistant/message': {
            const usage = reportedBuckets(event);
            if (
              usage.uncachedInputTokens === undefined ||
              usage.outputTokens === undefined ||
              usage.cacheReadTokens === undefined
            )
              state.unknownUsage = true;
            state.input += usage.uncachedInputTokens ?? 0;
            state.output += usage.outputTokens ?? 0;
            state.cacheRead += usage.cacheReadTokens ?? 0;
            state.cacheWrite += usage.cacheWriteTokens ?? 0;
            return;
          }
          case 'turn/end':
            close(sessionId, state, event);
            return;
        }
      } catch {
        open.delete(sessionId);
        options.log?.('telemetry phase=bot-turn-skipped');
      }
    },
    forget(sessionId) {
      open.delete(sessionId);
    },
  };
}
