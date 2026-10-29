export type ChatPlace =
  | { kind: 'dm'; slug: string | undefined }
  | { kind: 'channel'; channelId: string | undefined };
