import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { ApprovalDelivery, ApprovalMessaging } from '../approval-messaging.js';
import { isMessagingPlatform, messagingPlatform } from '../platforms/index.js';
import type { MessagingInboundEvent } from '../provider.js';
import { answerText } from './text-answers.js';
import { approvalReference, parseApprovalReply } from './text-approvals.js';

export function createApprovalText(options: {
  database: OperationalDatabaseModulePort;
  approvals: Pick<ApprovalMessaging, 'action'>;
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
        : event.conversation.kind === 'dm' && candidates.length === 1
          ? candidates[0]
          : undefined);
    if (!target?.receipt || signal.aborted) return false;
    await options.approvals.action(
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
    return true;
  };
}
