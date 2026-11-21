import { isEngineId, type EngineId } from './subscription-engine';

export type TurnTarget =
  | { kind: 'dsh'; provider: string; model: string }
  | {
      kind: 'engine';
      engine: EngineId;
      account?: string;
      model?: string;
      reasoningEffort?: string;
    };

const nonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function isTurnTarget(value: unknown): value is TurnTarget {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return false;
  if (value.kind === 'dsh')
    return (
      'provider' in value && nonBlank(value.provider) && 'model' in value && nonBlank(value.model)
    );
  return (
    value.kind === 'engine' &&
    'engine' in value &&
    isEngineId(value.engine) &&
    (!('account' in value) || nonBlank(value.account)) &&
    (!('model' in value) || nonBlank(value.model)) &&
    (!('reasoningEffort' in value) || nonBlank(value.reasoningEffort))
  );
}

export function isTurnTargetPath(value: unknown): value is TurnTarget[] {
  return (
    Array.isArray(value) && value.length > 0 && value.length <= 32 && value.every(isTurnTarget)
  );
}

export type TurnTargetSwitchReason = 'quota' | 'rate-limit' | 'credential';

export function isTurnTargetSwitchReason(value: unknown): value is TurnTargetSwitchReason {
  return value === 'quota' || value === 'rate-limit' || value === 'credential';
}

export interface TurnModelSwitch {
  from: TurnTarget;
  to: TurnTarget;
  reason?: TurnTargetSwitchReason;
}

export interface SessionTurnModelSwitch extends TurnModelSwitch {
  sessionId: string;
  turn: number;
}

export function isSessionTurnModelSwitch(value: unknown): value is SessionTurnModelSwitch {
  return (
    typeof value === 'object' &&
    value !== null &&
    'sessionId' in value &&
    nonBlank(value.sessionId) &&
    'turn' in value &&
    typeof value.turn === 'number' &&
    Number.isSafeInteger(value.turn) &&
    'from' in value &&
    isTurnTarget(value.from) &&
    'to' in value &&
    isTurnTarget(value.to) &&
    (!('reason' in value) || isTurnTargetSwitchReason(value.reason))
  );
}
