import { isEngineId, type EngineId } from './subscription-engine';

export type SessionModelChoice =
  | { kind: 'model'; provider: string; model: string; effort?: string }
  | { kind: 'engine'; engine: EngineId; accountId?: string; model: string; effort?: string }
  | { kind: 'group'; id: string; effort?: string };

export interface SessionModelState {
  override: SessionModelChoice | null;
  default: SessionModelChoice | null;
  active?: SessionModelChoice | null;
}

const filled = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export function sessionModelChoice(input: unknown): SessionModelChoice | undefined {
  if (typeof input !== 'object' || input === null || !('kind' in input)) return;
  if ('effort' in input && !filled(input.effort)) return;
  const effort = 'effort' in input && filled(input.effort) ? { effort: input.effort } : {};
  if (input.kind === 'group' && 'id' in input && filled(input.id))
    return { kind: 'group', id: input.id, ...effort };
  if (!('model' in input) || !filled(input.model)) return;
  if (input.kind === 'model' && 'provider' in input && filled(input.provider))
    return { kind: 'model', provider: input.provider, model: input.model, ...effort };
  if (input.kind === 'engine' && 'engine' in input && isEngineId(input.engine)) {
    if ('accountId' in input && !filled(input.accountId)) return;
    const accountId = 'accountId' in input && filled(input.accountId) ? input.accountId : undefined;
    return {
      kind: 'engine',
      engine: input.engine,
      ...(accountId === undefined ? {} : { accountId }),
      model: input.model,
      ...effort,
    };
  }
}
