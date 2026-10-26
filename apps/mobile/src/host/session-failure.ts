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

export async function maintainSessionFailure(
  client: { call(method: string, args: Record<string, unknown>): Promise<unknown> },
  channelId: string,
  failure: SessionFailure,
  action: 'compact' | 'new-session',
): Promise<'new' | 'compacted' | 'nothing'> {
  if (failure.role !== 'orchestrator' || !channelId.startsWith('dm-') || channelId.length === 3)
    throw new Error('Session maintenance is only available in a Bot DM');
  const slug = channelId.slice(3);
  if (action === 'new-session') {
    await client.call('botNewSession', { slug });
    return 'new';
  }
  const result = await client.call('botCompact', { slug });
  if (
    result &&
    typeof result === 'object' &&
    'outcome' in result &&
    (result.outcome === 'compacted' || result.outcome === 'nothing')
  )
    return result.outcome;
  throw new Error('Compaction did not finish');
}
