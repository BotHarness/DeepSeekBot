import type { DiagnosticEvents } from '../diagnostics/diagnostic-log.js';

export interface PrivateInputLogDetails {
  requestId?: string;
  botSlug?: string;
  sessionId?: string;
  durationMs?: number;
  program?: string;
  tool?: string;
  failure?: string;
  reason?: string;
  exitCode?: number | null;
  httpStatus?: number;
  errorName?: string;
  initiator?: 'replacement' | 'revocation';
  active?: number;
  stopped?: number;
  completed?: number;
  uncertain?: number;
}

export type PrivateInputLog = (phase: string, details?: PrivateInputLogDetails) => void;

export class PrivateInputFailure extends Error {
  constructor(
    message: string,
    readonly reason: string,
  ) {
    super(message);
    this.name = 'PrivateInputFailure';
  }
}

const PRIVATE_INPUT_TROUBLE =
  /failed|unsuccessful|unreachable|unavailable|refused|revoked|expired|required|cancelled/u;

export function privateInputLog(
  info: (format: string, value: unknown) => void,
  events?: DiagnosticEvents,
): PrivateInputLog {
  return (phase, details = {}) => {
    info('private-input %j', { phase, ...details });
    events?.record(
      'private-input',
      phase,
      { ...details },
      {
        ...(details.botSlug === undefined ? {} : { bot: details.botSlug }),
        level: PRIVATE_INPUT_TROUBLE.test(phase) ? 'warn' : 'info',
      },
    );
  };
}

export function privateToolOutcome(result: string):
  | {
      phase: 'tool-refused' | 'tool-unsuccessful';
      details: PrivateInputLogDetails;
    }
  | undefined {
  let value: unknown;
  try {
    value = JSON.parse(result);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const { refused, successful, httpStatus, exitCode } = value as Record<string, unknown>;
  if (typeof refused === 'string')
    return {
      phase: 'tool-refused',
      details: { reason: refused.slice(0, 300) },
    };
  if (successful !== false) return undefined;
  return {
    phase: 'tool-unsuccessful',
    details: {
      ...(typeof httpStatus === 'number' ? { httpStatus } : {}),
      ...(typeof exitCode === 'number' || exitCode === null
        ? { exitCode: exitCode as number | null }
        : {}),
    },
  };
}

export function privateToolFailure(error: unknown): PrivateInputLogDetails {
  const errorName = error instanceof Error ? error.name : typeof error;
  if (error instanceof PrivateInputFailure) return { reason: error.reason, errorName };
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && /^[a-z][a-z0-9-]{0,63}$/u.test(code))
    return { reason: code, errorName };
  return {
    reason: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    errorName,
  };
}
