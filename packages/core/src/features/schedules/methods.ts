import {
  asObject,
  asSlug,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { HumanContext } from '../../humans/context.js';
import {
  BotScheduleError,
  previewBotScheduleTrigger,
  type BotSchedule,
  type BotScheduleChange,
  type BotScheduleFiring,
  type BotScheduleStore,
  type BotScheduleTrigger,
} from '../../schedules/bot-schedules.js';

export interface SchedulesBridgeDeps {
  schedules?: BotScheduleStore;
}

export interface SchedulesBridgeMethods {
  scheduleList(payload: unknown): BridgeResult<{ schedules: BotSchedule[] }>;
  scheduleCreate(payload: unknown): BridgeResult<{ schedule: BotSchedule }>;
  scheduleUpdate(payload: unknown): BridgeResult<{ schedule: BotSchedule }>;
  scheduleDelete(payload: unknown): BridgeResult<{ removed: boolean }>;
  scheduleHistory(payload: unknown): BridgeResult<{ firings: BotScheduleFiring[] }>;
  scheduleRunNow(payload: unknown): BridgeResult<{ firing: BotScheduleFiring }>;
  schedulePreview(payload: unknown): BridgeResult<{ occurrences: string[] }>;
}

function parseScheduleTrigger(value: unknown): BotScheduleTrigger | undefined {
  const source = asObject(value);
  const time = source['time'];
  const timeZone = source['timeZone'];
  if (source['kind'] === 'every' && Number.isSafeInteger(source['everySeconds']))
    return { kind: 'every', everySeconds: source['everySeconds'] as number };
  if (typeof timeZone !== 'string') return undefined;
  if (source['kind'] === 'cron' && typeof source['expression'] === 'string')
    return { kind: 'cron', expression: source['expression'], timeZone };
  if (typeof time !== 'string') return undefined;
  if (source['kind'] === 'daily') return { kind: 'daily', time, timeZone };
  const weekdays = source['weekdays'];
  if (
    source['kind'] === 'weekly' &&
    Array.isArray(weekdays) &&
    weekdays.every((day) => Number.isSafeInteger(day))
  )
    return { kind: 'weekly', time, timeZone, weekdays: weekdays as number[] };
  if (source['kind'] === 'once' && typeof source['date'] === 'string')
    return { kind: 'once', date: source['date'], time, timeZone };
  return undefined;
}

function scheduleFailure(error: unknown): BridgeResult<never> {
  if (error instanceof BotScheduleError)
    return { ok: false, error: { code: error.code, message: error.message } };
  return invalidInput(String(error));
}

export function createSchedulesBridgeMethods(
  human: HumanContext,
  deps: SchedulesBridgeDeps & { registry: Pick<PersonaBotRegistry, 'get'> },
): SchedulesBridgeMethods {
  return {
    scheduleList(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.schedules === undefined) return invalidInput('Bot Schedules are unavailable');
      try {
        return { ok: true, value: { schedules: deps.schedules.list(slug) } };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
    scheduleCreate(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.schedules === undefined) return invalidInput('Bot Schedules are unavailable');
      const trigger = parseScheduleTrigger(source['trigger']);
      if (
        typeof source['title'] !== 'string' ||
        typeof source['prompt'] !== 'string' ||
        trigger === undefined ||
        (source['enabled'] !== undefined && typeof source['enabled'] !== 'boolean') ||
        (source['locked'] !== undefined && typeof source['locked'] !== 'boolean')
      )
        return invalidInput('title, prompt and a valid trigger are required');
      try {
        return {
          ok: true,
          value: {
            schedule: deps.schedules.create(
              slug,
              {
                title: source['title'],
                prompt: source['prompt'],
                trigger,
                ...(source['enabled'] === undefined
                  ? {}
                  : { enabled: source['enabled'] as boolean }),
                ...(source['locked'] === undefined ? {} : { locked: source['locked'] as boolean }),
              },
              'human',
              human.humanId,
            ),
          },
        };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
    scheduleUpdate(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const id = source['id'];
      if (slug === undefined || typeof id !== 'string')
        return invalidInput('slug and id are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.schedules === undefined) return invalidInput('Bot Schedules are unavailable');
      const change: BotScheduleChange = {};
      if (source['title'] !== undefined) {
        if (typeof source['title'] !== 'string') return invalidInput('title must be a string');
        change.title = source['title'];
      }
      if (source['prompt'] !== undefined) {
        if (typeof source['prompt'] !== 'string') return invalidInput('prompt must be a string');
        change.prompt = source['prompt'];
      }
      if (source['enabled'] !== undefined) {
        if (typeof source['enabled'] !== 'boolean')
          return invalidInput('enabled must be a boolean');
        change.enabled = source['enabled'];
      }
      if (source['locked'] !== undefined) {
        if (typeof source['locked'] !== 'boolean') return invalidInput('locked must be a boolean');
        change.locked = source['locked'];
      }
      if (source['trigger'] !== undefined) {
        const trigger = parseScheduleTrigger(source['trigger']);
        if (trigger === undefined)
          return invalidInput('trigger must be every, daily, weekly, once or cron');
        change.trigger = trigger;
      }
      try {
        return {
          ok: true,
          value: { schedule: deps.schedules.update(slug, id, change, 'human') },
        };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
    scheduleDelete(payload) {
      const slug = asSlug(payload);
      const id = asObject(payload)['id'];
      if (slug === undefined || typeof id !== 'string')
        return invalidInput('slug and id are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.schedules === undefined) return invalidInput('Bot Schedules are unavailable');
      try {
        return {
          ok: true,
          value: { removed: deps.schedules.remove(slug, id, 'human') },
        };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
    scheduleHistory(payload) {
      const slug = asSlug(payload);
      const id = asObject(payload)['id'];
      if (slug === undefined || typeof id !== 'string')
        return invalidInput('slug and id are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.schedules === undefined) return invalidInput('Bot Schedules are unavailable');
      try {
        return {
          ok: true,
          value: { firings: deps.schedules.history(slug, id) },
        };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
    scheduleRunNow(payload) {
      const slug = asSlug(payload);
      const id = asObject(payload)['id'];
      if (slug === undefined || typeof id !== 'string')
        return invalidInput('slug and id are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.schedules === undefined) return invalidInput('Bot Schedules are unavailable');
      try {
        return { ok: true, value: { firing: deps.schedules.runNow(slug, id) } };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
    schedulePreview(payload) {
      const trigger = parseScheduleTrigger(asObject(payload)['trigger']);
      if (trigger === undefined)
        return invalidInput('trigger must be every, daily, weekly, once or cron');
      try {
        return {
          ok: true,
          value: { occurrences: previewBotScheduleTrigger(trigger) },
        };
      } catch (error) {
        return scheduleFailure(error);
      }
    },
  };
}
