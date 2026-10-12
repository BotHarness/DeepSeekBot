import type { BotHarnessTranslate } from './locale.js';

export function externalPlatformLabel(platform: string, t: BotHarnessTranslate): string {
  if (platform === 'feishu') return t('im.platform.feishu');
  if (platform === 'slack') return 'Slack';
  if (platform === 'discord') return 'Discord';
  if (platform === 'weixin') return t('im.platform.weixin');
  if (platform === 'qq') return 'QQ';
  return platform;
}

export function bridgeSourceLabel(
  origin: { platform: string; conversationName: string; accountName?: string },
  t: BotHarnessTranslate,
): string {
  const platform = externalPlatformLabel(origin.platform, t);
  if (origin.platform === 'qq' && origin.accountName?.trim())
    return `${platform} · ${origin.accountName} · ${origin.conversationName}`;
  return `${platform} ${origin.conversationName}`;
}

export function externalSenderLabel(
  origin: { platform: string; senderId: string; senderName?: string },
  t: BotHarnessTranslate,
): string {
  return (
    origin.senderName?.trim() ||
    (origin.platform === 'weixin' ? t('im.weixinUser') : origin.senderId)
  );
}
