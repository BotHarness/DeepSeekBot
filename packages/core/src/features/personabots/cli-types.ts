import type { parseBotCliArgs } from '../../bots/cli-options.js';

export interface BotCreateCliIo {
  env: NodeJS.ProcessEnv;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  readStdin?: () => Promise<string>;
}

export interface BotCreateStep {
  name: string;
  status: 'ok' | 'deferred';
  code?: string;
  detail?: string;
}

export interface BotCreateResult {
  bot: { id: string; name: string };
  dm: { channelId: string };
  dataDir: string;
  steps: BotCreateStep[];
  next: string[];
  httpsFallback?: { from: string; to: string; reason: string };
  operation?: import('../../bots/creation.js').BotCreationReceipt;
}

export interface BotCreateFailure {
  error: { code: string; message: string };
  steps?: BotCreateStep[];
  bot?: { id: string; name: string };
}

export type CreateValues = ReturnType<typeof parseBotCliArgs>['values'];
