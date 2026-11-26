import { TOB_BOT_PROFILE_CAPABILITIES } from '../../tob/cli-bot-profile-operations.js';
import { TOB_MEMORY_EDIT_CAPABILITIES } from '../../tob/cli-memory-edit-operations.js';
import { TOB_MEMORY_LEASE_CAPABILITIES } from '../../tob/cli-memory-lease-operations.js';
import { classifyTobHostCli } from '../../tob/cli-host-commands.js';
import type { TobCliCapability } from '../../tob/cli-operations.js';
import type { ManagementCapability } from '../../tob/management-grants.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelStore } from '../../channels/store.js';

const MANAGE_BOTS_COMMANDS = new Set(
  [
    ...TOB_BOT_PROFILE_CAPABILITIES,
    ...TOB_MEMORY_EDIT_CAPABILITIES,
    ...TOB_MEMORY_LEASE_CAPABILITIES,
  ].map((entry) => entry.command),
);

export function managementCapabilityList(
  granted: readonly ManagementCapability[],
  capabilities: readonly TobCliCapability[],
): TobCliCapability[] {
  return capabilities.filter((entry) =>
    granted.includes(MANAGE_BOTS_COMMANDS.has(entry.command) ? 'manage-bots' : 'manage-app'),
  );
}

export function managementCapabilitiesFor(
  command: string,
  args: Record<string, unknown>,
  self: string,
  deps: {
    registry: Pick<PersonaBotRegistry, 'getHistorical'>;
    channels: Pick<ChannelStore, 'get'>;
  },
): ManagementCapability[] {
  if (MANAGE_BOTS_COMMANDS.has(command)) return ['manage-bots'];
  if (command !== 'cli' || !Array.isArray(args['argv'])) return ['manage-app'];
  const argv = args['argv'].filter((value): value is string => typeof value === 'string');
  let write: boolean;
  try {
    write = classifyTobHostCli(argv).write;
  } catch {
    return ['manage-app'];
  }
  if (!write) return ['manage-app'];
  const namesOtherBot = argv.slice(1).some((token) => {
    const value = (token.includes('=') ? token.slice(token.indexOf('=') + 1) : token).trim();
    if (value === '' || value === self) return false;
    if (deps.registry.getHistorical(value) !== undefined) return true;
    const channel = deps.channels.get(value);
    return (
      channel?.type === 'dm' &&
      channel.members.length === 1 &&
      channel.members[0] !== self &&
      deps.registry.getHistorical(channel.members[0]!) !== undefined
    );
  });
  return namesOtherBot ? ['manage-app', 'manage-bots'] : ['manage-app'];
}
