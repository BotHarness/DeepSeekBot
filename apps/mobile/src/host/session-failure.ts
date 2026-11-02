import { sessionMaintenanceFor } from '../../../../packages/client/src/shared/session-maintenance';
import {
  parseFailureAutoContinue,
  parseFailureProgress,
  turnContinuationFor,
  type SessionFailureAutoContinue,
  type SessionFailureProgress,
} from '../../../../packages/client/src/shared/turn-continuation';
export { latestTurnMessageId } from '../../../../packages/core/src/channels/channel-notice';
export interface SessionFailure {
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  detail: string;
  requestMessageId?: string;
  code?: string;
  progress?: SessionFailureProgress;
  autoContinue?: SessionFailureAutoContinue;
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
    ...withParsed(
      'progress',
      parseFailureProgress('progress' in value ? value.progress : undefined),
    ),
    ...withParsed(
      'autoContinue',
      parseFailureAutoContinue('autoContinue' in value ? value.autoContinue : undefined),
    ),
  };
}

function withParsed<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
}

export function createFailureContinuation(
  client: {
    call(method: string, args: Record<string, unknown>): Promise<unknown>;
  },
  channelId: string,
  failureMessageId: string,
  failure: SessionFailure,
) {
  const slug = channelId.startsWith('dm-') ? channelId.slice(3) : undefined;
  return turnContinuationFor(
    client,
    {
      channelId,
      failureMessageId,
      botSlug: slug,
      role: failure.role,
      requestMessageId: failure.requestMessageId,
    },
    {
      continueTurn: (channel, messageId, failureId) =>
        client.call('channelRetry', {
          channelId: channel,
          messageId,
          recovery: 'continue',
          failureMessageId: failureId,
        }),
      cancelAuto: (channel, botSlug, messageId) =>
        client.call('channelBotStop', {
          channelId: channel,
          botSlug,
          autoContinueFor: messageId,
        }),
    },
  );
}

export function createFailureMaintenance(
  client: {
    call(method: string, args: Record<string, unknown>): Promise<unknown>;
  },
  channelId: string,
  failure: SessionFailure,
) {
  const slug =
    failure.role === 'orchestrator' && channelId.startsWith('dm-') ? channelId.slice(3) : undefined;
  return sessionMaintenanceFor(client, channelId, slug, {
    compact: (slug) => client.call('botCompact', { slug }),
    newSession: (slug) => client.call('botNewSession', { slug }),
  });
}
