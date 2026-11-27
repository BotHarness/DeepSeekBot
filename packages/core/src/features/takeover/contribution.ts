import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HumanContext } from '../../humans/context.js';
import { createTakeoverAdapterMethods, type TakeoverBridgeDeps } from './methods.js';
import { mountTakeover } from './plugin.js';
import { takeoverRpc } from './rpc.js';

export function createTakeoverContribution() {
  return {
    id: 'takeover',
    bridgeMethods: ({ human, deps }) => createTakeoverAdapterMethods(human, deps),
    rpc: takeoverRpc,
    host: { afterConfinement: mountTakeover },
  } satisfies FeatureContribution<
    { human: HumanContext; deps: TakeoverBridgeDeps },
    never,
    { afterConfinement: typeof mountTakeover }
  >;
}
