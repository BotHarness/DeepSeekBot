import type { ChannelMessage } from './channel.js';
import type { ChannelVoiceCallRecord } from './voice-call-record.js';

export type ChannelCallReadCode =
  | 'invalid-call'
  | 'call-not-found'
  | 'call-range-conflict'
  | 'invalid-call-window';

export class ChannelCallReadError extends Error {
  constructor(
    readonly code: ChannelCallReadCode,
    detail: string,
  ) {
    super(`channel_read: ${code}: ${detail}`);
    this.name = 'ChannelCallReadError';
  }
}

export interface ChannelCallWindowRequest {
  call?: string;
  fromMs?: number;
  toMs?: number;
  from?: string;
  to?: string;
}

export interface ChannelCallWindow {
  callId: string;
  botSlug: string;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  fromMs: number;
  toMs?: number;
  from: string;
  to?: string;
}

const CALL_ID = /^call-[a-f0-9]{16}$/u;

export const voiceCallStartMessageId = (callId: string) => `voice-call-started-${callId}`;
export const voiceCallEndMessageId = (callId: string) => `voice-call-ended-${callId}`;

function record(
  message: ChannelMessage | undefined,
  callId: string,
  state: 'started' | 'ended',
): ChannelVoiceCallRecord | undefined {
  const value = message?.author.kind === 'system' ? message.voiceCallRecord : undefined;
  return value?.callId === callId && value.state === state ? value : undefined;
}

function offset(value: unknown, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new ChannelCallReadError(
      'invalid-call-window',
      `${name} must be a non-negative whole number of milliseconds from the call's start`,
    );
  return value;
}

export function hasChannelCallWindow(request: ChannelCallWindowRequest): boolean {
  return request.call !== undefined || request.fromMs !== undefined || request.toMs !== undefined;
}

export function resolveChannelCallWindow(
  message: (messageId: string) => ChannelMessage | undefined,
  request: ChannelCallWindowRequest,
): ChannelCallWindow | undefined {
  if (!hasChannelCallWindow(request)) return undefined;
  if (request.call === undefined)
    throw new ChannelCallReadError('invalid-call-window', 'from_ms and to_ms need call');
  if (request.from !== undefined || request.to !== undefined)
    throw new ChannelCallReadError(
      'call-range-conflict',
      'use call with from_ms/to_ms, or from/to without call, not both',
    );
  const callId = typeof request.call === 'string' ? request.call.trim() : '';
  if (!CALL_ID.test(callId))
    throw new ChannelCallReadError('invalid-call', 'call must be a call id like call-<16 hex>');
  const fromMs = offset(request.fromMs, 'from_ms') ?? 0;
  const toMs = offset(request.toMs, 'to_ms');
  if (toMs !== undefined && fromMs > toMs)
    throw new ChannelCallReadError('invalid-call-window', 'from_ms is after to_ms');
  const started = record(message(voiceCallStartMessageId(callId)), callId, 'started');
  if (started === undefined)
    throw new ChannelCallReadError('call-not-found', `no voice call ${callId} in this Channel`);
  const ended = record(message(voiceCallEndMessageId(callId)), callId, 'ended');
  const start = Date.parse(started.startedAt);
  const end = ended?.state === 'ended' ? Date.parse(ended.endedAt) : undefined;
  if (end !== undefined && start + fromMs > end)
    throw new ChannelCallReadError(
      'invalid-call-window',
      `from_ms is past the end of call ${callId}, which lasted ${end - start} ms`,
    );
  const upper =
    toMs === undefined ? end : end === undefined ? start + toMs : Math.min(start + toMs, end);
  const iso = (ms: number) => {
    const date = new Date(ms);
    if (!Number.isFinite(date.getTime()))
      throw new ChannelCallReadError('invalid-call-window', 'the window is out of range');
    return date.toISOString();
  };
  return {
    callId,
    botSlug: started.botSlug,
    startedAt: started.startedAt,
    ...(ended?.state === 'ended' ? { endedAt: ended.endedAt, durationMs: end! - start } : {}),
    fromMs,
    ...(toMs === undefined ? {} : { toMs }),
    from: iso(start + fromMs),
    ...(upper === undefined ? {} : { to: iso(upper) }),
  };
}
