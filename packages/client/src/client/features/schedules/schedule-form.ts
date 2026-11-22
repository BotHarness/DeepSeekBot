import { type BotScheduleTrigger, type BotScheduleView } from '../../bridge.js';
import type { BotHarnessTranslate } from '../../locale.js';

type CadenceUnit = 'minutes' | 'hours' | 'daily' | 'weekly' | 'once' | 'cron';

export const WEEKDAYS = [
  [1, 'schedule.weekday.1'],
  [2, 'schedule.weekday.2'],
  [3, 'schedule.weekday.3'],
  [4, 'schedule.weekday.4'],
  [5, 'schedule.weekday.5'],
  [6, 'schedule.weekday.6'],
  [7, 'schedule.weekday.7'],
] as const;

const TIME = /^\d{2}:\d{2}$/u;

const DATE = /^\d{4}-\d{2}-\d{2}$/u;

export interface ScheduleForm {
  title: string;
  prompt: string;
  unit: CadenceUnit;
  every: string;
  time: string;
  timeZone: string;
  weekdays: number[];
  date: string;
  expression: string;
  locked: boolean;
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function emptyScheduleForm(
  timeZone = browserTimeZone(),
  now: Date = new Date(),
): ScheduleForm {
  return {
    title: '',
    prompt: '',
    unit: 'hours',
    every: '1',
    time: '09:00',
    timeZone,
    weekdays: [1, 2, 3, 4, 5],
    date: localDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    expression: '0 9 * * 1-5',
    locked: false,
  };
}

export function scheduleFormOf(schedule: BotScheduleView): ScheduleForm {
  const base = {
    ...emptyScheduleForm(),
    title: schedule.title,
    prompt: schedule.prompt,
    locked: schedule.locked,
  };
  const trigger = schedule.trigger;
  switch (trigger.kind) {
    case 'every': {
      const hours = trigger.everySeconds % 3600 === 0;
      return {
        ...base,
        unit: hours ? 'hours' : 'minutes',
        every: String(trigger.everySeconds / (hours ? 3600 : 60)),
      };
    }
    case 'daily':
      return {
        ...base,
        unit: 'daily',
        time: trigger.time,
        timeZone: trigger.timeZone,
      };
    case 'weekly':
      return {
        ...base,
        unit: 'weekly',
        time: trigger.time,
        timeZone: trigger.timeZone,
        weekdays: [...trigger.weekdays],
      };
    case 'once':
      return {
        ...base,
        unit: 'once',
        date: trigger.date,
        time: trigger.time,
        timeZone: trigger.timeZone,
      };
    case 'cron':
      return {
        ...base,
        unit: 'cron',
        expression: trigger.expression,
        timeZone: trigger.timeZone,
      };
  }
}

export function scheduleTriggerOf(form: ScheduleForm): BotScheduleTrigger | undefined {
  const timeZone = form.timeZone.trim();
  if (form.unit === 'minutes' || form.unit === 'hours') {
    const every = Number(form.every);
    if (!Number.isSafeInteger(every) || every < 1) return undefined;
    return {
      kind: 'every',
      everySeconds: every * (form.unit === 'hours' ? 3600 : 60),
    };
  }
  if (timeZone.length === 0) return undefined;
  if (form.unit === 'cron') {
    const expression = form.expression.trim().replace(/\s+/gu, ' ');
    return expression.length === 0 ? undefined : { kind: 'cron', expression, timeZone };
  }
  if (!TIME.test(form.time)) return undefined;
  if (form.unit === 'daily') return { kind: 'daily', time: form.time, timeZone };
  if (form.unit === 'weekly')
    return form.weekdays.length === 0
      ? undefined
      : {
          kind: 'weekly',
          time: form.time,
          timeZone,
          weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
        };
  return DATE.test(form.date)
    ? { kind: 'once', date: form.date, time: form.time, timeZone }
    : undefined;
}

export function scheduleCadenceLabel(trigger: BotScheduleTrigger, t: BotHarnessTranslate): string {
  if (trigger.kind === 'daily') return t('schedule.cadence.daily', { time: trigger.time });
  if (trigger.kind === 'weekly')
    return t('schedule.cadence.weekly', {
      days: weekdayList(trigger.weekdays, t),
      time: trigger.time,
    });
  if (trigger.kind === 'once')
    return t('schedule.cadence.once', {
      time: `${trigger.date.slice(5)} ${trigger.time}`,
    });
  if (trigger.kind === 'cron')
    return t('schedule.cadence.cron', { expression: trigger.expression });
  if (trigger.everySeconds % 3600 === 0) {
    const n = trigger.everySeconds / 3600;
    return n === 1 ? t('schedule.cadence.hour') : t('schedule.cadence.hours', { n });
  }
  const n = Math.round(trigger.everySeconds / 60);
  return n === 1 ? t('schedule.cadence.minute') : t('schedule.cadence.minutes', { n });
}

function weekdayList(weekdays: number[], t: BotHarnessTranslate): string {
  const days = [...weekdays].sort((a, b) => a - b).join(',');
  if (days === '1,2,3,4,5') return t('schedule.weekdays.workdays');
  if (days === '6,7') return t('schedule.weekdays.weekend');
  if (days === '1,2,3,4,5,6,7') return t('schedule.weekdays.everyDay');
  return WEEKDAYS.filter(([day]) => weekdays.includes(day))
    .map(([, key]) => t(key))
    .join(t('schedule.weekdays.separator'));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatSchedulePreview(iso: string): string {
  const at = new Date(iso);
  return `${localDate(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function formatScheduleTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === now.toDateString()
    ? clock
    : `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock}`;
}
