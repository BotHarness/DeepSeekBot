import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { UsageOverviewPeriod } from '../../usage/overview.js';
import type { OverviewUsage } from '../../bridge/methods.js';
import type { UsageFilter, UsageQueryResult } from '../../usage/query.js';
import type { ProfileSessionUsage } from '../../bridge/methods.js';
import type { UsageAdapterMethods } from './methods.js';

export function overviewUsage(
  methods: UsageAdapterMethods,
  period: UsageOverviewPeriod,
  after?: string,
): OverviewUsage {
  return unwrap(methods.overviewUsage({ period, after }));
}

export function profileUsage(
  methods: UsageAdapterMethods,
  channelId: string,
  filter: UsageFilter,
): UsageQueryResult {
  return unwrap(methods.profileUsage({ channelId, filter }));
}

export async function profileSessionUsage(
  methods: UsageAdapterMethods,
  channelId: string,
): Promise<ProfileSessionUsage> {
  return unwrap(await methods.profileSessionUsage({ channelId }));
}

export const usageRpcMethods = {
  async profileSessionUsage(channelId: string): Promise<ProfileSessionUsage> {
    return profileSessionUsage(this.methods, channelId);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const overviewUsageRpc = {
  overviewUsage(period: UsageOverviewPeriod, after?: string): OverviewUsage {
    return overviewUsage(this.methods, period, after);
  },

  profileUsage(channelId: string, filter: UsageFilter): UsageQueryResult {
    return profileUsage(this.methods, channelId, filter);
  },
} satisfies ThisType<BridgeRpcReceiver>;
