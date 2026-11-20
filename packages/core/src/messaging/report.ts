import type { DatabaseSync } from 'node:sqlite';
import type { MessagingGrant, OutboxIntent } from './outbound.js';
import type { MessagingReplyRoute, MessagingOwnEcho } from './provider.js';

export interface RelatedReport {
  intentId: string;
  text: string;
  createdAt: string;
  accountName: string;
  targetName: string;
  messageId: string;
  state: OutboxIntent['state'];
}

function correspondence(
  db: DatabaseSync,
  value: MessagingGrant,
  ids: string[],
): OutboxIntent | undefined {
  for (const messageId of ids) {
    const row = db
      .prepare(`SELECT body FROM messaging_outbox INDEXED BY messaging_outbox_receipt
      WHERE bot_slug = ? AND COALESCE(json_extract(body, '$.report.providerId'), json_extract(body, '$.reply.providerId')) = ?
      AND COALESCE(json_extract(body, '$.report.accountRef'), json_extract(body, '$.reply.accountRef')) = ? AND COALESCE(json_extract(body, '$.report.fingerprint'), json_extract(body, '$.reply.fingerprint')) = ?
      AND COALESCE(json_extract(body, '$.report.conversationId'), json_extract(body, '$.reply.conversationId')) = ? AND json_extract(body, '$.receipt.messageId') = ?
      ORDER BY created_at DESC LIMIT 1`)
      .get(
        value.botSlug,
        value.providerId,
        value.accountRef,
        value.fingerprint,
        value.receiveScope?.conversationId ?? '',
        messageId,
      ) as { body: string } | undefined;
    if (row) return JSON.parse(row.body) as OutboxIntent;
  }
  return undefined;
}

export function relatedReport(
  db: DatabaseSync,
  value: MessagingGrant,
  route: MessagingReplyRoute,
): RelatedReport | undefined {
  if (route.conversationId !== value.receiveScope?.conversationId) return undefined;
  const report = correspondence(
    db,
    value,
    [route.parentId, route.rootId].filter((id): id is string => Boolean(id)),
  );
  if (!report?.report || !report.receipt) return undefined;
  return {
    intentId: report.id,
    text: report.text,
    createdAt: report.createdAt,
    accountName: report.report.accountName,
    targetName: report.report.targetName,
    messageId: report.receipt.messageId,
    state: report.state,
  };
}

export function recordReportEcho(
  db: DatabaseSync,
  value: MessagingGrant,
  event: MessagingOwnEcho,
): void {
  if (
    event.fingerprint !== value.fingerprint ||
    event.botId !== value.accountRef ||
    event.conversationId !== value.receiveScope?.conversationId
  )
    return;
  const report = correspondence(db, value, [event.messageId]);
  if (!report || report.text !== event.text || report.echo) return;
  db.prepare('UPDATE messaging_outbox SET body = ? WHERE id = ?').run(
    JSON.stringify({ ...report, echo: { eventId: event.eventId, at: event.at } }),
    report.id,
  );
}
