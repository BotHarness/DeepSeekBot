import { projectBridgeMessage } from '../messaging/channel-target.js';
import type { ExternalSource } from '../messaging/inbound.js';
import { durableQuotes } from './quotes.js';
import { isChannelMessage, type ChannelMessage } from './channel.js';

export function parseMessage(
  value: string,
  body?: string,
  messageId?: string,
  channelId?: string,
): ChannelMessage | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    const external =
      typeof parsed === 'object' && parsed !== null && 'external' in parsed
        ? (parsed as { external: ExternalSource }).external
        : undefined;
    const payload =
      external && body !== undefined
        ? projectBridgeMessage(external, body, channelId)
        : body === undefined
          ? parsed
          : { ...(parsed as object), body };
    const candidate = messageId === undefined ? payload : { ...(payload as object), id: messageId };
    return isChannelMessage(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function sourceKind(message: ChannelMessage): string {
  return message.author.kind === 'human'
    ? 'human-message'
    : message.author.kind === 'bot' || message.author.kind === 'remote-bot'
      ? 'bot-message'
      : 'system-message';
}

export function rawMessage(message: ChannelMessage): ChannelMessage {
  const result = durableQuotes({ ...message });
  delete result.grantRequestResolved;
  delete result.replyToPreview;
  delete result.botChannelPostPreview;
  delete result.noticeOrigin;
  delete result.deliveries;
  delete result.humanReceipts;
  delete result.reactions;
  delete result.channelRevision;
  return result;
}

export function eventPayload(message: ChannelMessage): string {
  const { body: _body, ...envelope } = rawMessage(message);
  return JSON.stringify(envelope);
}
