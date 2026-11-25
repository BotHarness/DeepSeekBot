export const MANAGEMENT_CAPABILITIES = ['manage-app', 'manage-bots'] as const;
export type ManagementCapability = (typeof MANAGEMENT_CAPABILITIES)[number];

export interface ManagementGrantChange {
  capability: ManagementCapability;
  enabled: boolean;
}

export function parseManagementGrantChange(value: unknown): ManagementGrantChange | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('capability' in value) ||
    !('enabled' in value)
  )
    return undefined;
  const { capability, enabled } = value;
  if ((capability !== 'manage-app' && capability !== 'manage-bots') || typeof enabled !== 'boolean')
    return undefined;
  return { capability, enabled };
}
