import { ClientError } from './instance-contract';
import { validChannelId } from './channel-contract';
export type CloudAgent = {
  actorId: string;
  kind: 'agent';
  name: string;
  ownerUserId: string;
  state: 'active' | 'revoked' | 'expired';
  historyAfter: number;
  expiresAt: string;
};
export type AgentHandoff = {
  actorId: string;
  organizationId: string;
  channelId: string;
  ownerUserId: string;
  name: string;
  operationId: string;
  secret: string;
  ready: boolean;
};
export const validAgentId = (v: unknown): v is string =>
  typeof v === 'string' && /^ag_[a-f0-9]{64}$/.test(v);
function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClientError('INVALID_AGENT_RESPONSE');
  return value as Record<string, unknown>;
}
export function parseAgent(value: unknown): CloudAgent {
  const v = record(value);
  if (
    !validAgentId(v.actorId) ||
    v.kind !== 'agent' ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 80 ||
    typeof v.ownerUserId !== 'string' ||
    !/^user_[A-Za-z0-9]+$/.test(v.ownerUserId) ||
    !['active', 'revoked', 'expired'].includes(String(v.state)) ||
    !Number.isSafeInteger(v.historyAfter) ||
    Number(v.historyAfter) < 0 ||
    typeof v.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    !Array.isArray(v.scopes) ||
    v.scopes.length !== 2 ||
    v.scopes[0] !== 'messages:read' ||
    v.scopes[1] !== 'messages:send'
  )
    throw new ClientError('INVALID_AGENT_RESPONSE');
  return {
    actorId: v.actorId,
    kind: 'agent',
    name: v.name,
    ownerUserId: v.ownerUserId,
    state: v.state as CloudAgent['state'],
    historyAfter: v.historyAfter as number,
    expiresAt: v.expiresAt,
  };
}
export function parseAgentHandoff(value: unknown): AgentHandoff | undefined {
  if (value === undefined) return undefined;
  const v = record(value);
  if (
    !validAgentId(v.actorId) ||
    !validChannelId(v.channelId) ||
    typeof v.organizationId !== 'string' ||
    !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
    typeof v.ownerUserId !== 'string' ||
    !/^user_[A-Za-z0-9]+$/.test(v.ownerUserId) ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 80 ||
    typeof v.operationId !== 'string' ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(v.operationId) ||
    typeof v.secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.secret) ||
    typeof v.ready !== 'boolean'
  )
    throw new ClientError('INVALID_LOCAL_STATE');
  return v as AgentHandoff;
}
