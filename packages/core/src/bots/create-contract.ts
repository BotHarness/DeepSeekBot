export interface BotCreateInput {
  displayName: string;
  description?: string;
  tags?: string[];
  avatarPath?: string;
  soul?: string;
  coreMemory?: string;
  memoryLocation?: string;
}

export interface BotCreateOutcome {
  botId: string;
  displayName: string;
  dmChannelId: string;
  memoryDir: string;
  model: 'host-default' | 'set';
}

export const NEW_BOT_ID_PLACEHOLDER = '<new-bot-id>';

export const MAX_CREATED_BOT_NAME_LENGTH = 60;

export const MAX_CREATED_BOT_TAGS = 8;

export const MAX_CREATED_BOT_TAG_LENGTH = 32;

export const MAX_CREATED_BOT_BIO_LENGTH = 160;
