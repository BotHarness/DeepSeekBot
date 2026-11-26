import { record, type HostCall } from './host-answer';

export const MANAGEMENT_CAPABILITIES = ['manage-app', 'manage-bots'] as const;
export type ManagementCapability = (typeof MANAGEMENT_CAPABILITIES)[number];

export interface ManagementGrants {
  readonly editable: boolean;
  readonly memberBot: boolean;
  readonly capabilities: readonly ManagementCapability[];
  readonly appManagers: readonly string[];
}

export interface ManagementGrantChange {
  readonly capabilities: readonly ManagementCapability[];
  readonly noAppManager: boolean;
}

function capabilities(value: unknown): ManagementCapability[] {
  return Array.isArray(value)
    ? MANAGEMENT_CAPABILITIES.filter((capability) => value.includes(capability))
    : [];
}

export async function loadManagementGrants(
  host: HostCall,
  slug: string,
): Promise<ManagementGrants> {
  const answer = record(await host.call('managementGrants', { slug }));
  const holders = Array.isArray(answer?.['holders']) ? answer['holders'] : [];
  const parsed = holders.flatMap((holder: unknown) => {
    const row = record(holder);
    const botSlug = row?.['botSlug'];
    return typeof botSlug === 'string'
      ? [{ botSlug, capabilities: capabilities(row?.['capabilities']) }]
      : [];
  });
  return {
    editable: answer?.['editable'] === true,
    memberBot: answer?.['memberBot'] === true,
    capabilities: parsed.find((holder) => holder.botSlug === slug)?.capabilities ?? [],
    appManagers: parsed
      .filter((holder) => holder.capabilities.includes('manage-app'))
      .map((holder) => holder.botSlug),
  };
}

export async function setManagementGrant(
  host: HostCall,
  slug: string,
  capability: ManagementCapability,
  enabled: boolean,
): Promise<ManagementGrantChange> {
  const answer = record(
    await host.call('managementGrantSet', {
      slug,
      capability,
      enabled,
      ...(enabled ? { confirm: true } : {}),
    }),
  );
  return {
    capabilities: capabilities(answer?.['capabilities']),
    noAppManager: answer?.['noAppManager'] === true,
  };
}
