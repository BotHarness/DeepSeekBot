import type { BotMessageCausation, ChannelMessage } from '../channels/channel.js';
import type { NetworkBotContact } from './bot-contact-discovery.js';
import { isChannelMessage } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { PersonaBotRegistry } from '../bots/registry.js';

export interface NetworkBotMessage {
  id: string;
  at: string;
  senderBotSlug: string;
  recipientBotSlug: string;
  body: string;
  causation: BotMessageCausation;
}

export interface BotNetworkPort {
  contacts(): readonly NetworkBotContact[];
  send(hostId: string, message: NetworkBotMessage): Promise<void>;
}

export class BotNetworkDeliveryError extends Error {
  constructor(readonly code: 'unable-to-deliver' | 'delivery-unknown' | 'network-denied') {
    super(code);
  }
}

export function receivedNetworkMessage(hostId: string, message: NetworkBotMessage): ChannelMessage {
  return {
    id: message.id,
    at: message.at,
    author: { kind: 'remote-bot', hostId, slug: message.senderBotSlug },
    body: message.body,
    botCausation: {
      rootSourceEventId: message.causation.rootSourceEventId,
      parentSourceEventId: message.causation.parentSourceEventId,
      hop: message.causation.hop,
    },
  };
}

export async function receiveNetworkBotDm(
  owners: {
    registry: PersonaBotRegistry;
    channels: ChannelStore;
    admitBotDmMessage(channelId: string, messageId: string): void;
  },
  sender: NetworkBotContact,
  input: NetworkBotMessage,
): Promise<void> {
  if (sender.botSlug !== input.senderBotSlug) throw new Error('network-sender-mismatch');
  const recipient = owners.registry.get(input.recipientBotSlug);
  if (recipient === undefined || recipient.paused === true)
    throw new Error('network-recipient-unavailable');
  const message = receivedNetworkMessage(sender.hostId, input);
  if (
    !isChannelMessage(message) ||
    !message.body.trim() ||
    message.body.length > 20_000 ||
    message.id.length > 128 ||
    !Number.isFinite(Date.parse(message.at))
  )
    throw new Error('network-message-invalid');
  const channel = owners.channels.getOrCreateRemoteBotDm(recipient.slug, {
    hostId: sender.hostId,
    botSlug: sender.botSlug,
    displayName: sender.displayName.slice(0, 128),
    ...(sender.hostKey === undefined ? {} : { hostKey: sender.hostKey }),
  });
  const result = await owners.channels.appendMessageOnce(channel.id, message);
  if (result.status === 'missing' || result.status === 'conflict')
    throw new Error(`network-message-${result.status}`);
  owners.admitBotDmMessage(channel.id, message.id);
}
