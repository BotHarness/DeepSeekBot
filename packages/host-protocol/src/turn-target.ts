import { isEngineId, type EngineId } from './subscription-engine';

export type TurnTarget =
  | { kind: 'dsh'; provider: string; model: string }
  | { kind: 'engine'; engine: EngineId; model?: string; reasoningEffort?: string };

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
    (!('model' in value) || nonBlank(value.model)) &&
    (!('reasoningEffort' in value) || nonBlank(value.reasoningEffort))
  );
}

export function isTurnTargetPath(value: unknown): value is TurnTarget[] {
  return (
    Array.isArray(value) && value.length > 0 && value.length <= 32 && value.every(isTurnTarget)
  );
}
