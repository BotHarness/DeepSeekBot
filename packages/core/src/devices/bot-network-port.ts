import type { BotMessageCausation, BotNetworkMembership } from '../channels/channel.js';

export interface NetworkBotContact {
  membership?: BotNetworkMembership;
  hostKey?: string;
  hostId: string;
  botSlug: string;
  displayName: string;
  description?: string;
  device: { model: string | null; platform: string | null };
  capabilities: readonly string[];
}

export interface NetworkBotMessage {
  id: string;
  at: string;
  senderBotSlug: string;
  recipientBotSlug: string;
  body: string;
  causation: BotMessageCausation;
}

export type NetworkBotAvailability = 'available' | 'unavailable' | 'withdrawn' | 'bot-unavailable';

export interface BotNetworkPort {
  availability?(hostId: string, botSlug: string): NetworkBotAvailability;
  refresh?(): Promise<void>;
  contacts(): readonly NetworkBotContact[];
  membership?(hostId: string): Promise<'member' | 'withdrawn' | 'unavailable'>;
  send(hostId: string, message: NetworkBotMessage): Promise<void>;
}
