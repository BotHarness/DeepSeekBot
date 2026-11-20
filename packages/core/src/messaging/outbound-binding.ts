import { readMessagingIdentity, type MessagingIdentity } from './identity.js';
import {
  messagingDefaults,
  messagingDefaultsPlatform,
  commitMessagingDefaults,
} from './defaults.js';
import { randomUUID } from 'node:crypto';
import type { InboundMessaging } from './inbound.js';
import { createMessagingTyping } from './typing.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError } from './provider.js';
import type {
  AccountReader,
  ProviderRegistration,
  OutboundMessaging,
  MessagingGrant,
} from './outbound-contract.js';
import type { OutboundMessagingOptions } from './outbound.js';

export function createOutboundBinding(context: {
  provider: (id: string) => ProviderRegistration;
  bounded: <T>(work: Promise<T>) => Promise<T>;
  current: (id: string, token: object) => void;
  database: OperationalDatabaseModulePort;
  service: OutboundMessaging;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  options: OutboundMessagingOptions;
  inbound: InboundMessaging;
  typing: ReturnType<typeof createMessagingTyping>;
  active: (slug: string) => void;
  now: () => string;
  connectorEnabled: (platform: string) => void;
  binding: (id: string) => MessagingIdentity;
  enabledBinding: (id: string, revision?: number) => MessagingIdentity;
}) {
  const {
    provider,
    bounded,
    current,
    database,
    transaction,
    options,
    active,
    now,
    connectorEnabled,
    binding,
    enabledBinding,
  } = context;

  const inspectIdentity = async (
    value: Pick<MessagingIdentity, 'providerId' | 'accountRef' | 'fingerprint'>,
    readAccount?: AccountReader,
  ) => {
    const entry = provider(value.providerId);
    const account = await bounded(
      readAccount
        ? readAccount(entry, value.accountRef)
        : entry.provider.inspectAccount
          ? entry.provider.inspectAccount(value.accountRef)
          : entry.provider
              .accounts()
              .then((rows) => rows.find((r) => r.ref === value.accountRef && !r.unsupported)),
    );
    current(value.providerId, entry.token);
    if (!account || account.ref !== value.accountRef || account.fingerprint !== value.fingerprint)
      throw new MessagingError('rebind-required');
    if (!account.connected) throw new MessagingError('provider-unavailable');
    return { ...account, token: entry.token };
  };

  const methods: Pick<
    OutboundMessaging,
    'defaults' | 'setDefaults' | 'identity' | 'setPostLimit' | 'reachable' | 'targets'
  > = {
    defaults<Platform extends string = 'feishu'>(platform?: Platform) {
      return database.read((db) => messagingDefaults(db, platform));
    },
    async setDefaults(input) {
      const prior = context.service.defaults(input.platform);
      const value = transaction(
        (db) => commitMessagingDefaults(db, input),
        ['bindings', 'grants', 'channel', 'bot-inbox'],
      );
      const identities = database.read((db) =>
        db
          .prepare(
            'SELECT id, bot_slug FROM messaging_bindings WHERE platform = ? AND enabled_inherited = 1 AND revoked_at IS NULL',
          )
          .all(value.platform),
      ) as { id: string; bot_slug: string }[];
      if (prior.identityEnabled !== value.identityEnabled) {
        for (const botSlug of new Set(identities.map((identity) => identity.bot_slug)))
          options.onAuthorizationChanged?.(botSlug);
        await Promise.allSettled(
          identities.map(({ id }) => bounded(context.inbound.reconcileBinding(id))),
        );
      }
      if (prior.typingEnabled !== value.typingEnabled) {
        const inherited = database.read((db) =>
          db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE platform = ? AND typing_inherited = 1 AND revoked_at IS NULL',
            )
            .all(value.platform),
        ) as { id: string }[];
        const ids = new Set(inherited.map(({ id }) => id));
        context.typing.invalidate((candidate) => ids.has(candidate.bindingId));
      }
      options.onDefaultsChanged?.();
      options.warn?.(
        JSON.stringify({
          event: 'messaging-defaults',
          phase: 'committed',
          initiator: 'human-settings',
          revision: value.revision,
          platform: value.platform,
        }),
      );
      return value;
    },
    async identity(botSlug, input) {
      active(botSlug);
      if (input.kind === 'bind') {
        const account = await inspectIdentity(input);
        const bound = transaction(
          (db) => {
            active(botSlug);
            current(input.providerId, account.token);
            const prior = db
              .prepare(
                'SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND provider_id = ? AND (account_ref = ? OR fingerprint = ?)',
              )
              .get(input.providerId, input.accountRef, input.fingerprint);
            if (prior) throw new MessagingError('binding-conflict');
            const id = randomUUID();
            db.prepare(
              'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name, enabled_inherited, typing_inherited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(
              id,
              botSlug,
              input.providerId,
              account.platform,
              input.accountRef,
              input.fingerprint,
              now(),
              account.name,
              messagingDefaultsPlatform.safeParse(account.platform).success ? 1 : 0,
              account.platform === 'weixin' ? 1 : 0,
            );
            return readMessagingIdentity(db, id);
          },
          ['bindings'],
        );
        await bounded(context.inbound.reconcileBinding(bound.id));
        if (bound.enabled) connectorEnabled(bound.platform);
        return bound;
      }
      const value = binding(input.id);
      if (value.botSlug !== botSlug || value.revokedAt)
        throw new MessagingError('identity-unavailable');
      if (value.revision !== input.expectedRevision) throw new MessagingError('identity-stale');
      if (input.kind === 'update' && (!input.name.trim() || input.name.length > 120))
        throw new MessagingError('invalid-input');
      if (
        input.kind === 'update' &&
        (input.typingEnabled !== undefined || input.inheritTyping !== undefined) &&
        value.platform !== 'weixin'
      )
        throw new MessagingError('invalid-input');
      const scopes = database.read((db) =>
        db
          .prepare('SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL')
          .all(value.id),
      ) as { body: string }[];
      const enabled =
        input.kind === 'update'
          ? input.inheritEnabled
            ? context.service.defaults(value.platform).identityEnabled
            : input.enabled
          : input.kind === 'reconnect'
            ? value.enabledInheritance === 'inherit'
              ? context.service.defaults(value.platform).identityEnabled
              : true
            : false;
      const validatedTokens = new Map<string, object>();
      if (enabled) {
        const account = await inspectIdentity(value);
        validatedTokens.set(value.providerId, account.token);
        if (account.platform !== value.platform) throw new MessagingError('rebind-required');
        for (const row of scopes) {
          const g = JSON.parse(row.body) as MessagingGrant;
          if (g.origin === 'implicit') continue;
          const entry = provider(g.providerId);
          const checked = await bounded(entry.provider.inspect(g.accountRef, g.targetRef));
          current(g.providerId, entry.token);
          validatedTokens.set(g.providerId, entry.token);
          if (
            g.suspendedReason ||
            checked.account.fingerprint !== value.fingerprint ||
            !checked.account.connected ||
            checked.target.digest !== g.targetDigest ||
            checked.target.ref !== g.targetRef ||
            checked.account.ref !== value.accountRef ||
            checked.account.platform !== value.platform
          )
            throw new MessagingError('rebind-required');
        }
      }
      const updated = transaction(
        (db) => {
          active(botSlug);
          for (const [id, token] of validatedTokens) current(id, token);
          const latest = readMessagingIdentity(db, value.id);
          if (
            input.kind === 'update' &&
            input.expectedDefaultRevision !== undefined &&
            input.expectedDefaultRevision !== latest.defaultRevision
          )
            throw new MessagingError('defaults-stale');
          if (latest.revokedAt || latest.revision !== input.expectedRevision)
            throw new MessagingError('identity-stale');
          const currentScopes = db
            .prepare(
              'SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL',
            )
            .all(value.id) as { body: string }[];
          if (enabled && JSON.stringify(currentScopes) !== JSON.stringify(scopes))
            throw new MessagingError('identity-stale');
          const at = now();
          if (latest.platform === 'weixin' && enabled && !latest.enabled) {
            db.prepare('UPDATE messaging_bindings SET receive_after = ? WHERE id = ?').run(
              at,
              value.id,
            );
            for (const row of currentScopes) {
              const g = JSON.parse(row.body) as MessagingGrant;
              db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
                JSON.stringify({ ...g, receiveAfter: at }),
                g.id,
              );
            }
          }
          db.prepare(
            'UPDATE messaging_bindings SET revision = revision + 1, enabled = ?, display_name = ?, revoked_at = ?, enabled_inherited = ?, typing_enabled = ?, typing_inherited = ?, new_conversations = ?, new_conversations_inherited = ? WHERE id = ?',
          ).run(
            enabled ? 1 : 0,
            input.kind === 'update' ? input.name.trim() : latest.name,
            input.kind === 'unbind' ? at : null,
            input.kind === 'update'
              ? input.inheritEnabled
                ? 1
                : 0
              : latest.enabledInheritance === 'inherit'
                ? 1
                : 0,
            (input.kind === 'update'
              ? (input.typingEnabled ?? latest.typingEnabled)
              : latest.typingEnabled) === false
              ? 0
              : 1,
            input.kind === 'update' && input.inheritTyping !== undefined
              ? input.inheritTyping
                ? 1
                : 0
              : input.kind === 'update' && input.typingEnabled !== undefined
                ? 0
                : latest.typingInheritance === 'inherit'
                  ? 1
                  : 0,
            input.kind === 'update' &&
              input.newConversations !== undefined &&
              input.newConversations !== 'inherit'
              ? input.newConversations
              : (
                  db
                    .prepare('SELECT new_conversations FROM messaging_bindings WHERE id = ?')
                    .get(value.id) as { new_conversations: string }
                ).new_conversations,
            input.kind === 'update' && input.newConversations !== undefined
              ? input.newConversations === 'inherit'
                ? 1
                : 0
              : latest.newConversationsInheritance === 'custom'
                ? 0
                : 1,
            value.id,
          );
          if (input.kind === 'unbind') {
            for (const row of scopes) {
              const g = JSON.parse(row.body) as MessagingGrant;
              db.prepare(
                'UPDATE messaging_grants SET body = ?, revoked_at = ?, revision = ? WHERE id = ?',
              ).run(
                JSON.stringify({ ...g, revokedAt: at, revision: g.revision + 1 }),
                at,
                g.revision + 1,
                g.id,
              );
            }
          }
          return readMessagingIdentity(db, value.id);
        },
        ['bindings', 'grants', 'bot-inbox'],
      );
      context.typing.invalidate((candidate) => candidate.bindingId === value.id);
      options.onAuthorizationChanged?.(botSlug);
      await bounded(context.inbound.reconcileBinding(value.id));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-identity',
          phase: 'committed',
          initiator: 'human-profile',
          identityId: value.id,
          revision: updated.revision,
          enabled: updated.enabled,
          operation: input.kind,
        }),
      );
      if (updated.enabled && !value.enabled && !updated.revokedAt)
        connectorEnabled(updated.platform);
      return updated;
    },
    async setPostLimit(botSlug, bindingId, expectedRevision, limit) {
      if (limit !== null && (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000))
        throw new MessagingError('bad-request');
      transaction(
        (db) => {
          active(botSlug);
          const identity = enabledBinding(bindingId);
          if (identity.botSlug !== botSlug) throw new MessagingError('identity-unavailable');
          if (identity.postLimitRevision !== expectedRevision)
            throw new MessagingError('identity-changed');
          db.prepare(
            'UPDATE messaging_bindings SET post_limit = ?, post_limit_revision = post_limit_revision + 1 WHERE id = ?',
          ).run(limit, bindingId);
        },
        ['bindings'],
      );
      return binding(bindingId);
    },
    async reachable(botSlug, bindingId, cursor) {
      active(botSlug);
      const identity = enabledBinding(bindingId);
      if (identity.botSlug !== botSlug) throw new MessagingError('identity-unavailable');
      const entry = provider(identity.providerId);
      if (!entry.provider.reachable || !entry.provider.postConversation)
        throw new MessagingError('capability-unavailable');
      const page = await bounded(
        entry.provider.reachable({
          accountRef: identity.accountRef,
          fingerprint: identity.fingerprint,
          signal: AbortSignal.timeout(options.timeoutMs ?? 15000),
          ...(cursor ? { cursor } : {}),
        }),
      );
      active(botSlug);
      current(identity.providerId, entry.token);
      enabledBinding(bindingId, identity.revision);
      return page;
    },
    async targets(providerId, accountRef) {
      return provider(providerId).provider.targets(accountRef);
    },
  };

  return { inspectIdentity, methods };
}
