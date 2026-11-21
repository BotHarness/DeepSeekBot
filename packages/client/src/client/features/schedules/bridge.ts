import {
  createSchedule,
  deleteSchedule,
  loadScheduleHistory,
  loadSchedules,
  previewSchedule,
  runScheduleNow,
  updateSchedule,
  type BotSchedule,
  type BotScheduleChange,
  type BotScheduleFiring,
  type BotScheduleInput,
  type BotScheduleTrigger,
} from '@botharness/host-client/schedules';
import { bridgeHost, type BridgeCall } from '../../bridge-transport.js';

export async function loadBotSchedules(call: BridgeCall, slug: string): Promise<BotSchedule[]> {
  return loadSchedules(bridgeHost(call), slug);
}

export async function createBotSchedule(
  call: BridgeCall,
  slug: string,
  input: BotScheduleInput,
): Promise<BotSchedule> {
  return createSchedule(bridgeHost(call), slug, input);
}

export async function updateBotSchedule(
  call: BridgeCall,
  slug: string,
  id: string,
  change: BotScheduleChange,
): Promise<BotSchedule> {
  return updateSchedule(bridgeHost(call), slug, id, change);
}

export async function deleteBotSchedule(call: BridgeCall, slug: string, id: string): Promise<void> {
  await deleteSchedule(bridgeHost(call), slug, id);
}

export async function loadBotScheduleHistory(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<BotScheduleFiring[]> {
  return loadScheduleHistory(bridgeHost(call), slug, id);
}

export async function runBotScheduleNow(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<BotScheduleFiring> {
  return runScheduleNow(bridgeHost(call), slug, id);
}

export async function previewBotSchedule(
  call: BridgeCall,
  trigger: BotScheduleTrigger,
): Promise<string[]> {
  return previewSchedule(bridgeHost(call), trigger);
}
