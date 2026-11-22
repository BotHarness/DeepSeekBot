import type { ConversationReaction, ConversationMessage } from './conversation-contract';

export const LOCAL_HUMAN = 'local-human';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const;

export const MENU_REACTIONS = [
  ...QUICK_REACTIONS,
  '🙏',
  '🔥',
  '💯',
  '😮',
  '😢',
  '👎',
  '🙌',
  '🤔',
] as const;

export function reactedByMe(reaction: ConversationReaction): boolean {
  return reaction.actors.some((actor) => actor.kind === 'human' && actor.id === LOCAL_HUMAN);
}

export function toggledReactions(
  reactions: readonly ConversationReaction[] | undefined,
  emoji: string,
  active: boolean,
): ConversationReaction[] {
  const me = { kind: 'human' as const, id: LOCAL_HUMAN };
  const current = [...(reactions ?? [])];
  const index = current.findIndex((reaction) => reaction.emoji === emoji);
  if (!active) {
    if (index === -1) return current;
    const actors = current[index]!.actors.filter(
      (actor) => actor.kind !== 'human' || actor.id !== LOCAL_HUMAN,
    );
    return actors.length === 0
      ? current.filter((_, position) => position !== index)
      : current.map((reaction, position) => (position === index ? { emoji, actors } : reaction));
  }
  if (index === -1) return [...current, { emoji, actors: [me] }];
  if (reactedByMe(current[index]!)) return current;
  return current.map((reaction, position) =>
    position === index ? { emoji, actors: [...reaction.actors, me] } : reaction,
  );
}

export function reactable(message: ConversationMessage): boolean {
  return (
    message.author !== 'system' &&
    message.revision !== undefined &&
    message.delivery === 'committed' &&
    message.card === undefined &&
    message.activity === undefined
  );
}
