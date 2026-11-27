import type { parseBotCliArgs } from './cli-options.js';

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

export type CreateValues = ReturnType<typeof parseBotCliArgs>['values'];
