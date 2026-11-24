import { isValidSlug } from '../bots/slug.js';

export interface ChannelStewardTransfer {
  botSlug: string;
  botName: string;
}

export function isChannelStewardTransfer(value: unknown): value is ChannelStewardTransfer {
  if (typeof value !== 'object' || value === null) return false;
  const { botSlug, botName } = value as Partial<ChannelStewardTransfer>;
  return (
    typeof botSlug === 'string' &&
    isValidSlug(botSlug) &&
    typeof botName === 'string' &&
    botName.trim().length > 0
  );
}
