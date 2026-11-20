import type {
  BotScheduleFiring,
  BotScheduleSummary,
  ScheduleTrigger,
} from '@botharness/host-protocol/wire';
import { t } from '../strings';

export function triggerText(trigger: ScheduleTrigger): string {
  if (trigger.kind === 'every') return t.routineEvery(trigger.everySeconds);
  if (trigger.kind === 'daily') return t.routineDaily(trigger.time);
  if (trigger.kind === 'weekly') return t.routineWeekly(trigger.time, trigger.weekdays);
  if (trigger.kind === 'once') return t.routineOnce(trigger.date, trigger.time);
  return t.routineCron(trigger.expression);
}

export function when(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function routineDetail(routine: BotScheduleSummary): string {
  return [
    triggerText(routine.trigger),
    !routine.enabled
      ? t.routineOff
      : routine.nextRunAt === undefined
        ? undefined
        : t.routineNext(when(routine.nextRunAt)),
  ]
    .filter((part) => part !== undefined)
    .join(' · ');
}

export function firingText(firing: BotScheduleFiring): string {
  return `${t.routineRunKind[firing.trigger]} · ${t.routineRunState[firing.state]}`;
}
