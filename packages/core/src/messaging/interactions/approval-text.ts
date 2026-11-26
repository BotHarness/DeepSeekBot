import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { ApprovalDelivery, ApprovalMessaging } from '../approval-messaging.js';
import { isMessagingPlatform, messagingPlatform } from '../platforms/index.js';
import type { MessagingInboundEvent, MessagingProvider } from '../provider.js';
import { answerText } from './text-answers.js';
import { approvalReference, parseApprovalReply } from './text-approvals.js';

export function createApprovalText(options: {
  database: OperationalDatabaseModulePort;
  approvals: Pick<ApprovalMessaging, 'action'>;
  provider?(id: string): MessagingProvider;
}) {
  return async (
    providerId: string,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ): Promise<boolean> => {
    if (
      !isMessagingPlatform(event.channel) ||
      !messagingPlatform(event.channel).features.interactions ||
      event.actor.kind !== 'user' ||
      event.attachments?.length
    )
      return false;
    const body = answerText(event);
    const explicit = /^#([A-Fa-f0-9]{12})\s+([\s\S]+)$/.exec(body);
    const decision = parseApprovalReply(explicit ? explicit[2]! : body);
    if (!decision) return false;
    const candidates = options.database.read((db) =>
      (
        db
          .prepare(
            "SELECT body FROM messaging_approval_deliveries WHERE json_extract(body, '$.status') = 'pending' AND json_extract(body, '$.delivery') = 'sent' AND json_extract(body, '$.receipt.conversationId') = ? ORDER BY rowid DESC LIMIT 100",
          )
          .all(event.conversation.id) as { body: string }[]
      ).map((row) => JSON.parse(row.body) as ApprovalDelivery),
    );
    const target =
      candidates.find((value) => value.receipt?.messageId === event.reply.parentId) ??
      (explicit
        ? candidates.find((value) => approvalReference(value.id) === explicit[1]!.toUpperCase())
        : !event.reply.parentId && event.conversation.kind === 'dm' && candidates.length === 1
          ? candidates[0]
          : undefined);
    if (!target?.receipt || signal.aborted) return false;
    const ack = await options.approvals.action(
      providerId,
      {
        version: 1,
        channel: event.channel,
        botId: event.botId,
        fingerprint: event.fingerprint,
        actorId: event.actor.id,
        conversationId: event.conversation.id,
        messageId: target.receipt.messageId,
        requestId: target.id,
        action: decision,
      },
      signal,
    );
    if (ack.status === 'refused') setImmediate(() => void refuse(providerId, event, signal));
    return true;
  };

  async function refuse(providerId: string, event: MessagingInboundEvent, signal: AbortSignal) {
    if (signal.aborted) return;
    const provider = options.provider?.(providerId);
    if (!provider?.reply) return;
    try {
      await provider.reply({
        accountRef: event.botId,
        fingerprint: event.fingerprint,
        route: event.reply,
        text: REFUSED,
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        ...(event.conversation.kind === 'dm' ? { standalone: true as const } : {}),
      });
    } catch {}
  }
}

const REFUSED =
  'This reply was not applied. You may not be allowed to make this decision, or the approval is no longer waiting. / 该回复未生效：你可能没有权限做这个决定，或该审批已不在等待中。';
