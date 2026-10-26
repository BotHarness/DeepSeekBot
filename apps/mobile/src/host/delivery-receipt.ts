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
