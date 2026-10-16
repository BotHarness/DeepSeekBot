import type { ChannelMessage } from './store.js';

export interface MessageGroup {
  key: string;
  messages: ChannelMessage[];
}

export function groupChannelMessages(
  messages: readonly ChannelMessage[],
  breakAfter?: string,
): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const last = groups.at(-1);
    const first = last?.messages[0];
    const previous = last?.messages.at(-1);
    if (previous !== undefined && previous.id === breakAfter) {
      groups.push({ key: message.id, messages: [message] });
      continue;
    }
    const firstAt = first === undefined ? NaN : Date.parse(first.at);
    const previousAt = previous === undefined ? NaN : Date.parse(previous.at);
    const at = Date.parse(message.at);
    const sameAuthor =
      previous !== undefined &&
      previous.author.kind === message.author.kind &&
      (message.author.kind === 'human' ||
        (message.author.kind === 'bot' &&
          previous.author.kind === 'bot' &&
          previous.author.slug === message.author.slug) ||
        (message.author.kind === 'bridged' &&
          previous.author.kind === 'bridged' &&
          previous.author.source === message.author.source));
    const sameDay =
      Number.isFinite(at) &&
      Number.isFinite(previousAt) &&
      new Date(at).toDateString() === new Date(previousAt).toDateString();
    if (
      last !== undefined &&
      message.author.kind === 'system' &&
      message.subagentDispatch !== undefined &&
      previous?.author.kind === 'system' &&
      previous.subagentDispatch !== undefined &&
      sameDay &&
      at - firstAt <= 180_000
    ) {
      last.messages.push(message);
      continue;
    }
    if (message.botChannelPost !== undefined || previous?.botChannelPost !== undefined) {
      if (
        last !== undefined &&
        message.botChannelPost !== undefined &&
        previous?.botChannelPost?.channelId === message.botChannelPost.channelId &&
        sameAuthor &&
        sameDay
      )
        last.messages.push(message);
      else groups.push({ key: message.id, messages: [message] });
      continue;
    }
    if (
      last !== undefined &&
      sameAuthor &&
      message.bridgeOrigin === undefined &&
      previous?.bridgeOrigin === undefined &&
      message.botDmAction === undefined &&
      previous?.botDmAction === undefined &&
      message.botCreateAction === undefined &&
      previous?.botCreateAction === undefined &&
      sameDay &&
      last.messages.length < 8 &&
      at - previousAt >= 0 &&
      at - previousAt <= 15_000 &&
      at - firstAt <= 180_000
    ) {
      last.messages.push(message);
    } else {
      groups.push({ key: message.id, messages: [message] });
    }
  }
  return groups;
}
