import {
  loadBotSourcePolicies,
  loadBotSchedules,
  createBotSchedule,
  updateBotSchedule,
  deleteBotSchedule,
  loadBotScheduleHistory,
  runBotScheduleNow,
  previewBotSchedule,
  type BotSourcePolicyEdit,
  setBotSourcePolicy,
  resetBotSourcePolicy,
  type BridgeCall,
  type BotSourcePolicyView,
  type BotScheduleView,
  type BotScheduleChange,
  type BotScheduleFiringView,
  type BotScheduleInput,
  type BotScheduleTrigger,
} from './bridge.js';

export interface TriggerActions {
  botSourcePolicies(slug: string): Promise<BotSourcePolicyView[]>;
  botSchedules(slug: string): Promise<BotScheduleView[]>;
  createBotSchedule(slug: string, input: BotScheduleInput): Promise<BotScheduleView>;
  updateBotSchedule(slug: string, id: string, change: BotScheduleChange): Promise<BotScheduleView>;
  deleteBotSchedule(slug: string, id: string): Promise<void>;
  botScheduleHistory(slug: string, id: string): Promise<BotScheduleFiringView[]>;
  runBotScheduleNow(slug: string, id: string): Promise<BotScheduleFiringView>;
  botSchedulePreview(trigger: BotScheduleTrigger): Promise<string[]>;
  setBotSourcePolicy(slug: string, edit: BotSourcePolicyEdit): Promise<void>;
  resetBotSourcePolicy(
    slug: string,
    sourceClass: BotSourcePolicyEdit['sourceClass'],
  ): Promise<void>;
}

export function createTriggerActions(call: BridgeCall) {
  return {
    botSourcePolicies: (slug) => loadBotSourcePolicies(call, slug),
    botSchedules: (slug) => loadBotSchedules(call, slug),
    createBotSchedule: (slug, input) => createBotSchedule(call, slug, input),
    updateBotSchedule: (slug, id, change) => updateBotSchedule(call, slug, id, change),
    deleteBotSchedule: (slug, id) => deleteBotSchedule(call, slug, id),
    botScheduleHistory: (slug, id) => loadBotScheduleHistory(call, slug, id),
    runBotScheduleNow: (slug, id) => runBotScheduleNow(call, slug, id),
    botSchedulePreview: (trigger) => previewBotSchedule(call, trigger),
    setBotSourcePolicy: (slug, edit) => setBotSourcePolicy(call, slug, edit),
    resetBotSourcePolicy: (slug, sourceClass) => resetBotSourcePolicy(call, slug, sourceClass),
  } satisfies TriggerActions;
}
