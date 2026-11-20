import { normalizePersonaBotActivity, type PersonaBotActivityState } from './avatar.js';
import type { BotSummary, ClientState } from './store.js';

export function personaBotActivity(
  _state: Partial<Pick<ClientState, 'selection' | 'conversation'>>,
  bot: Pick<BotSummary, 'slug' | 'aggregateState'>,
): PersonaBotActivityState {
  return normalizePersonaBotActivity(bot.aggregateState);
}
