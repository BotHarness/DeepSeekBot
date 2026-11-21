import {
  asObject,
  invalidInput,
  unavailable,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { modelFailure } from '../../models/provider-bridge.js';
import type { UsageByMemberResult } from '../../usage/overview.js';
import { createTeamBridge } from '../../team/bridge.js';
import { type HumanContext } from '../../humans/context.js';
import { isUsageOverviewPeriod } from '../../usage/overview.js';
import type { TeamBridgeMethods as ExistingTeamBridgeMethods } from '../../team/bridge.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';

export interface TeamBridgeMethods extends ExistingTeamBridgeMethods {
  usageByMember(payload: unknown): BridgeResult<UsageByMemberResult>;
}

export function createTeamBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry: BridgeMethodsDeps['registry'],
): Pick<TeamBridgeMethods, 'usageByMember'> {
  return {
    usageByMember(payload) {
      const period = asObject(payload)['period'];
      if (!isUsageOverviewPeriod(period)) return invalidInput('period-invalid');
      if (!deps.team) return unavailable();
      try {
        let names: Map<string, string> | undefined;
        return {
          ok: true,
          value: deps.team.usageByMember(human, period, deps.usage, (slug) => {
            names ??= new Map(
              globalRegistry.listHistorical().map((bot) => [bot.slug, bot.displayName]),
            );
            return names.get(slug) ?? slug;
          }),
        };
      } catch (error) {
        return modelFailure(error);
      }
    },
  };
}

export { createTeamBridge };
