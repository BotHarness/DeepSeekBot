import type { BotCreateStep } from '../kernel/cli-io.js';
export type { BotCreateCliIo, BotCreateStep, CreateValues } from '../kernel/cli-io.js';

export interface BotCreateResult {
  bot: { id: string; name: string };
  dm: { channelId: string };
  dataDir: string;
  steps: BotCreateStep[];
  next: string[];
  httpsFallback?: { from: string; to: string; reason: string };
  operation?: import('../bots/creation.js').BotCreationReceipt;
}

export interface BotCreateFailure {
  error: { code: string; message: string };
  steps?: BotCreateStep[];
  bot?: { id: string; name: string };
}
