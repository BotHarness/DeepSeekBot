import type { ConversationReaction } from '../../host/conversation';

export function shownReactions(
  shown: readonly ConversationReaction[],
  current: readonly ConversationReaction[],
): readonly ConversationReaction[] {
  const byEmoji = new Map(current.map((reaction) => [reaction.emoji, reaction]));
  const kept = shown.map((reaction) => byEmoji.get(reaction.emoji) ?? reaction);
  const known = new Set(shown.map((reaction) => reaction.emoji));
  const next = [...kept, ...current.filter((reaction) => !known.has(reaction.emoji))];
  return next.length === shown.length && next.every((reaction, index) => reaction === shown[index])
    ? shown
    : next;
}
