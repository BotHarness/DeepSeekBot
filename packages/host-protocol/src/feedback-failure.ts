export const FEEDBACK_RECEIVER_TIMEOUT_MS = 15_000;

export type FeedbackFailure =
  | { reason: 'network' | 'timeout' }
  | { reason: 'auth'; status: 401 | 403 }
  | { reason: 'receiver-error'; status: number };

export function parseFeedbackFailure(payload: unknown): FeedbackFailure | undefined {
  if (!payload || typeof payload !== 'object' || !('error' in payload)) return;
  const failure = payload.error;
  if (!failure || typeof failure !== 'object' || !('code' in failure)) return;
  if (failure.code !== 'feedback-failed' || !('reason' in failure)) return;
  const { reason } = failure;
  if (reason === 'network' || reason === 'timeout') return { reason };
  if (!('status' in failure)) return;
  const { status } = failure;
  if (reason === 'auth' && (status === 401 || status === 403)) return { reason, status };
  if (
    reason === 'receiver-error' &&
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= 200 &&
    status <= 599
  )
    return { reason, status };
}
