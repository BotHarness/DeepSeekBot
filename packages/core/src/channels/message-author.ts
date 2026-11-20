export type ChannelMessageAuthor =
  | { kind: 'human'; humanId?: string; displayName?: string; deleted?: boolean }
  | { kind: 'bot'; slug: string; displayName?: string }
  | { kind: 'remote-bot'; hostId: string; slug: string }
  | { kind: 'bridged'; source: string }
  | { kind: 'system' };
