import type { AggregatedState, WireToolActivity } from '@botharness/host-protocol/wire';
import { t } from '../strings';

export function stepLabel(activity: WireToolActivity | undefined, state: AggregatedState): string {
  if (activity === undefined || activity.effect === 'thinking-dots') return t.state[state];
  return [t.effect[activity.effect], activity.toolName, activity.publicDetail]
    .filter((part) => part !== undefined && part.trim() !== '')
    .join(' · ');
}
