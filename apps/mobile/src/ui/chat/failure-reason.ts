import type { SessionFailure } from '@botharness/host-client/session-failure';
import { t } from '../strings';

export function failureReason(failure: Pick<SessionFailure, 'code'>): string {
  const code = failure.code;
  if (code === undefined) return t.sessionRecovery.details;
  const refusal = t.sessionRecovery.refused[code];
  if (refusal !== undefined) return refusal[0];
  if (code === 'CONTEXT_WINDOW_EXCEEDED') return t.sessionRecovery.contextFull;
  if (code === 'OUTPUT_TOKEN_LIMIT') return t.sessionRecovery.outputLimit;
  return t.sessionRecovery.reasons[code] ?? t.sessionRecovery.details;
}
