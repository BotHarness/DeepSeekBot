import type { ChannelMessage, ChannelReaction } from './store.js';

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'] as const;

const LOCAL_HUMAN = 'local-human';

export function reactedByMe(reaction: ChannelReaction): boolean {
  return reaction.actors.some((actor) => actor.kind === 'human' && actor.id === LOCAL_HUMAN);
}

export function toggledReactions(
  reactions: readonly ChannelReaction[] | undefined,
  emoji: string,
  active: boolean,
): ChannelReaction[] {
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

export function reactableMessage(message: ChannelMessage): boolean {
  return (
    message.author.kind !== 'system' &&
    message.botDmAction === undefined &&
    message.botChannelPost === undefined &&
    message.memoryCommit === undefined &&
    message.channelRevision !== undefined &&
    message.pending !== true &&
    message.streaming !== true &&
    message.failed === undefined &&
    message.contentPurged !== true
  );
}
