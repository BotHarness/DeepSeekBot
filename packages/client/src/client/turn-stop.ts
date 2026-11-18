import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

export function turnStopText(
  stop: NonNullable<ChannelMessage['turnStop']>,
  t: BotHarnessTranslate,
): string {
  const rest = stop.cause === 'quota' ? stop.rests?.[0] : undefined;
  if (rest !== undefined)
    return t('turn.stoppedQuota', {
      name: stop.botName,
      route: `${rest.provider}/${rest.model}`,
      until: new Date(rest.until).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    });
  if (stop.cause === 'failures')
    return t('turn.stoppedFailures', { name: stop.botName, count: stop.failures ?? 0 });
  const target = stop.target;
  if (target?.scope === 'bot')
    return t('turn.stoppedBot', { human: stop.humanName, name: stop.botName });
  if (target?.role === 'orchestrator')
    return t('turn.stoppedOrchestrator', { human: stop.humanName, name: stop.botName });
  if (target?.role === 'assignment')
    return target.title === undefined
      ? t('turn.stoppedAssignment', { human: stop.humanName, name: stop.botName })
      : t('turn.stoppedAssignmentNamed', {
          human: stop.humanName,
          name: stop.botName,
          title: target.title,
        });
  return t(stop.held ? 'turn.stoppedHeld' : 'turn.stopped', {
    human: stop.humanName,
    name: stop.botName,
  });
}
