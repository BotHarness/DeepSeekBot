import { ClientError } from './instance-contract';
export type CloudChannel = {
  organizationId?: string | undefined;
  organizationName?: string | undefined;
  channelId: string;
  name: string;
  creatorId: string;
  creatorType: 'human' | 'agent';
  createdAt: string;
};
export type CloudMessage = {
  sequence: number;
  authorId: string;
  authorType: 'human' | 'agent';
  text: string;
  createdAt: string;
  operationId: string;
};
export type PendingChannelAction = {
  kind: 'channel.create' | 'message.send' | 'guest.send';
  organizationId: string;
  userId: string;
  channelId?: string | undefined;
  value: string;
  operation: string;
};
const invalid = (): never => {
  throw new ClientError('INVALID_RESPONSE');
};
function row(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Record<string, unknown>;
}
export const validChannelId = (value: unknown): value is string =>
  typeof value === 'string' && /^ch_[a-f0-9]{64}$/.test(value);
export function parseChannel(value: unknown): CloudChannel {
  const v = row(value);
  if (
    (v.organizationName !== undefined &&
      (typeof v.organizationName !== 'string' ||
        !v.organizationName ||
        v.organizationName.length > 120)) ||
    !validChannelId(v.channelId) ||
    typeof v.name !== 'string' ||
    !v.name ||
    v.name.length > 80 ||
    typeof v.creatorId !== 'string' ||
    !['human', 'agent'].includes(String(v.creatorType)) ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt))
  )
    return invalid();
  return v as CloudChannel;
}
export function parseMessage(value: unknown): CloudMessage {
  const v = row(value);
  if (
    !Number.isSafeInteger(v.sequence) ||
    Number(v.sequence) < 1 ||
    typeof v.authorId !== 'string' ||
    !['human', 'agent'].includes(String(v.authorType)) ||
    typeof v.text !== 'string' ||
    v.text.length > 4000 ||
    typeof v.operationId !== 'string' ||
    typeof v.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(v.createdAt))
  )
    return invalid();
  return v as CloudMessage;
}
export function parsePendingChannelAction(value: unknown): PendingChannelAction | undefined {
  if (value === undefined) return undefined;
  const v = row(value);
  if (
    !['channel.create', 'message.send', 'guest.send'].includes(String(v.kind)) ||
    typeof v.organizationId !== 'string' ||
    !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
    typeof v.userId !== 'string' ||
    !v.userId.startsWith('user_') ||
    typeof v.value !== 'string' ||
    !v.value.trim() ||
    v.value.length > (v.kind === 'channel.create' ? 80 : 4000) ||
    typeof v.operation !== 'string' ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(v.operation) ||
    (v.kind !== 'channel.create' ? !validChannelId(v.channelId) : v.channelId !== undefined)
  )
    return invalid();
  return v as PendingChannelAction;
}
