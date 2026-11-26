import { HarnessError } from '@deepseek-ai/dsh-llm';

export class BotNetworkDeliveryError extends HarnessError {
  constructor(override readonly code: 'unable-to-deliver' | 'delivery-unknown' | 'network-denied') {
    super(code, code);
    this.name = 'BotNetworkDeliveryError';
  }
}
