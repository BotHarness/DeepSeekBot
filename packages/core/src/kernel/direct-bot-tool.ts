import { HarnessError } from '@deepseek-ai/dsh-llm';

export class DirectBotToolError extends HarnessError {
  constructor(code: string, message: string) {
    super(message, code);
    this.name = 'DirectBotToolError';
  }
}
