import type { HostClient } from './client';
import type { BotScheduleFiring, BotScheduleSummary, ScheduleTrigger } from './wire';

export type RoutineTarget = { kind: 'new' } | { kind: 'open'; routine: BotScheduleSummary };

export type RoutineCadence = 'daily' | 'weekly' | 'hours';

export interface RoutineForm {
  title: string;
  prompt: string;
  cadence: RoutineCadence;
  time: string;
  weekdays: number[];
  hours: string;
  timeZone: string;
}

export type RoutineProblem = 'title' | 'prompt' | 'time' | 'weekdays' | 'hours';

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const WORKDAYS = [1, 2, 3, 4, 5];
const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/u;
const HOUR = 3600;
const MAX_HOURS = 24 * 7;

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function newRoutineForm(timeZone = deviceTimeZone()): RoutineForm {
  return {
    title: '',
    prompt: '',
    cadence: 'daily',
    time: '09:00',
    weekdays: [...WORKDAYS],
    hours: '1',
    timeZone,
  };
}

export function routineFormOf(routine: BotScheduleSummary): RoutineForm | undefined {
  const base = { ...newRoutineForm(), title: routine.title, prompt: routine.prompt ?? '' };
  const trigger = routine.trigger;
  if (trigger.kind === 'daily')
    return { ...base, cadence: 'daily', time: trigger.time, timeZone: trigger.timeZone };
  if (trigger.kind === 'weekly')
    return {
      ...base,
      cadence: 'weekly',
      time: trigger.time,
      weekdays: [...trigger.weekdays],
      timeZone: trigger.timeZone,
    };
  if (trigger.kind === 'every' && trigger.everySeconds % HOUR === 0)
    return { ...base, cadence: 'hours', hours: String(trigger.everySeconds / HOUR) };
  return undefined;
}

export function normalTime(text: string): string | undefined {
  const match = TIME.exec(text.trim());
  return match === null ? undefined : `${match[1]!.padStart(2, '0')}:${match[2]}`;
}

function wholeHours(text: string): number | undefined {
  const hours = Number(text.trim());
  return Number.isSafeInteger(hours) && hours >= 1 && hours <= MAX_HOURS ? hours : undefined;
}

export function routineTriggerOf(form: RoutineForm): ScheduleTrigger | undefined {
  if (form.cadence === 'hours') {
    const hours = wholeHours(form.hours);
    return hours === undefined ? undefined : { kind: 'every', everySeconds: hours * HOUR };
  }
  const time = normalTime(form.time);
  if (time === undefined) return undefined;
  if (form.cadence === 'daily') return { kind: 'daily', time, timeZone: form.timeZone };
  const weekdays = [...new Set(form.weekdays)].sort((a, b) => a - b);
  return weekdays.length === 0
    ? undefined
    : { kind: 'weekly', time, timeZone: form.timeZone, weekdays };
}

export function routineProblem(form: RoutineForm): RoutineProblem | undefined {
  if (form.title.trim() === '') return 'title';
  if (form.prompt.trim() === '') return 'prompt';
  if (form.cadence === 'hours') return wholeHours(form.hours) === undefined ? 'hours' : undefined;
  if (normalTime(form.time) === undefined) return 'time';
  if (form.cadence === 'weekly' && form.weekdays.length === 0) return 'weekdays';
  return undefined;
}

function schedule(value: unknown, method: string): BotScheduleSummary {
  const schedule = (value as { schedule?: BotScheduleSummary } | undefined)?.schedule;
  if (typeof schedule?.id !== 'string') throw new Error(`${method} returned no routine`);
  return schedule;
}

export interface Routines {
  list(): Promise<BotScheduleSummary[]>;
  history(id: string): Promise<BotScheduleFiring[]>;
  runNow(id: string): Promise<BotScheduleFiring>;
  setEnabled(id: string, enabled: boolean): Promise<BotScheduleSummary>;
  remove(id: string): Promise<void>;
  preview(trigger: ScheduleTrigger): Promise<string[]>;
  create(form: RoutineForm): Promise<BotScheduleSummary>;
  update(id: string, form: RoutineForm): Promise<BotScheduleSummary>;
}

function written(form: RoutineForm) {
  const trigger = routineTriggerOf(form);
  if (trigger === undefined || routineProblem(form) !== undefined)
    throw new Error('The routine is incomplete');
  return { title: form.title.trim(), prompt: form.prompt.trim(), trigger };
}

export function botRoutines(client: HostClient, slug: string): Routines {
  return {
    async list() {
      return (await client.call<{ schedules: BotScheduleSummary[] }>('scheduleList', { slug }))
        .schedules;
    },
    async history(id) {
      return (await client.call<{ firings: BotScheduleFiring[] }>('scheduleHistory', { slug, id }))
        .firings;
    },
    async runNow(id) {
      return (await client.call<{ firing: BotScheduleFiring }>('scheduleRunNow', { slug, id }))
        .firing;
    },
    async setEnabled(id, enabled) {
      return schedule(
        await client.call<unknown>('scheduleUpdate', { slug, id, change: { enabled } }),
        'scheduleUpdate',
      );
    },
    async remove(id) {
      await client.call<unknown>('scheduleDelete', { slug, id });
    },
    async preview(trigger) {
      return (await client.call<{ occurrences: string[] }>('schedulePreview', { trigger }))
        .occurrences;
    },
    async create(form) {
      return schedule(
        await client.call<unknown>('scheduleCreate', { slug, input: written(form) }),
        'scheduleCreate',
      );
    },
    async update(id, form) {
      return schedule(
        await client.call<unknown>('scheduleUpdate', { slug, id, change: written(form) }),
        'scheduleUpdate',
      );
    },
  };
}
