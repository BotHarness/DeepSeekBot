import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
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

export const schedulesServiceRpc = {
  scheduleList(slug: string): { schedules: BotSchedule[] } {
    return scheduleList(this.methods, slug);
  },

  scheduleCreate(slug: string, input: BotScheduleInput): { schedule: BotSchedule } {
    return scheduleCreate(this.methods, slug, input);
  },

  scheduleUpdate(slug: string, id: string, change: BotScheduleChange): { schedule: BotSchedule } {
    return scheduleUpdate(this.methods, slug, id, change);
  },

  scheduleDelete(slug: string, id: string): { removed: boolean } {
    return scheduleDelete(this.methods, slug, id);
  },

  scheduleHistory(slug: string, id: string): { firings: BotScheduleFiring[] } {
    return scheduleHistory(this.methods, slug, id);
  },

  scheduleRunNow(slug: string, id: string): { firing: BotScheduleFiring } {
    return scheduleRunNow(this.methods, slug, id);
  },

  schedulePreview(trigger: BotScheduleTrigger): { occurrences: string[] } {
    return schedulePreview(this.methods, trigger);
  },
} satisfies ThisType<BridgeRpcReceiver>;
