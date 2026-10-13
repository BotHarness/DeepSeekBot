import type { BotAttentionItem } from './store.js';

export type InboxSection = 'active' | 'snoozed' | 'done';

export const INBOX_SECTIONS: readonly InboxSection[] = ['active', 'snoozed', 'done'];

export function inboxSection(item: BotAttentionItem): InboxSection {
  if (item.state === 'handled' || item.state === 'ignored') return 'done';
  if (item.state === 'snoozed') return 'snoozed';
  return 'active';
}

function newest(left: BotAttentionItem, right: BotAttentionItem): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function returning(left: BotAttentionItem, right: BotAttentionItem): number {
  return (
    Date.parse(left.snoozedUntil ?? left.createdAt) -
      Date.parse(right.snoozedUntil ?? right.createdAt) || newest(left, right)
  );
}

export function sortInboxSection(
  section: InboxSection,
  items: readonly BotAttentionItem[],
): BotAttentionItem[] {
  return [...items].sort(section === 'snoozed' ? returning : newest);
}

export function inboxSections(
  items: readonly BotAttentionItem[],
): Record<InboxSection, BotAttentionItem[]> {
  const sections: Record<InboxSection, BotAttentionItem[]> = { active: [], snoozed: [], done: [] };
  for (const item of items) sections[inboxSection(item)].push(item);
  for (const section of INBOX_SECTIONS)
    sections[section] = sortInboxSection(section, sections[section]);
  return sections;
}

export function openInboxCount(items: readonly BotAttentionItem[]): number {
  return items.filter((item) => inboxSection(item) === 'active').length;
}
