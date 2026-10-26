import type { HostClient } from './client';

export interface SessionFailure {
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  detail: string;
  requestMessageId?: string;
  code?: string;
}

export function sessionFailure(value: unknown): SessionFailure | undefined {
  if (
    !value ||
    typeof value !== 'object' ||
    !('role' in value) ||
    (value.role !== 'orchestrator' && value.role !== 'assignment') ||
    !('sessionId' in value) ||
    typeof value.sessionId !== 'string' ||
    !value.sessionId ||
    !('detail' in value) ||
    typeof value.detail !== 'string'
  )
    return undefined;
  return {
    role: value.role,
    sessionId: value.sessionId,
    detail: value.detail,
    ...('requestMessageId' in value &&
    typeof value.requestMessageId === 'string' &&
    value.requestMessageId
      ? { requestMessageId: value.requestMessageId }
      : {}),
    ...('code' in value && typeof value.code === 'string' ? { code: value.code } : {}),
  };
}

export async function retrySessionFailure(
  client: HostClient,
  channelId: string,
  failureMessageId: string,
  failure: SessionFailure,
  recovery?: 'compact' | 'new-session',
): Promise<void> {
  if (!failure.requestMessageId) throw new Error('Original message is unavailable');
  await client.call('channelRetry', {
    channelId,
    messageId: failure.requestMessageId,
    ...(recovery ? { recovery, failureMessageId } : {}),
  });
}
