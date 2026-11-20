import { loadAveragePerf, type AveragePerfView } from './message-perf.js';
import {
  loadChannelActivityToday,
  loadProfileActivity,
  loadProfileSessionUsage,
  type ProfileSessionUsage,
  loadProfileUsage,
  loadOverviewUsage,
  type UsageFilter,
  type UsageQueryResult,
  loadGroupProfileActivity,
  loadTimelinePage,
  type BridgeCall,
  type ProfileActivity,
  type ProfileActivityWindow,
  type GroupProfileActivity,
} from './bridge.js';
import type { BridgeActions } from './actions.js';

export interface UsageActions {
  averageReplyPerf(channelId: string, signal?: AbortSignal): Promise<AveragePerfView | undefined>;
  profileActivity(channelId: string, window?: ProfileActivityWindow): Promise<ProfileActivity>;
  profileSessionUsage(channelId: string): Promise<ProfileSessionUsage>;
  profileUsage(channelId: string, filter: UsageFilter): Promise<UsageQueryResult>;
  groupProfileActivity(channelId: string): Promise<GroupProfileActivity>;
}

export function createUsageActions(call: BridgeCall) {
  return {
    averageReplyPerf(channelId, signal) {
      return loadAveragePerf(async (request) => {
        signal?.throwIfAborted();
        const { page } = await loadTimelinePage(call, channelId, request, signal);
        return page;
      });
    },
    profileActivity: (channelId, window) => loadProfileActivity(call, channelId, window),
    profileSessionUsage: (channelId) => loadProfileSessionUsage(call, channelId),
    overviewUsage: (period, after) => loadOverviewUsage(call, period, after),
    profileUsage: (channelId, filter) => loadProfileUsage(call, channelId, filter),
    channelActivityToday: () => loadChannelActivityToday(call),
    groupProfileActivity: (channelId) => loadGroupProfileActivity(call, channelId),
  } satisfies UsageActions & Pick<BridgeActions, 'overviewUsage' | 'channelActivityToday'>;
}
