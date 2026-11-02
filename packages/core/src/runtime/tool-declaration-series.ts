import type { PreStepDecision } from '@deepseek-ai/dsh-agent';
import type { Session } from '@deepseek-ai/dsh-session';

export function restartEmptyToolSeries(
  session: Partial<Pick<Session, 'toolHistory'>>,
  decision: PreStepDecision,
): PreStepDecision {
  if (
    decision.kind !== 'enter' ||
    decision.startsRequestSeries ||
    typeof session.toolHistory !== 'function' ||
    session.toolHistory().tools.length !== 0
  )
    return decision;
  return { ...decision, startsRequestSeries: true };
}
