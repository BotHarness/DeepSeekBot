import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

export function turnStopText(
  stop: NonNullable<ChannelMessage['turnStop']>,
  t: BotHarnessTranslate,
): string {
  if (stop.cause === 'failures')
    return t('turn.stoppedFailures', { name: stop.botName, count: stop.failures ?? 0 });
  return t(stop.held ? 'turn.stoppedHeld' : 'turn.stopped', {
    human: stop.humanName,
    name: stop.botName,
  });
}
