import type { DatabaseSync } from 'node:sqlite';
import { messagingDefaults } from './defaults.js';
import { MessagingError } from './provider.js';

export interface MessagingIdentity {
  id: string;
  botSlug: string;
  providerId: string;
  platform: string;
  accountRef: string;
  fingerprint: string;
  name: string;
  enabled: boolean;
  postLimit?: number | null;
  postLimitRevision?: number;
  typingEnabled?: boolean;
  typingInheritance?: 'inherit' | 'custom';
  receiveAfter?: string;
  enabledInheritance?: 'inherit' | 'custom';
  newConversations: MessagingNewConversations;
  newConversationsInheritance?: 'inherit' | 'custom';
  defaultRevision?: number;
  revision: number;
  createdAt: string;
  revokedAt?: string;
}
export type MessagingNewConversations = 'auto' | 'ask';
export type MessagingIdentityInput =
  | { kind: 'bind'; providerId: string; accountRef: string; fingerprint: string }
  | {
      kind: 'update';
      id: string;
      expectedRevision: number;
      name: string;
      enabled: boolean;
      typingEnabled?: boolean | undefined;
      inheritTyping?: boolean | undefined;
      inheritEnabled?: boolean | undefined;
      expectedDefaultRevision?: number | undefined;
      newConversations?: MessagingNewConversations | 'inherit' | undefined;
    }
  | { kind: 'reconnect'; id: string; expectedRevision: number }
  | { kind: 'unbind'; id: string; expectedRevision: number };
export type MessagingIdentityView = MessagingIdentity & {
  availability: 'available' | 'paused' | 'unavailable' | 'rebind-required';
  reception?: 'off' | 'connecting' | 'receiving' | 'unavailable';
  grantCount: number;
  scopes: string[];
  typing?: {
    supported: boolean;
    phase: 'idle' | 'requesting' | 'accepted' | 'cleanup-unconfirmed' | 'unavailable';
    reason?: string;
  };
};
interface BindingRow {
  id: string;
  bot_slug: string;
  provider_id: string;
  platform: string;
  account_ref: string;
  fingerprint: string;
  display_name: string;
  enabled: number;
  post_limit: number | null;
  post_limit_revision: number;
  enabled_inherited: number;
  typing_enabled: number;
  typing_inherited: number;
  receive_after: string | null;
  new_conversations: MessagingNewConversations;
  new_conversations_inherited: number;
  revision: number;
  created_at: string;
  revoked_at: string | null;
}
export function readMessagingIdentity(db: DatabaseSync, id: string): MessagingIdentity {
  const r = db.prepare('SELECT * FROM messaging_bindings WHERE id = ?').get(id) as unknown as
    | BindingRow
    | undefined;
  if (!r) throw new MessagingError('identity-unavailable');
  return {
    id: r.id,
    botSlug: r.bot_slug,
    providerId: r.provider_id,
    platform: r.platform,
    accountRef: r.account_ref,
    fingerprint: r.fingerprint,
    name: r.display_name,
    postLimit: r.post_limit,
    postLimitRevision: r.post_limit_revision,
    enabled:
      r.enabled_inherited === 1
        ? messagingDefaults(db, r.platform).identityEnabled
        : r.enabled === 1,
    enabledInheritance: r.enabled_inherited === 1 ? 'inherit' : 'custom',
    ...(r.receive_after ? { receiveAfter: r.receive_after } : {}),
    ...(r.platform === 'weixin'
      ? {
          typingEnabled:
            r.typing_inherited === 1
              ? (messagingDefaults(db, r.platform).typingEnabled ?? true)
              : r.typing_enabled === 1,
          typingInheritance: r.typing_inherited === 1 ? ('inherit' as const) : ('custom' as const),
        }
      : {}),
    newConversations:
      r.new_conversations_inherited === 1
        ? (messagingDefaults(db, r.platform).newConversations ?? 'auto')
        : r.new_conversations,
    newConversationsInheritance: r.new_conversations_inherited === 1 ? 'inherit' : 'custom',
    defaultRevision: messagingDefaults(db, r.platform).revision,
    revision: r.revision,
    createdAt: r.created_at,
    ...(r.platform === 'qq' ? { receiveAfter: r.receive_after ?? r.created_at } : {}),
    ...(r.revoked_at ? { revokedAt: r.revoked_at } : {}),
  };
}
export function assertMessagingIdentity(
  db: DatabaseSync,
  id: string,
  expectedRevision?: number,
): MessagingIdentity {
  const value = readMessagingIdentity(db, id);
  if (value.revokedAt) throw new MessagingError('identity-unbound');
  if (!value.enabled) throw new MessagingError('identity-paused');
  if (expectedRevision !== undefined && value.revision !== expectedRevision)
    throw new MessagingError('identity-changed');
  return value;
}
