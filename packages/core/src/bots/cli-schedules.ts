export { SCHEDULE_OPTIONS } from './cli-option-spec.js';
import type { BotScheduleTrigger } from '../schedules/bot-schedules.js';
import { CliLiveError } from './cli-live-error.js';

export const SCHEDULE_COMMANDS = [
  'schedules',
  'schedule-create',
  'schedule-update',
  'schedule-delete',
  'schedule-history',
  'schedule-run-now',
  'schedule-preview',
] as const;

export type ScheduleCommand = (typeof SCHEDULE_COMMANDS)[number];

export function isScheduleCommand(command: string): command is ScheduleCommand {
  return SCHEDULE_COMMANDS.some((entry) => entry === command);
}

export interface ScheduleValues {
  title?: string;
  prompt?: string;
  sid?: string;
  every?: string;
  daily?: string;
  weekly?: string;
  weekdays?: string;
  'once-date'?: string;
  'once-time'?: string;
  cron?: string;
  timezone?: string;
  enabled?: boolean;
  disabled?: boolean;
  locked?: boolean;
  unlocked?: boolean;
  confirm?: boolean;
}

type Fail = (message: string) => Error;
type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;

function trimmed(value: string | undefined): string | undefined {
  const next = value?.trim();
  return next === undefined || next.length === 0 ? undefined : next;
}

export function scheduleTriggerFromFlags(
  values: ScheduleValues,
  fail: Fail,
): BotScheduleTrigger | undefined {
  const every = trimmed(values.every);
  const daily = trimmed(values.daily);
  const weekly = trimmed(values.weekly);
  const onceDate = trimmed(values['once-date']);
  const onceTime = trimmed(values['once-time']);
  const cron = trimmed(values.cron);
  const selected = [every, daily, weekly, onceDate, cron].filter(
    (value) => value !== undefined,
  ).length;
  if (selected === 0) return undefined;
  if (selected > 1)
    throw fail(
      'Pass exactly one schedule trigger: --every, --daily, --weekly, --once-date, or --cron.',
    );
  const timeZone = trimmed(values.timezone);
  if (every !== undefined) {
    if (!/^[0-9]+$/u.test(every) || Number(every) < 1)
      throw fail('--every must be a positive whole number of seconds.');
    return { kind: 'every', everySeconds: Number(every) };
  }
  if (timeZone === undefined) throw fail('--timezone is required for calendar triggers.');
  if (daily !== undefined) return { kind: 'daily', time: daily, timeZone };
  if (weekly !== undefined) {
    const weekdays = trimmed(values.weekdays);
    if (weekdays === undefined) throw fail('--weekdays is required for --weekly.');
    const days = weekdays.split(',').map((day) => day.trim());
    if (days.some((day) => !/^[0-6]$/u.test(day)))
      throw fail('--weekdays must be comma-separated days 0-6.');
    return {
      kind: 'weekly',
      time: weekly,
      timeZone,
      weekdays: days.map(Number),
    };
  }
  if (onceDate !== undefined) {
    if (onceTime === undefined) throw fail('--once-time is required for --once-date.');
    return { kind: 'once', date: onceDate, time: onceTime, timeZone };
  }
  return { kind: 'cron', expression: cron!, timeZone };
}

export function scheduleToggleFromFlags(
  values: ScheduleValues,
  on: 'enabled' | 'locked',
  off: 'disabled' | 'unlocked',
  fail: Fail,
): boolean | undefined {
  const isOn = values[on] === true;
  const isOff = values[off] === true;
  if (isOn && isOff) throw fail(`Pass --${on} or --${off}, not both.`);
  if (isOn) return true;
  if (isOff) return false;
  return undefined;
}

function usage(message: string): CliLiveError {
  return new CliLiveError('usage', message);
}

interface PreparedSchedule {
  method: string;
  args: Record<string, unknown>;
  trigger?: BotScheduleTrigger;
}

export function prepareScheduleCommand(
  command: ScheduleCommand,
  rest: readonly string[],
  values: ScheduleValues,
): PreparedSchedule {
  if (command === 'schedule-preview') {
    if (rest.length > 0) throw usage('schedule-preview takes no bot id.');
    const trigger = scheduleTriggerFromFlags(values, usage);
    if (trigger === undefined) throw usage('schedule-preview needs a trigger flag.');
    return { method: 'schedulePreview', args: { trigger }, trigger };
  }
  const slug = rest.length === 1 ? rest[0]!.trim() : '';
  if (slug.length === 0) throw usage(`${command} needs exactly one bot id.`);
  if (command === 'schedules') return { method: 'scheduleList', args: { slug } };
  if (command === 'schedule-create') {
    const title = trimmed(values.title);
    const prompt = trimmed(values.prompt);
    if (title === undefined || prompt === undefined)
      throw usage('--title and --prompt are required for schedule-create.');
    const trigger = scheduleTriggerFromFlags(values, usage);
    if (trigger === undefined) throw usage('schedule-create needs a trigger flag.');
    const enabled = scheduleToggleFromFlags(values, 'enabled', 'disabled', usage);
    const locked = scheduleToggleFromFlags(values, 'locked', 'unlocked', usage);
    return {
      method: 'scheduleCreate',
      args: {
        slug,
        input: {
          title,
          prompt,
          trigger,
          ...(enabled === undefined ? {} : { enabled }),
          ...(locked === undefined ? {} : { locked }),
        },
      },
    };
  }
  const id = trimmed(values.sid);
  if (id === undefined) throw usage(`--sid is required for ${command}.`);
  if (command === 'schedule-update') {
    const title = trimmed(values.title);
    const prompt = trimmed(values.prompt);
    const trigger = scheduleTriggerFromFlags(values, usage);
    const enabled = scheduleToggleFromFlags(values, 'enabled', 'disabled', usage);
    const locked = scheduleToggleFromFlags(values, 'locked', 'unlocked', usage);
    const change = {
      ...(title === undefined ? {} : { title }),
      ...(prompt === undefined ? {} : { prompt }),
      ...(trigger === undefined ? {} : { trigger }),
      ...(enabled === undefined ? {} : { enabled }),
      ...(locked === undefined ? {} : { locked }),
    };
    if (Object.keys(change).length === 0)
      throw usage('schedule-update needs at least one change flag.');
    return { method: 'scheduleUpdate', args: { slug, id, change } };
  }
  if (command === 'schedule-delete') {
    if (values.confirm !== true)
      throw usage('schedule-delete removes the schedule and its history. Pass --confirm.');
    return { method: 'scheduleDelete', args: { slug, id } };
  }
  if (command === 'schedule-history') return { method: 'scheduleHistory', args: { slug, id } };
  return { method: 'scheduleRunNow', args: { slug, id } };
}

export async function runScheduleCommand(prepared: PreparedSchedule, rpc: Rpc): Promise<unknown> {
  const value = await rpc<Record<string, unknown>>(prepared.method, prepared.args);
  return prepared.trigger === undefined ? value : { trigger: prepared.trigger, ...value };
}
