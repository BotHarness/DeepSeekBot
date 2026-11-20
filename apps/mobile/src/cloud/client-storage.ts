import { parsePendingWork, type PendingWork } from './work-contract';
import { parseAgentHandoff, type AgentHandoff } from './agent-contract';
import { parsePendingInvitation, type PendingInvitation } from './invitation-contract';
import { parsePendingChannelAction, type PendingChannelAction } from './channel-contract';
import { parseInstance, type InstanceConfig } from './instance-contract';
import { record, fail } from './client-transport';
import { tokenPair } from './client-auth';

export type Identity = { userId: string; instanceId: string; instanceRole: 'admin' | 'user' };
export type Session = {
  accessToken: string;
  refreshToken: string;
  userId?: string | undefined;
  organizationId?: string | undefined;
};
export type Organization = {
  organizationId: string;
  name: string;
  description: string;
  version: number;
  role: 'owner' | 'member';
};
export type Entry = {
  agentHandoff?: AgentHandoff | undefined;
  config: InstanceConfig;
  session?: Session;
  pendingCreate?: { name: string; operation: string } | undefined;
  pendingChannelAction?: PendingChannelAction | undefined;
  pendingInvitation?: PendingInvitation | undefined;
  pendingWork?: PendingWork | undefined;
};
export type Vault = { version: 1; entries: Entry[] };
export type CloudRow = {
  agentHandoff?: Omit<AgentHandoff, 'secret'> | undefined;
  config: InstanceConfig;
  hasSession: boolean;
  sessionUserId?: string | undefined;
  identity?: Identity | undefined;
  organization?: Organization | undefined;
  pendingCreate?: { name: string; operation: string } | undefined;
  pendingChannelAction?: PendingChannelAction | undefined;
  pendingInvitation?: PendingInvitation | undefined;
  pendingWork?: PendingWork | undefined;
};
export type CloudSnapshot = {
  ready: boolean;
  busy: boolean;
  rows: CloudRow[];
  error?: string | undefined;
};

export function decodeVault(raw: string): Vault {
  const v = record(JSON.parse(raw));
  if (v.version !== 1 || !Array.isArray(v.entries) || v.entries.length > 20)
    fail('INVALID_LOCAL_STATE');
  const entries = (v.entries as unknown[]).map((value) => {
    const e = record(value),
      config = parseInstance(e.config);
    let pendingCreate: Entry['pendingCreate'];
    if (e.pendingCreate !== undefined) {
      const pending = record(e.pendingCreate);
      if (
        typeof pending.name !== 'string' ||
        pending.name.length > 80 ||
        typeof pending.operation !== 'string' ||
        !/^[A-Za-z0-9_-]{16,100}$/.test(pending.operation)
      )
        fail('INVALID_LOCAL_STATE');
      pendingCreate = {
        name: pending.name as string,
        operation: pending.operation as string,
      };
    }
    if (e.session === undefined) return { config, pendingCreate };
    const saved = record(e.session);
    const session = tokenPair({
      access_token: saved.accessToken,
      refresh_token: saved.refreshToken,
    });
    if (
      saved.userId !== undefined &&
      (typeof saved.userId !== 'string' || !saved.userId.startsWith('user_'))
    )
      fail('INVALID_LOCAL_STATE');
    if (
      saved.organizationId !== undefined &&
      (typeof saved.organizationId !== 'string' || !/^org_[A-Za-z0-9]+$/.test(saved.organizationId))
    )
      fail('INVALID_LOCAL_STATE');
    return {
      config,
      pendingCreate,
      pendingChannelAction: parsePendingChannelAction(e.pendingChannelAction),
      pendingInvitation: parsePendingInvitation(e.pendingInvitation),
      pendingWork: parsePendingWork(e.pendingWork),
      agentHandoff: parseAgentHandoff(e.agentHandoff),
      session: {
        ...session,
        userId: saved.userId as string | undefined,
        organizationId: saved.organizationId as string | undefined,
      },
    };
  });
  if (
    new Set(entries.map((e) => e.config.instanceId)).size !== entries.length ||
    new Set(entries.map((e) => e.config.server)).size !== entries.length
  )
    fail('INVALID_LOCAL_STATE');
  return { version: 1, entries };
}

export function cloudRows(
  vault: Vault,
  identities: ReadonlyMap<string, Identity>,
  organizations: ReadonlyMap<string, Organization>,
): CloudRow[] {
  return vault.entries.map((e) => ({
    config: e.config,
    hasSession: !!e.session,
    sessionUserId: e.session?.userId,
    pendingCreate: e.pendingCreate,
    pendingChannelAction: e.pendingChannelAction,
    pendingInvitation: e.pendingInvitation,
    pendingWork: e.pendingWork,
    agentHandoff: e.agentHandoff
      ? {
          actorId: e.agentHandoff.actorId,
          organizationId: e.agentHandoff.organizationId,
          channelId: e.agentHandoff.channelId,
          ownerUserId: e.agentHandoff.ownerUserId,
          name: e.agentHandoff.name,
          operationId: e.agentHandoff.operationId,
          ready: e.agentHandoff.ready,
        }
      : undefined,
    identity: identities.get(e.config.instanceId),
    organization: organizations.get(e.config.instanceId),
  }));
}
