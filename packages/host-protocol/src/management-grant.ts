export interface ChannelManagementGrant {
  botSlug: string;
  botName: string;
  capability: 'manage-app' | 'manage-bots';
  enabled: boolean;
}

export function isChannelManagementGrant(value: unknown): value is ChannelManagementGrant {
  if (typeof value !== 'object' || value === null) return false;
  const { botSlug, botName, capability, enabled } = value as Partial<ChannelManagementGrant>;
  return (
    typeof botSlug === 'string' &&
    botSlug.length > 0 &&
    typeof botName === 'string' &&
    botName.trim().length > 0 &&
    (capability === 'manage-app' || capability === 'manage-bots') &&
    typeof enabled === 'boolean'
  );
}
