import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleFiring,
  BotScheduleInput,
  BotScheduleTrigger,
} from '../../core/src/schedules/bot-schedules';
import { HostAnswerInvalid, record, text, type HostCall } from './host-answer';

export type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleFiring,
  BotScheduleInput,
  BotScheduleTrigger,
};

const FIRING_TRIGGERS = ['planned', 'manual'] as const;
const FIRING_STATES = ['pending', 'observed', 'handled', 'coalesced', 'skipped'] as const;
const CREATORS = ['human', 'personabot'] as const;

function oneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return (options as readonly unknown[]).includes(value);
}

function whole(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function parseScheduleTrigger(value: unknown): BotScheduleTrigger | undefined {
  const trigger = record(value);
  if (trigger?.['kind'] === 'every')
    return whole(trigger['everySeconds'])
      ? { kind: 'every', everySeconds: trigger['everySeconds'] }
      : undefined;
  const timeZone = trigger?.['timeZone'];
  if (!text(timeZone)) return undefined;
  if (trigger?.['kind'] === 'cron')
    return text(trigger['expression'])
      ? { kind: 'cron', expression: trigger['expression'], timeZone }
      : undefined;
  const time = trigger?.['time'];
  if (!text(time)) return undefined;
  if (trigger?.['kind'] === 'daily') return { kind: 'daily', time, timeZone };
  if (trigger?.['kind'] === 'weekly')
    return Array.isArray(trigger['weekdays']) && trigger['weekdays'].every(whole)
      ? { kind: 'weekly', time, timeZone, weekdays: [...trigger['weekdays']] }
      : undefined;
  return trigger?.['kind'] === 'once' && text(trigger['date'])
    ? { kind: 'once', date: trigger['date'], time, timeZone }
    : undefined;
}

export function parseScheduleFiring(value: unknown): BotScheduleFiring {
  const firing = record(value);
  if (
    !text(firing?.['id']) ||
    !text(firing['scheduleId']) ||
    !oneOf(FIRING_TRIGGERS, firing['trigger']) ||
    !text(firing['occurrenceAt']) ||
    !text(firing['firedAt']) ||
    !oneOf(FIRING_STATES, firing['state'])
  )
    throw new HostAnswerInvalid('The computer returned an unreadable routine run.');
  return {
    id: firing['id'],
    scheduleId: firing['scheduleId'],
    trigger: firing['trigger'],
    occurrenceAt: firing['occurrenceAt'],
    firedAt: firing['firedAt'],
    state: firing['state'],
    ...(text(firing['sourceEventId']) ? { sourceEventId: firing['sourceEventId'] } : {}),
    ...(text(firing['sessionId']) ? { sessionId: firing['sessionId'] } : {}),
  };
}

export function parseSchedule(value: unknown): BotSchedule {
  const schedule = record(value);
  const trigger = parseScheduleTrigger(schedule?.['trigger']);
  if (
    !text(schedule?.['id']) ||
    !text(schedule['botSlug']) ||
    !text(schedule['title']) ||
    !text(schedule['prompt']) ||
    trigger === undefined ||
    typeof schedule['enabled'] !== 'boolean' ||
    !oneOf(CREATORS, schedule['creator']) ||
    typeof schedule['locked'] !== 'boolean' ||
    (schedule['nextRunAt'] !== undefined && !text(schedule['nextRunAt']))
  )
    throw new HostAnswerInvalid('The computer returned an unreadable routine.');
  return {
    id: schedule['id'],
    botSlug: schedule['botSlug'],
    title: schedule['title'],
    prompt: schedule['prompt'],
    trigger,
    enabled: schedule['enabled'],
    creator: schedule['creator'],
    locked: schedule['locked'],
    ...(text(schedule['nextRunAt']) ? { nextRunAt: schedule['nextRunAt'] } : {}),
    ...(schedule['lastFiring'] === undefined
      ? {}
      : { lastFiring: parseScheduleFiring(schedule['lastFiring']) }),
    createdAt: text(schedule['createdAt']) ? schedule['createdAt'] : '',
    updatedAt: text(schedule['updatedAt']) ? schedule['updatedAt'] : '',
  };
}

function list(value: unknown, key: string, method: string): unknown[] {
  const rows = record(value)?.[key];
  if (!Array.isArray(rows)) throw new HostAnswerInvalid(`${method} returned no ${key}.`);
  return rows;
}

export async function loadSchedules(host: HostCall, slug: string): Promise<BotSchedule[]> {
  return list(await host.call('scheduleList', { slug }), 'schedules', 'scheduleList').map(
    parseSchedule,
  );
}

export async function createSchedule(
  host: HostCall,
  slug: string,
  input: BotScheduleInput,
): Promise<BotSchedule> {
  return parseSchedule(record(await host.call('scheduleCreate', { slug, input }))?.['schedule']);
}

export async function updateSchedule(
  host: HostCall,
  slug: string,
  id: string,
  change: BotScheduleChange,
): Promise<BotSchedule> {
  return parseSchedule(
    record(await host.call('scheduleUpdate', { slug, id, change }))?.['schedule'],
  );
}

export async function deleteSchedule(host: HostCall, slug: string, id: string): Promise<void> {
  await host.call('scheduleDelete', { slug, id });
}

export async function loadScheduleHistory(
  host: HostCall,
  slug: string,
  id: string,
): Promise<BotScheduleFiring[]> {
  return list(await host.call('scheduleHistory', { slug, id }), 'firings', 'scheduleHistory').map(
    parseScheduleFiring,
  );
}

export async function runScheduleNow(
  host: HostCall,
  slug: string,
  id: string,
): Promise<BotScheduleFiring> {
  return parseScheduleFiring(record(await host.call('scheduleRunNow', { slug, id }))?.['firing']);
}

export async function previewSchedule(
  host: HostCall,
  trigger: BotScheduleTrigger,
): Promise<string[]> {
  const occurrences = list(
    await host.call('schedulePreview', { trigger }),
    'occurrences',
    'schedulePreview',
  );
  if (!occurrences.every(text))
    throw new HostAnswerInvalid('schedulePreview returned an unreadable time.');
  return occurrences;
}
