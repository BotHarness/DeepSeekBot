import type { HumanAttentionItem } from './store.js';

export type HumanInboxSnoozeChoice = 'hour' | 'evening' | 'tomorrow' | 'week';

export const HUMAN_INBOX_SNOOZE_CHOICES: readonly HumanInboxSnoozeChoice[] = [
  'hour',
  'evening',
  'tomorrow',
  'week',
];

export function humanInboxSnoozeUntil(choice: HumanInboxSnoozeChoice, now: Date): Date | undefined {
  if (choice === 'hour') return new Date(now.getTime() + 60 * 60 * 1000);
  const at = new Date(now);
  if (choice === 'evening') {
    at.setHours(18, 0, 0, 0);
    return at.getTime() > now.getTime() + 30 * 60 * 1000 ? at : undefined;
  }
  at.setHours(9, 0, 0, 0);
  if (choice === 'tomorrow') at.setDate(at.getDate() + 1);
  else at.setDate(at.getDate() + ((8 - at.getDay()) % 7 || 7));
  return at;
}

export function canSnoozeHumanInboxItem(item: HumanAttentionItem): boolean {
  return (
    item.kind !== 'channel-unread' && item.category !== 'unread' && item.category !== 'handled'
  );
}
