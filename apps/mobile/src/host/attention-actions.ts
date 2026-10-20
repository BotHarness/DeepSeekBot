import { HostAnswerInvalid } from './bot-settings';
import type { HostClient } from './client';
import { uuid } from './conversation';
import type { HumanAssignmentContext, HumanAttentionItem, HumanAttentionPage } from './wire';

export interface AttentionRef {
  id: string;
  botSlug: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export async function findAttentionItem(
  client: HostClient,
  ref: AttentionRef,
): Promise<HumanAttentionItem | undefined> {
  const page = await client.call<HumanAttentionPage>('humanAttention', {
    category: 'action',
    botSlug: ref.botSlug,
    limit: 100,
    ...(ref.id.startsWith('autoreject:') ? { kind: 'auto-rejection' } : {}),
  });
  return page.items.find((item) => item.id === ref.id);
}

export async function allowAutoRejectionOnce(client: HostClient, itemId: string): Promise<void> {
  const value = record(await client.call('toolAutoRejectionOverride', { itemId }));
  if (value?.['accepted'] !== true)
    throw new HostAnswerInvalid('The computer did not confirm the override.');
}

export async function decideJoinRequest(
  client: HostClient,
  channelId: string,
  requestId: string,
  accept: boolean,
): Promise<void> {
  const value = record(
    await client.call('channelGroupJoinDecide', { channelId, requestId, accept }),
  );
  const requests = record(value?.['channel'])?.['joinRequests'];
  const decided = Array.isArray(requests)
    ? requests.map(record).find((request) => request?.['id'] === requestId)
    : undefined;
  if (decided?.['status'] !== (accept ? 'accepted' : 'declined'))
    throw new HostAnswerInvalid('The computer did not confirm the decision.');
}

export async function loadAssignmentContext(
  client: HostClient,
  slug: string,
  sessionId: string,
  sourceEventId: string,
): Promise<HumanAssignmentContext> {
  const value = await client.call<{ context: HumanAssignmentContext }>('humanAssignmentContext', {
    slug,
    sessionId,
    sourceEventId,
  });
  return value.context;
}

export async function replyToAssignment(
  client: HostClient,
  slug: string,
  sessionId: string,
  sourceEventId: string,
  body: string,
  messageId: string = `human-${uuid()}`,
): Promise<{ id: string; at: string; body: string }> {
  const text = body.trim();
  const value = await client.call<{ message: unknown }>('channelSend', {
    channelId: `dm-${slug}`,
    body: text,
    messageId,
    assignmentReply: { sessionId, sourceEventId },
  });
  const message = record(value.message);
  const reply = record(message?.['assignmentReply']);
  if (
    message?.['id'] !== messageId ||
    message['body'] !== text ||
    record(message['author'])?.['kind'] !== 'human' ||
    reply?.['sessionId'] !== sessionId ||
    reply['sourceEventId'] !== sourceEventId
  )
    throw new HostAnswerInvalid('The computer did not confirm the reply.');
  const at = message['createdAt'] ?? message['at'];
  return { id: messageId, at: typeof at === 'string' ? at : new Date().toISOString(), body: text };
}
