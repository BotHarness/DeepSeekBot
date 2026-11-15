export interface EnvironmentSettingsTarget {
  hostId: string;
  name: string;
  local: boolean;
}

export function settingsTargetIdentity(
  target: EnvironmentSettingsTarget,
  thisHost: { id?: string; name?: string },
): EnvironmentSettingsTarget {
  if (!target.local) return target;
  return {
    ...target,
    hostId: thisHost.id ?? target.hostId,
    name: thisHost.name ?? target.name,
  };
}
