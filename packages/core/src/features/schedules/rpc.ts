import { unwrap } from '../../bridge/rpc-result.js';
import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleFiring,
  BotScheduleInput,
  BotScheduleTrigger,
} from '../../schedules/bot-schedules.js';
import type { SchedulesBridgeMethods } from './methods.js';

export function scheduleList(
  methods: SchedulesBridgeMethods,
  slug: string,
): { schedules: BotSchedule[] } {
  return unwrap(methods.scheduleList({ slug }));
}

export function scheduleCreate(
  methods: SchedulesBridgeMethods,
  slug: string,
  input: BotScheduleInput,
): { schedule: BotSchedule } {
  return unwrap(methods.scheduleCreate({ ...input, slug }));
}

export function scheduleUpdate(
  methods: SchedulesBridgeMethods,
  slug: string,
  id: string,
  change: BotScheduleChange,
): { schedule: BotSchedule } {
  return unwrap(methods.scheduleUpdate({ ...change, slug, id }));
}

export function scheduleDelete(
  methods: SchedulesBridgeMethods,
  slug: string,
  id: string,
): { removed: boolean } {
  return unwrap(methods.scheduleDelete({ slug, id }));
}

export function scheduleHistory(
  methods: SchedulesBridgeMethods,
  slug: string,
  id: string,
): { firings: BotScheduleFiring[] } {
  return unwrap(methods.scheduleHistory({ slug, id }));
}

export function scheduleRunNow(
  methods: SchedulesBridgeMethods,
  slug: string,
  id: string,
): { firing: BotScheduleFiring } {
  return unwrap(methods.scheduleRunNow({ slug, id }));
}

export function schedulePreview(
  methods: SchedulesBridgeMethods,
  trigger: BotScheduleTrigger,
): { occurrences: string[] } {
  return unwrap(methods.schedulePreview({ trigger }));
}
