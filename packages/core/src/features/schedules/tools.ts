import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import {
  BOT_SCHEDULE_ENABLED_LIMIT,
  BotScheduleError,
  relativeBotScheduleTrigger,
  type BotScheduleTrigger,
} from '../../schedules/bot-schedules.js';
import type { bindScheduleCommands } from './events.js';

const NATIVE_SCHEDULE_TOOLS = new Set([
  'schedule_create',
  'schedule_list',
  'schedule_update',
  'schedule_delete',
]);

export function nativeScheduleToolRefusal(name: string): string | undefined {
  return NATIVE_SCHEDULE_TOOLS.has(name)
    ? `${name} is not available to a PersonaBot Orchestrator: use bot_schedule_list, bot_schedule_create, bot_schedule_update or bot_schedule_delete so the schedule appears in the Channel sidebar and wakes you through the Bot Inbox.`
    : undefined;
}

export function registerScheduleTools(
  currentRun: () => { schedules?: ReturnType<typeof bindScheduleCommands> } | undefined,
  registerTool: (tool: ToolDefinition) => unknown,
): void {
  const scheduleRun = (tool: string) => {
    const active = currentRun();
    if (active === undefined || active.schedules === undefined)
      throw new Error(`${tool}: Orchestrator run is unavailable`);
    return active.schedules;
  };
  const scheduleResult = (work: () => unknown): string => {
    try {
      return JSON.stringify(work());
    } catch (error) {
      if (error instanceof BotScheduleError)
        return JSON.stringify({ error: { code: error.code, message: error.message } });
      throw error;
    }
  };
  const scheduleTriggerArgs = {
    once_in_minutes: {
      type: 'integer',
      description:
        'Run once N minutes from now; needs the Human’s time_zone. Preferred for relative reminders.',
    },
    every_minutes: {
      type: 'integer',
      description: 'Repeat every N minutes (60 = hourly).',
    },
    daily_time: {
      type: 'string',
      description: 'Local HH:MM, daily; weekly with weekdays.',
    },
    weekdays: {
      type: 'array',
      items: { type: 'integer' },
      description: 'ISO weekdays, Monday 1 to Sunday 7; needs daily_time.',
    },
    once_at: {
      type: 'string',
      description: 'Run once at local YYYY-MM-DD HH:MM.',
    },
    cron: {
      type: 'string',
      description: 'Five-field cron; only when the other forms cannot express the cadence.',
    },
    time_zone: {
      type: 'string',
      description: "IANA time zone; required with once_in_minutes, otherwise the Host's.",
    },
  } as const;
  const scheduleTriggerOf = (
    args: {
      every_minutes?: number;
      once_in_minutes?: number;
      daily_time?: string;
      weekdays?: number[];
      once_at?: string;
      cron?: string;
      time_zone?: string;
    },
    required: boolean,
  ): BotScheduleTrigger | undefined => {
    const given = [
      args.every_minutes,
      args.daily_time,
      args.once_at,
      args.once_in_minutes,
      args.cron,
    ].filter((value) => value !== undefined).length;
    if (given > 1)
      throw new BotScheduleError(
        'invalid-input',
        'Pass only one of every_minutes, daily_time, once_at, once_in_minutes or cron',
      );
    if (args.weekdays !== undefined && args.daily_time === undefined)
      throw new BotScheduleError('invalid-input', 'weekdays needs daily_time');
    if (args.once_in_minutes !== undefined) {
      if (args.time_zone === undefined)
        throw new BotScheduleError('invalid-input', 'once_in_minutes needs time_zone');
      return relativeBotScheduleTrigger(args.once_in_minutes, args.time_zone);
    }
    const timeZone = args.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (args.every_minutes !== undefined) {
      if (!Number.isInteger(args.every_minutes) || args.every_minutes < 1)
        throw new BotScheduleError(
          'invalid-input',
          'every_minutes must be a whole number of at least 1',
        );
      return { kind: 'every', everySeconds: args.every_minutes * 60 };
    }
    if (args.daily_time !== undefined)
      return args.weekdays === undefined
        ? { kind: 'daily', time: args.daily_time, timeZone }
        : { kind: 'weekly', time: args.daily_time, timeZone, weekdays: args.weekdays };
    if (args.once_at !== undefined) {
      const match = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/u.exec(args.once_at.trim());
      if (match === null)
        throw new BotScheduleError('invalid-input', 'once_at must look like YYYY-MM-DD HH:MM');
      return { kind: 'once', date: match[1]!, time: match[2]!, timeZone };
    }
    if (args.cron !== undefined) return { kind: 'cron', expression: args.cron, timeZone };
    if (args.time_zone !== undefined)
      throw new BotScheduleError(
        'invalid-input',
        'time_zone needs daily_time, once_at, once_in_minutes or cron',
      );
    if (required)
      throw new BotScheduleError(
        'invalid-input',
        'Pass one of every_minutes, daily_time, once_at, once_in_minutes or cron',
      );
    return undefined;
  };
  registerTool(
    defineTool({
      name: 'bot_schedule_list',
      description: `List your Bot Schedules with currentTime (ISO UTC). Locked ones are read-only. At most ${BOT_SCHEDULE_ENABLED_LIMIT} can be enabled.`,
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async () => {
        const schedules = scheduleRun('bot_schedule_list');
        return scheduleResult(() => ({
          schedules: schedules.list(),
          currentTime: new Date().toISOString(),
          enabledLimit: BOT_SCHEDULE_ENABLED_LIMIT,
        }));
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'bot_schedule_create',
      description: `Create a one-time or recurring Bot Schedule for a reminder or task the Human asks for; each firing wakes you through your Inbox. Pass exactly one cadence. Fails with limit-reached at ${BOT_SCHEDULE_ENABLED_LIMIT} enabled schedules.`,
      parameters: {
        title: {
          type: 'string',
          required: true,
          description: 'Short name, at most 120 characters.',
        },
        prompt: {
          type: 'string',
          required: true,
          description: 'Instruction to yourself for each firing, at most 4000 characters.',
        },
        ...scheduleTriggerArgs,
        enabled: { type: 'boolean', description: 'Defaults to true.' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const schedules = scheduleRun('bot_schedule_create');
        return scheduleResult(() => {
          const trigger = scheduleTriggerOf(args, true);
          if (trigger === undefined)
            throw new BotScheduleError(
              'invalid-input',
              'Pass one of every_minutes, daily_time, once_at, once_in_minutes or cron',
            );
          return schedules.create({
            title: args.title,
            prompt: args.prompt,
            trigger,
            ...(args.enabled === undefined ? {} : { enabled: args.enabled }),
          });
        });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'bot_schedule_update',
      description:
        'Change a Bot Schedule; pass only the fields to change (enabled false pauses it). Error locked means the Human locked it: tell them, do not retry.',
      parameters: {
        id: {
          type: 'string',
          required: true,
          description: 'Schedule id from bot_schedule_list.',
        },
        title: { type: 'string' },
        prompt: { type: 'string' },
        ...scheduleTriggerArgs,
        enabled: { type: 'boolean' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const schedules = scheduleRun('bot_schedule_update');
        return scheduleResult(() => {
          const trigger = scheduleTriggerOf(args, false);
          return schedules.update(args.id, {
            ...(args.title === undefined ? {} : { title: args.title }),
            ...(args.prompt === undefined ? {} : { prompt: args.prompt }),
            ...(trigger === undefined ? {} : { trigger }),
            ...(args.enabled === undefined ? {} : { enabled: args.enabled }),
          });
        });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'bot_schedule_delete',
      description: 'Delete a Bot Schedule and its history. Error locked means the Human locked it.',
      parameters: {
        id: {
          type: 'string',
          required: true,
          description: 'Schedule id from bot_schedule_list.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const schedules = scheduleRun('bot_schedule_delete');
        return scheduleResult(() => ({ id: args.id, deleted: schedules.remove(args.id) }));
      },
    }),
  );
}
