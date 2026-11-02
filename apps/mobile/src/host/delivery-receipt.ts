import type { ConversationMessage } from './conversation';
import type { WireDeliveryState } from './wire';

export type ReceiptState = WireDeliveryState | 'missing';

export interface ReceiptRecipient {
  botSlug: string;
  state: ReceiptState;
}

export const RECEIPT_ORDER: readonly ReceiptState[] = [
  'handled',
  'running',
  'observed',
  'pending',
  'ignored',
  'retryable',
  'needs-repair',
  'missing',
];

export function receiptRecipients(message: ConversationMessage): ReceiptRecipient[] {
  if (message.author !== 'human' || message.delivery !== 'committed') return [];
  const deliveries = message.deliveries ?? [];
  const admitted = new Set(deliveries.map((delivery) => delivery.botSlug));
  const missing = [...new Set((message.mentions ?? []).map((mention) => mention.botSlug))]
    .filter((botSlug) => !admitted.has(botSlug))
    .map((botSlug) => ({ botSlug, state: 'missing' as const }));
  return [
    ...deliveries.map((delivery) => ({
      botSlug: delivery.botSlug,
      state: delivery.state,
    })),
    ...missing,
  ];
}

export function receiptGroups(
  recipients: readonly ReceiptRecipient[],
): { state: ReceiptState; recipients: ReceiptRecipient[] }[] {
  return RECEIPT_ORDER.flatMap((state) => {
    const members = recipients.filter((recipient) => recipient.state === state);
    return members.length === 0 ? [] : [{ state, recipients: members }];
  });
}

const readingSince = new Map<string, number>();

export function readingBots(
  messages: readonly ConversationMessage[],
): Map<string, readonly string[]> {
  const claimed = new Set<string>();
  const result = new Map<string, readonly string[]>();
  const live = new Set<string>();
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.delivery === 'pending' || message.delivery === 'failed') continue;
    const readers = (message.deliveries ?? [])
      .filter(
        (delivery) =>
          delivery.state === 'running' &&
          delivery.botSlug !== message.bot &&
          !claimed.has(delivery.botSlug),
      )
      .map((delivery) => delivery.botSlug);
    if (readers.length === 0) continue;
    for (const botSlug of readers) {
      claimed.add(botSlug);
      const key = `${message.id}:${botSlug}`;
      live.add(key);
      if (!readingSince.has(key)) readingSince.set(key, Date.now());
    }
    const since = (botSlug: string) => readingSince.get(`${message.id}:${botSlug}`) ?? 0;
    result.set(
      message.id,
      readers.sort((left, right) => since(right) - since(left)),
    );
  }
  for (const key of readingSince.keys()) if (!live.has(key)) readingSince.delete(key);
  return result;
}
