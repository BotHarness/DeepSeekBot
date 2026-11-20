import { sourceContentPurged } from '../purge/fence.js';
import { admissionBound, readBlock } from './conversations.js';
import type { MessagingIdentity } from './identity.js';
import { senderAdmissionAllowed } from './sender-access.js';
import { readMessagingIdentity } from './identity.js';
import { assertMessagingIdentity } from './identity.js';
import {
  createImCommandExecutor,
  imCommandAuthority,
  imCommandRequiresAuthority,
  parseImCommand,
} from './im-commands.js';
import { channelBridgeRoutes } from './channel-bridge.js';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from './provider.js';
import type { ExternalSource, InboundMessaging } from './inbound-contract.js';
import type { StatementSync } from 'node:sqlite';
import type { InboundMessagingOptions } from './inbound.js';

export function createInboundCommandIntake(wiring: {
  options: InboundMessagingOptions;
  database: OperationalDatabaseModulePort;
  controls: Map<
    string,
    {
      controller: AbortController;
      token: object;
      startedAt: number;
      ready: Promise<void>;
      dispose?: (() => void) | undefined;
    }
  >;
  conversationEntries: (
    db: DatabaseSync,
    bindingId: string,
    conversation: MessagingInboundEvent['conversation'],
  ) => MessagingGrant[];
  targetAvailable: (value: MessagingGrant) => boolean;
  providers: Map<
    string,
    { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
  >;
  admitDefault: (
    id: string,
    lease: { controller: AbortController; token: object },
    identity: MessagingIdentity,
    entry: NonNullable<
      ReturnType<
        (
          key: string,
        ) =>
          | { provider: MessagingProvider; token: object; consume?: MessagingProvider['consume'] }
          | undefined
      >
    >,
    event: MessagingInboundEvent,
    signal: AbortSignal,
    claimCommand?: boolean,
  ) => Promise<{ accepted: true; commandClaimed?: string }>;
  read: (
    botSlug: string,
    id: string,
    includeQuote?: boolean,
    includeContext?: boolean,
  ) => ExternalSource;
  closed: boolean;
  grant: (id: string) => MessagingGrant;
  transaction: <T>(command: (db: DatabaseSync) => T, topics?: string[]) => T;
  executeCommand: ReturnType<typeof createImCommandExecutor>;
  service: InboundMessaging;
  prepareCommandAdmissionStatus: (db: DatabaseSync) => StatementSync;
}) {
  const {
    options,
    database,
    controls,
    conversationEntries,
    targetAvailable,
    providers,
    admitDefault,
    read,
    grant,
    transaction,
    executeCommand,
    prepareCommandAdmissionStatus,
  } = wiring;

  const commandIntake = async (
    provider: MessagingProvider,
    event: MessagingInboundEvent,
    signal: AbortSignal,
    defaultOnly = false,
  ): Promise<boolean> => {
    const command = parseImCommand(event.text);
    if (command === undefined) return false;
    const host = options.imCommands?.();
    if (
      host === undefined ||
      !options.replyCommand ||
      !provider.reply ||
      provider.id !== `dsh-im/${event.channel}`
    )
      return false;
    if (
      event.conversation.kind !== 'dm' ||
      event.attachments?.length ||
      event.actor.kind !== 'user'
    )
      return false;
    signal.throwIfAborted();
    const row = database.read((db) =>
      db
        .prepare(
          'SELECT id FROM messaging_bindings WHERE provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
        )
        .get(provider.id, event.botId, event.fingerprint),
    ) as { id: string } | undefined;
    if (!row) return true;
    const lease = controls.get(row.id);
    if (!lease || lease.controller.signal.aborted) return true;
    const identity = database.read((db) => readMessagingIdentity(db, row.id));
    if (
      !identity.enabled ||
      identity.revokedAt ||
      options.bindingAvailable?.(row.id) === false ||
      !options.isBotActive(identity.botSlug) ||
      (identity.receiveAfter && Date.parse(event.at) < Date.parse(identity.receiveAfter))
    )
      return true;
    const admissionAllowed = () =>
      database.read((db) => {
        if (readBlock(db, identity.botSlug, identity.fingerprint, event.conversation)) return false;
        const entries = conversationEntries(db, row.id, event.conversation);
        const allowedConversation = entries.length
          ? entries.every((value) => value.origin === 'implicit') ||
            (!defaultOnly &&
              entries.some(
                (value) =>
                  !value.revokedAt &&
                  !value.suspendedReason &&
                  targetAvailable(value) &&
                  !(value.receiveAfter && Date.parse(event.at) < Date.parse(value.receiveAfter)) &&
                  channelBridgeRoutes(value).some(
                    (route) =>
                      route.enabled &&
                      !(route.intakeAfter && Date.parse(event.at) < Date.parse(route.intakeAfter)),
                  ),
              ))
          : identity.newConversations === 'auto' &&
            admissionBound(db, row.id, new Date()) === undefined;
        return allowedConversation && senderAdmissionAllowed(db, identity.botSlug, event);
      });
    if (!admissionAllowed()) return true;
    const entry = providers.get(identity.providerId);
    if (!entry || entry.token !== lease.token) return true;
    const claimed = await admitDefault(row.id, lease, identity, entry, event, signal, true);
    if (!claimed.commandClaimed) return true;
    const source = read(identity.botSlug, claimed.commandClaimed);
    const managementPairing = () =>
      imCommandRequiresAuthority(command) &&
      event.channel !== 'weixin' &&
      options.pairing
        ?.list(identity.botSlug)
        .some(
          (item) =>
            item.purpose !== 'conversation' &&
            item.status === 'approved' &&
            item.capabilities.includes('approve') &&
            item.bindingId === row.id &&
            item.actorId === event.actor.id,
        ) === true;
    const manage = () =>
      imCommandAuthority({
        command,
        platform: event.channel,
        pairingAvailable: options.pairing !== undefined,
        managementPairing: managementPairing(),
      });
    const assertSourceCurrent = () => {
      signal.throwIfAborted();
      lease.controller.signal.throwIfAborted();
      if (
        wiring.closed ||
        controls.get(row.id) !== lease ||
        providers.get(identity.providerId) !== entry ||
        options.bindingAvailable?.(row.id) === false ||
        !options.isBotActive(identity.botSlug)
      )
        throw new MessagingError('consumer-unavailable');
      database.read((db) => assertMessagingIdentity(db, row.id, identity.revision));
      const currentGrant = grant(source.grantId);
      if (
        currentGrant.revokedAt ||
        currentGrant.suspendedReason ||
        currentGrant.revision !== source.grantRevision ||
        !admissionAllowed() ||
        database.read((db) => sourceContentPurged(db, claimed.commandClaimed!))
      )
        throw new MessagingError('source-unavailable');
    };
    const assertCurrent = () => {
      assertSourceCurrent();
      if (imCommandRequiresAuthority(command) && manage() !== 'allowed')
        throw new MessagingError('pairing-required');
    };
    const commandState = (reason: string | null) =>
      transaction(
        (db) => {
          prepareCommandAdmissionStatus(db).run(reason, claimed.commandClaimed!, identity.botSlug);
        },
        ['bot-inbox'],
      );
    setImmediate(() => {
      if (
        wiring.closed ||
        signal.aborted ||
        lease.controller.signal.aborted ||
        controls.get(row.id) !== lease
      )
        return;
      void (async () => {
        let text: string;
        try {
          text = await executeCommand(() => {
            assertSourceCurrent();
            return {
              command,
              chinese: command.chinese,
              botSlug: identity.botSlug,
              botDisplayName: host.botDisplayName(identity.botSlug) ?? identity.botSlug,
              working: host.turnRunning(identity.botSlug),
              manage: manage(),
              assertCurrent,
              host,
            };
          });
        } catch {
          options.warn?.(
            JSON.stringify({
              event: 'bot-im-command',
              phase: 'execution-failed',
              initiator: 'command-intake',
              command: command.name,
            }),
          );
          text = command.chinese
            ? '命令执行失败，请重试或改用 Web 端。'
            : 'Could not complete the command; try again or use the Web app.';
        }
        try {
          assertSourceCurrent();
          commandState('im-command-reply-pending');
          await wiring.service.ensureReplyConsumer(identity.botSlug, source.grantId, signal);
          assertSourceCurrent();
          await options.replyCommand!(identity.botSlug, claimed.commandClaimed!, text);
          commandState(null);
        } catch {
          if (!wiring.closed) commandState('im-command-reply-unconfirmed');
          options.warn?.(
            JSON.stringify({
              event: 'bot-im-command',
              phase: 'reply-unconfirmed',
              initiator: 'command-intake',
            }),
          );
        }
      })();
    });
    return true;
  };

  return { commandIntake };
}
