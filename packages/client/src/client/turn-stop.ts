import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';
import { engineName, shortTime } from './session-engine.js';

export function turnStopText(
  stop: NonNullable<ChannelMessage['turnStop']>,
  t: BotHarnessTranslate,
): string {
  if (stop.cause === 'quota' && stop.engine !== undefined)
    return t('turn.stoppedEngineLimit', {
      name: stop.botName,
      engine: engineName(stop.engine.engine),
      account: stop.engine.account,
      until: shortTime(stop.engine.until),
    });
  const rest = stop.cause === 'quota' ? stop.rests?.[0] : undefined;
  if (rest !== undefined)
    return t('turn.stoppedQuota', {
      name: stop.botName,
      route: `${rest.provider}/${rest.model}`,
      until: shortTime(rest.until),
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
