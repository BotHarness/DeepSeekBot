export type ChannelMessageAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'remote-bot'; hostId: string; slug: string }
  | { kind: 'bridged'; source: string }
  | { kind: 'system' };
