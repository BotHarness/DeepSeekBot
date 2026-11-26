import { isEngineId } from '@botharness/host-protocol/subscription-engine';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';

export function sessionTarget(
  recorded: TurnTarget | undefined,
  engine: { engine: string; account?: string; state: string } | undefined,
): TurnTarget | undefined {
  if (engine === undefined || !isEngineId(engine.engine)) return recorded;
  const account = engine.account === undefined ? {} : { account: engine.account };
  if (
    recorded === undefined ||
    (engine.state === 'starting' &&
      (recorded.kind !== 'engine' || recorded.engine !== engine.engine))
  )
    return { kind: 'engine', engine: engine.engine, ...account };
  return recorded.kind === 'engine' && recorded.engine === engine.engine
    ? { ...account, ...recorded }
    : recorded;
}
