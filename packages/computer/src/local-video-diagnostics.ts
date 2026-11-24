import type { LocalVideoRefusal } from './local-video-contract.js';

export type FailureSource =
  | 'owner'
  | 'pause-store'
  | 'bot-drain'
  | 'human-drain'
  | 'geometry'
  | 'driver'
  | 'helper'
  | 'signaling'
  | 'cleanup'
  | 'media'
  | 'control';
export type Initiator = 'host-owner' | 'paired-device' | 'lifecycle' | 'helper' | 'timer';
export interface OperationTrace {
  readonly id: string;
  readonly phase: string;
  readonly initiator: Initiator;
  readonly started: number;
  readonly runtime: string;
  attempt: string;
  grant: number;
  source: FailureSource;
  external:
    | 'none'
    | 'get_screen_size'
    | 'media-open'
    | 'media-answer'
    | 'media-close'
    | 'desktop-input'
    | 'cursor-setup';
  cause?: LocalVideoRefusal;
}

export function formatLocalVideoTrace(
  trace: OperationTrace,
  now: number,
  paused: boolean,
  code?: LocalVideoRefusal,
): string {
  const retryable =
    trace.phase !== 'input' &&
    code !== undefined &&
    ['queue-full', 'drain-timeout', 'not-ready', 'media-not-live', 'control-disconnected'].includes(
      code,
    );
  return (
    `phase=local-video-${trace.phase} operation=${trace.id} initiator=${trace.initiator}` +
    ` runtime=${trace.runtime} attempt=${trace.attempt} grant=${trace.grant}` +
    ` durationMs=${Math.max(0, Math.round(now - trace.started))}` +
    ` outcome=${code === undefined ? 'ok' : 'refused'} refusal=${code ?? 'none'}` +
    ` source=${code === undefined ? 'none' : trace.source} cause=${trace.cause ?? code ?? 'none'}` +
    ` external=${trace.external}` +
    ` retryable=${retryable} paused=${paused} bots=${paused ? 'remain-paused' : 'enabled'}`
  );
}
