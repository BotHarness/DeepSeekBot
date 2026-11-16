import { HarnessError } from '@deepseek-ai/dsh-llm';

export class TeamError extends HarnessError {
  constructor(
    code: string,
    readonly retryAfterSeconds?: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code, code);
  }
}
