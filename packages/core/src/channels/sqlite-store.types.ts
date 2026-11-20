import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { ChannelStoreOptions, ChannelStore } from './store.js';

export interface SqliteChannelStoreOptions extends ChannelStoreOptions {
  database: OperationalDatabaseModulePort;
  databaseOwnerReady?: boolean;
  sourcePolicy?: BotSourcePolicyStore;

  autoAcceptGroupInvitations?: () => boolean;
  botHopLimit?: () => number;
}

export interface SqliteChannelAccess {
  current: Parameters<NonNullable<ChannelStore['bindHumanAccess']>>[0] | undefined;
}
