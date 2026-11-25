import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { readMessagingIdentity, type MessagingIdentity } from '../identity.js';
import { pairedRoute, type BotPairing } from '../pairing.js';
import type { MessagingInboundEvent, MessagingProvider, MessagingReplyRoute } from '../provider.js';

export function controlBinding(
  database: OperationalDatabaseModulePort,
  providerId: string,
  event: MessagingInboundEvent,
): MessagingIdentity | undefined {
  return database.read((db) => {
    const row = db
      .prepare(
        'SELECT id FROM messaging_bindings WHERE provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
      )
      .get(providerId, event.botId, event.fingerprint) as { id: string } | undefined;
    return row ? readMessagingIdentity(db, row.id) : undefined;
  });
}

export function privateRoute(
  pairing: BotPairing,
  binding: MessagingIdentity,
  actorId: string,
): MessagingReplyRoute | undefined {
  return pairing
    .list(binding.botSlug)
    .filter(
      (item) =>
        item.status === 'approved' && item.bindingId === binding.id && item.actorId === actorId,
    )
    .map(
      (item) =>
        item.privateReply ??
        (item.purpose !== 'conversation' || item.conversationKind === 'dm'
          ? pairedRoute(item)
          : undefined),
    )
    .find((item) => !!item);
}

export async function controlReply(input: {
  database: OperationalDatabaseModulePort;
  provider: MessagingProvider;
  binding: MessagingIdentity;
  route: MessagingReplyRoute;
  text: string;
  standalone: boolean;
  signal?: AbortSignal;
  isBotActive(slug: string): boolean;
}) {
  const { database, binding } = input;
  if (!input.provider.reply) return undefined;
  return input.provider.reply({
    accountRef: binding.accountRef,
    fingerprint: binding.fingerprint,
    route: input.route,
    text: input.text,
    signal: input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    ...(input.standalone ? { standalone: true as const } : {}),
    beforeSend: () => {
      try {
        const current = database.read((db) => readMessagingIdentity(db, binding.id));
        return (
          current.enabled &&
          !current.revokedAt &&
          current.fingerprint === binding.fingerprint &&
          input.isBotActive(binding.botSlug)
        );
      } catch {
        return false;
      }
    },
  });
}
