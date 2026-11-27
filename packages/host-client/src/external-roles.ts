import {
  pairingCapabilities,
  type ExternalContactAccess,
  type ExternalContactQuery,
  type ExternalRoleBotScope,
  type ExternalRoleRule,
  type HostExternalRole,
  type HostExternalRoleChange,
  type PairingCapability,
} from '@botharness/host-protocol/external-roles';
import { answer, count, optional, record, strings, text, type HostCall } from './host-answer';

export type {
  ExternalContactAccess,
  ExternalContactQuery,
  ExternalRoleBotScope,
  ExternalRoleRule,
  HostExternalRole,
  HostExternalRoleChange,
  PairingCapability,
};

function capabilities(value: unknown): value is PairingCapability[] {
  return (
    Array.isArray(value) &&
    value.every((item: unknown) => pairingCapabilities.some((capability) => capability === item))
  );
}

function botScope(value: unknown): value is ExternalRoleBotScope {
  const scope = record(value);
  return scope?.['kind'] === 'all' || (scope?.['kind'] === 'only' && strings(scope['botSlugs']));
}

function rule(value: unknown): value is ExternalRoleRule {
  const row = record(value);
  const effect = row?.['effect'];
  return (
    (effect === 'allow' || effect === 'ask' || effect === 'deny') &&
    text(row?.['topic']) &&
    text(row?.['text'])
  );
}

function role(value: unknown): value is HostExternalRole {
  const row = record(value);
  return (
    !!row &&
    text(row['id']) &&
    text(row['name']) &&
    text(row['behavior']) &&
    botScope(row['botScope']) &&
    Array.isArray(row['policy']) &&
    row['policy'].every(rule) &&
    capabilities(row['capabilities']) &&
    capabilities(row['deniedCapabilities']) &&
    optional(row['delegableCapabilities'], capabilities) &&
    count(row['revision']) &&
    row['revision'] > 0 &&
    optional(row['createdAt'], text) &&
    optional(row['updatedAt'], text)
  );
}

function roles(value: unknown): value is HostExternalRole[] {
  return Array.isArray(value) && value.every(role);
}

function contactAccess(value: unknown): value is ExternalContactAccess {
  const row = record(value);
  return (
    !!row &&
    typeof row['canSpeak'] === 'boolean' &&
    ['paired', 'visitor', 'unpaired', 'blocked', 'unavailable'].some(
      (state) => state === row['status'],
    ) &&
    strings(row['roleIds']) &&
    capabilities(row['capabilities']) &&
    capabilities(row['deniedCapabilities'])
  );
}

export async function readExternalRoles(host: HostCall): Promise<HostExternalRole[]> {
  return answer(record(await host.call('externalRoles', {}))?.['roles'], roles, 'externalRoles');
}

export async function changeExternalRole(
  host: HostCall,
  input: HostExternalRoleChange,
): Promise<HostExternalRole> {
  return answer(
    record(await host.call('externalRoleChange', input))?.['role'],
    role,
    'externalRoleChange',
  );
}

export async function readExternalContactAccess(
  host: HostCall,
  query: ExternalContactQuery,
): Promise<ExternalContactAccess> {
  return answer(
    await host.call('externalContactAccess', { ...query }),
    contactAccess,
    'externalContactAccess',
  );
}
