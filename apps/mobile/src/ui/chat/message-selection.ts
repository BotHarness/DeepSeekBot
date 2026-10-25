import type { ConversationMessage } from '../../host/conversation';
export const SELECTION_LIMIT = 50;
export function toggleMessageSelection(
  ids: readonly string[],
  message: ConversationMessage,
): readonly string[] {
  if (message.delivery !== 'committed') return ids;
  if (ids.includes(message.id)) return ids.filter((id) => id !== message.id);
  return ids.length >= SELECTION_LIMIT ? ids : [...ids, message.id];
}
export function selectionText(
  ids: readonly string[],
  messages: readonly ConversationMessage[],
): string {
  const selected = new Set(ids);
  return messages
    .filter((m) => selected.has(m.id))
    .map((m) =>
      [m.body, ...m.attachments.map((a) => '[' + a.name + ']')].filter(Boolean).join('\n'),
    )
    .join('\n\n');
}
