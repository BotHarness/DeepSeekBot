import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { activityStreams } from './rpc.js';

export function createActivityContribution() {
  return {
    id: 'activity',
    streams: activityStreams,
  } satisfies FeatureContribution;
}
