import { type ChannelMessage } from '../../store.js';

export function leadingBotMentions(message: ChannelMessage):
  | {
      mentions: (
        | NonNullable<ChannelMessage['mentions']>[number]
        | NonNullable<ChannelMessage['humanMentions']>[number]
      )[];
      text: string;
    }
  | undefined {
  if (message.author.kind !== 'bot' && message.author.kind !== 'human') return undefined;
  const mentions = [...(message.mentions ?? []), ...(message.humanMentions ?? [])].sort(
    (left, right) => left.start - right.start,
  );
  if (mentions.length === 0) return undefined;
  let cursor = 0;
  for (const mention of mentions) {
    if (
      mention.start !== cursor ||
      message.body.slice(mention.start, mention.end) !== '@' + mention.label
    )
      return undefined;
    cursor = mention.end;
    if (message.body[cursor] === ' ') cursor += 1;
    else if (cursor < message.body.length) return undefined;
  }
  return { mentions, text: message.body.slice(cursor) };
}
