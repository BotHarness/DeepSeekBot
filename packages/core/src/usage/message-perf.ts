import { assistantStreamFirstTokenTime, type AssistantStreamRecord } from '@deepseek-ai/dsh-llm';

import type { ChannelMessagePerf } from '../channels/channel.js';
import type { DshSessionEvent } from '../sessions/source.js';

export interface MessagePerfTracker {
  observeSessionEvent(sessionId: string, event: DshSessionEvent): void;

  forSession(sessionId: string, body: string): ChannelMessagePerf | undefined;

  clear(sessionId: string): void;
}

interface SessionPerf {
  elapsedMs: number | undefined;
  outputTokens: number | undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function generationTimeMs(event: DshSessionEvent): number | undefined {
  const stream = record(event.data)?.['stream'];
  if (!Array.isArray(stream)) return undefined;
  try {
    const records = stream as readonly AssistantStreamRecord[];
    const start = assistantStreamFirstTokenTime(records);
    const last = records.at(-1);
    if (start === undefined || last === undefined) return undefined;
    const end =
      last.type === 'chunk' ? last.time : last.dt.reduce((time, gap) => time + gap, last.time0);
    const elapsedMs = end - start;
    return Number.isFinite(elapsedMs) && elapsedMs >= MIN_WINDOW_MS ? elapsedMs : undefined;
  } catch {
    return undefined;
  }
}

function timedOutputTokens(event: DshSessionEvent): number | undefined {
  const data = record(event.data);
  const usage = record(data?.['usage']);
  const output = safeCount(usage?.['outputTokens']);
  if (output === undefined) return undefined;
  const stream = data?.['stream'];
  const streamedReasoning =
    Array.isArray(stream) &&
    (stream as readonly AssistantStreamRecord[]).some(
      (item) =>
        (item.type === 'reasoning-chunks' && item.texts.some((text) => text !== '')) ||
        (item.type === 'chunk' && item.chunk.type === 'reasoning-delta' && item.chunk.text !== ''),
    );
  const reasoning = streamedReasoning ? 0 : (safeCount(usage?.['reasoningTokens']) ?? 0);
  return reasoning > output ? undefined : output - reasoning;
}

const NARROW = 4;
const WIDE =
  /[\u2e80-\u2eff\u3000-\u303f\u3040-\u30ff\u3130-\u318f\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7ff\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{2fa1f}]/u;
const MIN_WINDOW_MS = 500;
const UNTIMED_OUTPUT_RATIO = 3;

export function estimateOutputTokens(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  let units = 0;
  for (const character of text) units += WIDE.test(character) ? 1 : 1 / NARROW;
  return units > 0 ? Math.ceil(units) : undefined;
}

class PerfTracker implements MessagePerfTracker {
  readonly #sessions = new Map<string, SessionPerf>();

  observeSessionEvent(sessionId: string, event: DshSessionEvent): void {
    if (event.type === 'step/start') {
      this.#sessions.delete(sessionId);
    } else if (event.type === 'assistant/message') {
      this.#sessions.set(sessionId, {
        elapsedMs: generationTimeMs(event),
        outputTokens: timedOutputTokens(event),
      });
    }
  }

  forSession(sessionId: string, body: string): ChannelMessagePerf | undefined {
    if (body.trim() === '') return undefined;
    const state = this.#sessions.get(sessionId);
    if (state === undefined || state.elapsedMs === undefined) return undefined;
    this.#sessions.delete(sessionId);
    const estimate = estimateOutputTokens(body);
    const reported =
      state.outputTokens !== undefined &&
      (estimate === undefined || state.outputTokens <= estimate * UNTIMED_OUTPUT_RATIO)
        ? state.outputTokens
        : undefined;
    const outputTokens = reported ?? estimate;
    if (outputTokens === undefined || outputTokens <= 0) return undefined;
    return { outputTokens, elapsedMs: state.elapsedMs, estimated: reported === undefined };
  }

  clear(sessionId: string): void {
    this.#sessions.delete(sessionId);
  }
}

export function createMessagePerfTracker(): MessagePerfTracker {
  return new PerfTracker();
}
