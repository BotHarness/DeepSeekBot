import { isMessagingPlatform, type MessagingPlatformId } from '../messaging/platforms/index.js';

export interface ToolApprovalActor {
  platform: MessagingPlatformId;
  bindingId: string;
  fingerprint: string;
  actorId: string;
  pairingId: string;
  pairingRevision: number;
  conversationId: string;
  messageId: string;
}

export function parseToolApprovalActor(value: unknown): ToolApprovalActor | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const actor = value as Record<string, unknown>;
  const fields = [
    'bindingId',
    'fingerprint',
    'actorId',
    'pairingId',
    'conversationId',
    'messageId',
  ] as const;
  if (
    !isMessagingPlatform(actor['platform']) ||
    fields.some(
      (field) =>
        typeof actor[field] !== 'string' || actor[field].length === 0 || actor[field].length > 512,
    ) ||
    !Number.isSafeInteger(actor['pairingRevision']) ||
    (actor['pairingRevision'] as number) < 1 ||
    !/^[a-f0-9]{64}$/.test(actor['fingerprint'] as string)
  )
    return undefined;
  return {
    platform: actor['platform'],
    bindingId: actor['bindingId'] as string,
    fingerprint: actor['fingerprint'] as string,
    actorId: actor['actorId'] as string,
    pairingId: actor['pairingId'] as string,
    pairingRevision: actor['pairingRevision'] as number,
    conversationId: actor['conversationId'] as string,
    messageId: actor['messageId'] as string,
  };
}
