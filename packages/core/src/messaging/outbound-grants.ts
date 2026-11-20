import { effectiveDmControls } from './dm-controls.js';
import { readMessagingIdentity, type MessagingIdentity } from './identity.js';
import { messagingDefaultsPlatform } from './defaults.js';
import { readBlock } from './conversations.js';
import { randomUUID } from 'node:crypto';
import type { InboundMessaging } from './inbound.js';
import { createMessagingTyping } from './typing.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { MessagingError, type MessagingTarget } from './provider.js';
import type {
  MessagingGrant,
  ProviderRegistration,
  AccountReader,
  OutboundMessaging,
} from './outbound-contract.js';
import type { OutboundMessagingOptions } from './outbound.js';

export function createOutboundGrants(context: {
  database: OperationalDatabaseModulePort;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  bounded: <T>(work: Promise<T>) => Promise<T>;
  provider: (id: string) => ProviderRegistration;
  active: (slug: string) => void;
  enabledBinding: (id: string, revision?: number) => MessagingIdentity;
  current: (id: string, token: object) => void;
  service: OutboundMessaging;
  options: OutboundMessagingOptions;
  inbound: InboundMessaging;
  now: () => string;
  connectorEnabled: (platform: string) => void;
  revokePendingIntents: (db: DatabaseSync, grantId: string, at: string) => void;
  typing: ReturnType<typeof createMessagingTyping>;
  inFlight: Map<
    string,
    { providerId: string; token: object; controller: AbortController; fileGrantId?: string }
  >;
}) {
  const {
    database,
    transaction,
    bounded,
    provider,
    active,
    enabledBinding,
    current,
    options,
    now,
    connectorEnabled,
    revokePendingIntents,
    inFlight,
  } = context;

  const grant = (slug: string, id: string): MessagingGrant => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE id = ? AND bot_slug = ?').get(id, slug),
    ) as { body: string } | undefined;
    if (row === undefined) throw new MessagingError('grant-unavailable');
    return database.read((db) => effectiveDmControls(db, JSON.parse(row.body) as MessagingGrant));
  };

  const suspend = (value: MessagingGrant) => {
    transaction(
      (db) => {
        const latest = grant(value.botSlug, value.id);
        if (latest.revokedAt === undefined && latest.suspendedReason === undefined) {
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify({
              ...latest,
              suspendedReason: 'rebind-required',
              revision: latest.revision + 1,
            }),
            latest.revision + 1,
            latest.id,
          );
        }
      },
      ['grants'],
    );
  };

  const inspectImplicit = async (
    entry: ProviderRegistration,
    value: MessagingGrant,
    readAccount?: AccountReader,
  ) => {
    const registered = entry.provider;
    if (!registered.inspectAccount || !value.receiveScope)
      throw new MessagingError('capability-unavailable');
    const account = await bounded(
      readAccount
        ? readAccount(entry, value.accountRef)
        : registered.inspectAccount(value.accountRef),
    );
    if (!account) throw new MessagingError('rebind-required');
    return {
      account,
      target: {
        ref: value.targetRef,
        name: value.targetName,
        digest: value.targetDigest,
        receiveScope: value.receiveScope,
      },
    };
  };

  const assertConversationAllowed = (
    value: MessagingGrant,
    scope: MessagingTarget['receiveScope'],
  ) => {
    if (
      scope &&
      database.read((db) =>
        readBlock(db, value.botSlug, value.fingerprint, {
          kind: scope.kind,
          id: scope.conversationId,
        }),
      )
    )
      throw new MessagingError('conversation-blocked');
  };

  const savedDmGrant = async (value: MessagingGrant): Promise<string | undefined> => {
    const conversationId = value.receiveScope?.conversationId;
    if (conversationId === undefined) return undefined;
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT body FROM messaging_grants WHERE binding_id = ? AND bot_slug = ? AND revoked_at IS NULL ORDER BY created_at, rowid',
        )
        .all(value.bindingId, value.botSlug),
    ) as { body: string }[];
    const candidates = rows
      .map((row) => JSON.parse(row.body) as MessagingGrant)
      .filter((candidate) => candidate.origin !== 'implicit' && !candidate.suspendedReason);
    if (candidates.length === 0) return undefined;
    const entry = provider(value.providerId);
    const targets = await bounded(entry.provider.targets(value.accountRef));
    return candidates.find((candidate) =>
      targets.some(
        (target) =>
          target.ref === candidate.targetRef &&
          target.digest === candidate.targetDigest &&
          target.receiveScope?.kind === 'dm' &&
          target.receiveScope.conversationId === conversationId,
      ),
    )?.id;
  };

  const check = async (value: MessagingGrant, readAccount?: AccountReader) => {
    active(value.botSlug);
    if (value.revokedAt !== undefined) throw new MessagingError('grant-revoked');
    const identity = enabledBinding(value.bindingId);
    if (value.suspendedReason !== undefined) throw new MessagingError('rebind-required');
    const entry = provider(value.providerId);
    let inspected;
    try {
      inspected =
        value.origin === 'implicit'
          ? await inspectImplicit(entry, value, readAccount)
          : await bounded(
              readAccount
                ? entry.provider.inspect(
                    value.accountRef,
                    value.targetRef,
                    await readAccount(entry, value.accountRef),
                  )
                : entry.provider.inspect(value.accountRef, value.targetRef),
            );
    } catch (error) {
      current(value.providerId, entry.token);
      if (error instanceof MessagingError && error.code === 'rebind-required') suspend(value);
      throw error;
    }
    current(value.providerId, entry.token);
    enabledBinding(value.bindingId, identity.revision);
    active(value.botSlug);
    if (!inspected.account.connected) throw new MessagingError('provider-unavailable');
    if (
      inspected.account.ref !== value.accountRef ||
      inspected.account.fingerprint !== value.fingerprint ||
      inspected.account.platform !== value.platform ||
      inspected.target.ref !== value.targetRef ||
      inspected.target.digest !== value.targetDigest
    ) {
      suspend(value);
      throw new MessagingError('rebind-required');
    }
    assertConversationAllowed(value, inspected.target.receiveScope);
    return { ...entry, inspected, identityRevision: identity.revision };
  };

  const methods: Pick<
    OutboundMessaging,
    'deletionDependencies' | 'disableBot' | 'authorize' | 'revoke'
  > = {
    deletionDependencies(botSlug) {
      return database.read((db) => ({
        identities: db
          .prepare(
            'SELECT id FROM messaging_bindings WHERE bot_slug = ? AND revoked_at IS NULL ORDER BY id',
          )
          .all(botSlug)
          .map((row) => String(row['id'])),
        grants: db
          .prepare(
            'SELECT id FROM messaging_grants WHERE bot_slug = ? AND revoked_at IS NULL ORDER BY id',
          )
          .all(botSlug)
          .map((row) => String(row['id'])),
      }));
    },
    async disableBot(botSlug) {
      const dependencies = context.service.deletionDependencies(botSlug);
      for (const id of dependencies.grants) context.service.revoke(botSlug, id);
      database.transaction(
        (db) => {
          db.prepare(
            'UPDATE messaging_bindings SET enabled = 0, enabled_inherited = 0, revision = revision + 1 WHERE bot_slug = ? AND revoked_at IS NULL',
          ).run(botSlug);
        },
        ['bindings', 'grants', 'bot-inbox'],
      );
      options.onAuthorizationChanged?.(botSlug);
      await Promise.all(
        dependencies.identities.map((id) => bounded(context.inbound.reconcileBinding(id))),
      );
    },
    async authorize(input) {
      active(input.botSlug);
      const entry = provider(input.providerId);
      const inspected = await entry.provider.inspect(input.accountRef, input.targetRef);
      current(input.providerId, entry.token);
      if (
        inspected.account.ref !== input.accountRef ||
        !inspected.account.connected ||
        inspected.account.fingerprint !== input.fingerprint ||
        inspected.target.ref !== input.targetRef ||
        inspected.target.digest !== input.targetDigest
      )
        throw new MessagingError('rebind-required');
      let createdBinding: string | undefined;
      const authorized = transaction(
        (db) => {
          createdBinding = undefined;
          active(input.botSlug);
          const existing = db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND provider_id = ? AND (account_ref = ? OR fingerprint = ?)',
            )
            .get(input.providerId, input.accountRef, input.fingerprint);
          let reusable: MessagingIdentity | undefined;
          if (existing !== undefined) {
            reusable = readMessagingIdentity(db, (existing as { id: string }).id);
            if (
              reusable.botSlug !== input.botSlug ||
              reusable.providerId !== input.providerId ||
              reusable.accountRef !== input.accountRef ||
              reusable.fingerprint !== input.fingerprint ||
              !reusable.enabled
            )
              throw new MessagingError('binding-conflict');
            const duplicate = db
              .prepare(
                "SELECT id FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL AND json_extract(body, '$.targetRef') = ?",
              )
              .get(reusable.id, input.targetRef);
            if (duplicate) throw new MessagingError('binding-conflict');
          }
          const at = now();
          const bindingId = reusable?.id ?? randomUUID();
          const id = randomUUID();
          const value: MessagingGrant = {
            ...input,
            id,
            bindingId,
            accountName: inspected.account.name,
            platform: inspected.account.platform,
            targetName: inspected.target.name,
            revision: 1,
            createdAt: at,
            origin: 'explicit',
          };
          if (!reusable)
            db.prepare(
              'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name, enabled_inherited, typing_inherited) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            ).run(
              bindingId,
              input.botSlug,
              input.providerId,
              value.platform,
              input.accountRef,
              value.fingerprint,
              at,
              inspected.account.name,
              messagingDefaultsPlatform.safeParse(value.platform).success ? 1 : 0,
              value.platform === 'weixin' ? 1 : 0,
            );
          if (!reusable && readMessagingIdentity(db, bindingId).enabled)
            createdBinding = value.platform;
          db.prepare(
            'INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(id, bindingId, input.botSlug, 1, at, JSON.stringify(value));
          return value;
        },
        ['bindings', 'grants'],
      );
      if (createdBinding !== undefined) connectorEnabled(createdBinding);
      return authorized;
    },
    revoke(botSlug, grantId) {
      transaction(
        (db) => {
          const value = grant(botSlug, grantId);
          if (value.revokedAt !== undefined) return;
          const revokedAt = now();
          db.prepare('UPDATE messaging_grants SET body = ?, revoked_at = ? WHERE id = ?').run(
            JSON.stringify({ ...value, revokedAt }),
            revokedAt,
            grantId,
          );

          revokePendingIntents(db, grantId, revokedAt);
        },
        ['grants', 'bindings', 'outbox'],
      );
      context.inbound.revoke(grantId);
      context.typing.invalidate((candidate) => candidate.grantId === grantId);
      for (const attempt of inFlight.values())
        if (attempt.fileGrantId === grantId) attempt.controller.abort();
    },
  };

  return { grant, assertConversationAllowed, savedDmGrant, check, methods };
}
