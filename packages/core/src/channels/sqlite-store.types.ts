import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { ChannelSourcePolicy } from './source-policy.js';
import type { ChannelStoreOptions, ChannelStore } from './store.js';

export interface SqliteChannelStoreOptions extends ChannelStoreOptions {
  database: OperationalDatabaseModulePort;
  databaseOwnerReady?: boolean;
  sourcePolicy?: ChannelSourcePolicy;

  autoAcceptGroupInvitations?: () => boolean;
  botHopLimit?: () => number;
}

export interface SqliteChannelAccess {
  current: Parameters<NonNullable<ChannelStore['bindHumanAccess']>>[0] | undefined;
}
