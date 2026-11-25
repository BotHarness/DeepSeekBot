export interface ChannelStewardTransfer {
  botSlug: string;
  botName: string;
}

export function isChannelStewardTransfer(value: unknown): value is ChannelStewardTransfer {
  if (typeof value !== 'object' || value === null) return false;
  const { botSlug, botName } = value as Partial<ChannelStewardTransfer>;
  return (
    typeof botSlug === 'string' &&
    botSlug.length > 0 &&
    typeof botName === 'string' &&
    botName.trim().length > 0
  );
}
