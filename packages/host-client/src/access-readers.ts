import type {
  WireAssignmentAccessPreset,
  WireGrantApprovalMessage,
  WireWorkspaceGrant,
} from '@botharness/host-protocol/wire';
import { count, HostAnswerInvalid, optional, record, text, type HostCall } from './host-answer';

function isAccessMode(value: unknown): value is WireAssignmentAccessPreset['mode'] {
  return value === 'workspace-write' || value === 'danger-full-access';
}

function accessAnswer(
  value: unknown,
  slug: string,
  method: string,
  mode?: WireAssignmentAccessPreset['mode'],
) {
  const row = record(value)?.['preset'];
  if (!isPreset(row) || row.botSlug !== slug || (mode !== undefined && row.mode !== mode))
    throw new HostAnswerInvalid(`${method} returned no access setting.`);
  return { preset: row };
}

function isPreset(value: unknown): value is WireAssignmentAccessPreset {
  const row = record(value);
  return (
    text(row?.['botSlug']) &&
    isAccessMode(row['mode']) &&
    count(row['revision']) &&
    optional(row['scope'], (scope) => scope === 'chat' || scope === 'assignments') &&
    optional(row['changedAt'], text)
  );
}

export async function readAssignmentAccess(host: HostCall, slug: string) {
  return accessAnswer(
    await host.call('assignmentAccessGet', { slug }),
    slug,
    'assignmentAccessGet',
  );
}

export async function writeAssignmentAccess(
  host: HostCall,
  args: {
    slug: string;
    mode: WireAssignmentAccessPreset['mode'];
    scope?: NonNullable<WireAssignmentAccessPreset['scope']>;
    acknowledgeRisk?: boolean;
  },
) {
  return accessAnswer(
    await host.call('assignmentAccessSet', args),
    args.slug,
    'assignmentAccessSet',
    args.mode,
  );
}

function isGrant(value: unknown): value is WireWorkspaceGrant {
  const row = record(value);
  return (
    row !== undefined &&
    ['id', 'botSlug', 'workspaceId', 'workspacePath', 'workspaceTitle', 'createdAt'].every((key) =>
      text(row[key]),
    ) &&
    optional(row['revokedAt'], text) &&
    optional(row['orchestratorWrite'], (enabled) => typeof enabled === 'boolean') &&
    optional(row['writeRevision'], count)
  );
}

export function readGrantReceipt(value: unknown, method: string, slug: string): WireWorkspaceGrant {
  const grant = record(value)?.['grant'];
  if (!isGrant(grant) || grant.botSlug !== slug)
    throw new HostAnswerInvalid(`${method} returned no grant.`);
  return grant;
}

interface GrantScope {
  channelId: string;
  path: string;
}

export async function readWorkspaceGrants(
  host: HostCall,
  args: { slug: string; scope?: GrantScope },
): Promise<{ grants: WireWorkspaceGrant[] }> {
  const grants = record(await host.call('grants', args))?.['grants'];
  if (
    !Array.isArray(grants) ||
    !grants.every(
      (row: unknown): row is WireWorkspaceGrant =>
        isGrant(row) &&
        row.botSlug === args.slug &&
        (args.scope === undefined ||
          (row.workspacePath === args.scope.path && row.revokedAt === undefined)),
    )
  )
    throw new HostAnswerInvalid('grants returned invalid grants.');
  return { grants };
}

export async function createGrant(
  host: HostCall,
  args: { slug: string; workspaceId: string; scope?: GrantScope },
): Promise<{ grant: WireWorkspaceGrant; created?: boolean }> {
  const value = record(await host.call('grantCreate', args));
  const grant = readGrantReceipt(value, 'grantCreate', args.slug);
  const created = value?.['created'];
  if (
    grant.workspaceId !== args.workspaceId ||
    grant.revokedAt !== undefined ||
    (args.scope !== undefined &&
      (grant.workspacePath !== args.scope.path || created === undefined)) ||
    (created !== undefined && typeof created !== 'boolean')
  )
    throw new HostAnswerInvalid('grantCreate returned an invalid grant receipt.');
  return { grant, ...(created === undefined ? {} : { created }) };
}

function isGrantApprovalMessage(value: unknown): value is WireGrantApprovalMessage {
  const row = record(value);
  const author = record(row?.['author']);
  const resolution = record(row?.['grantRequestResolution']);
  return (
    text(row?.['id']) &&
    text(row['at']) &&
    text(row['body']) &&
    text(row['replyTo']) &&
    author?.['kind'] === 'human' &&
    optional(author['humanId'], text) &&
    optional(author['displayName'], text) &&
    optional(author['deleted'], (deleted) => typeof deleted === 'boolean') &&
    text(resolution?.['requestMessageId']) &&
    text(resolution['grantId'])
  );
}

export async function approveGrantRequest(
  host: HostCall,
  args: { slug: string; channelId: string; requestMessageId: string; workspaceId: string },
): Promise<{ grant: WireWorkspaceGrant; message: WireGrantApprovalMessage }> {
  const value = record(
    await host.call('grantRequestApprove', { ...args, acknowledgeReadWrite: true }),
  );
  const grant = readGrantReceipt(value, 'grantRequestApprove', args.slug);
  const message = value?.['message'];
  if (
    grant.orchestratorWrite !== true ||
    grant.revokedAt !== undefined ||
    !isGrantApprovalMessage(message) ||
    message.replyTo !== args.requestMessageId ||
    message.grantRequestResolution.requestMessageId !== args.requestMessageId ||
    message.grantRequestResolution.grantId !== grant.id
  )
    throw new HostAnswerInvalid('Workspace write authorization could not be confirmed.');
  return { grant, message };
}

export async function revokeGrant(
  host: HostCall,
  args: { slug: string; grantId: string },
): Promise<{ grant: WireWorkspaceGrant }> {
  const grant = readGrantReceipt(await host.call('grantRevoke', args), 'grantRevoke', args.slug);
  if (grant.id !== args.grantId)
    throw new HostAnswerInvalid('grantRevoke returned the wrong grant.');
  return { grant };
}
