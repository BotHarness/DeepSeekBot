import { sessionMaintenanceFor } from '../../../../packages/client/src/shared/session-maintenance';
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

export function createFailureMaintenance(
  client: { call(method: string, args: Record<string, unknown>): Promise<unknown> },
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
