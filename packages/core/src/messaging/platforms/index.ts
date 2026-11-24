import { discordProfile } from './discord.js';
import { feishuProfile } from './feishu.js';
import { qqProfile } from './qq.js';
import { slackProfile } from './slack.js';
import {
  messagingPlatformIds,
  type DshImPlatformProfile,
  type MessagingPlatformId,
} from './types.js';
import { weixinProfile } from './weixin.js';

export {
  messagingPlatformIds,
  type DshImPlatformProfile,
  type MessagingPlatformId,
} from './types.js';

const profiles: { [Id in MessagingPlatformId]: DshImPlatformProfile<Id> } = {
  feishu: feishuProfile,
  slack: slackProfile,
  discord: discordProfile,
  weixin: weixinProfile,
  qq: qqProfile,
};

export function isMessagingPlatform(value: unknown): value is MessagingPlatformId {
  return typeof value === 'string' && (messagingPlatformIds as readonly string[]).includes(value);
}

export function messagingPlatform(id: MessagingPlatformId): DshImPlatformProfile {
  return profiles[id];
}
