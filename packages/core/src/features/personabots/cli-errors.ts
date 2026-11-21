import type { BotCreateStep } from './cli-types.js';

export class CliFailure extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly steps: BotCreateStep[];
  readonly bot: { id: string; name: string } | undefined;

  constructor(
    code: string,
    message: string,
    exitCode: number,
    steps: BotCreateStep[] = [],
    bot?: { id: string; name: string },
  ) {
    super(message);
    this.name = 'CliFailure';
    this.code = code;
    this.exitCode = exitCode;
    this.steps = steps;
    this.bot = bot;
  }
}

export function usageError(message: string): CliFailure {
  return new CliFailure('usage', `${message} Run tobs create --help for usage.`, 2);
}
