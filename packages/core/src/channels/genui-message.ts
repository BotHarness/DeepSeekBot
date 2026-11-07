import type { ChannelMessage, ChannelRecord } from './channel.js';
import { GenuiError, parseGenuiContent, validateGenuiMessageReply } from './genui.js';

export function assertGenuiMessage(
  channel: ChannelRecord,
  message: ChannelMessage,
  previous: readonly ChannelMessage[],
): void {
  if (message.genui !== undefined) {
    if (
      message.author.kind !== 'bot' ||
      channel.type !== 'dm' ||
      channel.botSlug !== message.author.slug ||
      !message.body.trim() ||
      message.genuiReply !== undefined
    )
      throw new GenuiError(
        'invalid-genui',
        'Reports require an explicit Bot message with a summary in its Human DM.',
      );
    const report = parseGenuiContent(message.genui);
    if (
      previous.some(
        (entry) => entry.genui?.snapshotId === report.snapshotId && entry.id !== message.id,
      )
    )
      throw new GenuiError('invalid-genui', 'A refreshed report needs a new snapshot identity.');
    if (
      report.predecessorMessageId !== undefined &&
      !previous.some(
        (entry) => entry.id === report.predecessorMessageId && entry.genui !== undefined,
      )
    )
      throw new GenuiError(
        'genui-unavailable',
        'The previous report is unavailable in this Channel.',
      );
  }
  if (message.genuiReply !== undefined) {
    const target = previous.find((entry) => entry.id === message.genuiReply?.messageId);
    if (
      message.author.kind !== 'human' ||
      target?.genui === undefined ||
      message.replyTo !== target.id
    )
      throw new GenuiError('genui-unavailable', 'The report is unavailable in this Channel.');
    validateGenuiMessageReply(parseGenuiContent(target.genui), message.genuiReply);
  }
}
