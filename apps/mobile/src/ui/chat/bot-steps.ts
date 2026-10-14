import type { RosterBot } from '../../host/client';
import type { AggregatedState, WireToolActivity } from '../../host/wire';
import { t } from '../strings';

export interface StepRow {
  key: string;
  who: string;
  what: string;
}

export function stepLabel(activity: WireToolActivity | undefined, state: AggregatedState): string {
  if (activity === undefined || activity.effect === 'thinking-dots') return t.state[state];
  return [t.effect[activity.effect], activity.toolName, activity.publicDetail]
    .filter((part) => part !== undefined && part.trim() !== '')
    .join(' · ');
}

export function stepRows(bot: RosterBot): StepRow[] {
  return (bot.sessions ?? []).map((session) => ({
    key: session.id,
    who:
      session.role === 'assignment' && session.name !== undefined
        ? session.name
        : t.stepRole[session.role],
    what: stepLabel(session.activity, session.state),
  }));
}
