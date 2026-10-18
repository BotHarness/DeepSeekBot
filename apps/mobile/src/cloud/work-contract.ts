import { ClientError } from './instance-contract';
import { validAgentId } from './agent-contract';
import { validChannelId } from './channel-contract';
export type PendingWork = {
  organizationId: string;
  channelId: string;
  userId: string;
  targetActorId: string;
  expiresAt: string;
  operation: string;
};
export function parsePendingWork(value: unknown): PendingWork | undefined {
  if (value === undefined) return undefined;
  const v = value as PendingWork;
  if (
    !v ||
    !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
    !validChannelId(v.channelId) ||
    !/^user_[A-Za-z0-9]+$/.test(v.userId) ||
    !validAgentId(v.targetActorId) ||
    typeof v.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    new Date(v.expiresAt).toISOString() !== v.expiresAt ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(v.operation)
  )
    throw new ClientError('INVALID_LOCAL_STATE');
  return v;
}
