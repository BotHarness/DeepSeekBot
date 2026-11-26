import { router } from 'expo-router';
import { botSettings, type BotSettings } from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';

import type { ApprovalPresetPort } from './approval-preset';
import {
  announceApprovalTemplateChange,
  onApprovalTemplateChange,
} from './approval-template-changes';

export function announcingTemplates(
  settings: BotSettings,
  client: HostClient,
  botSlug: string,
): BotSettings {
  return {
    ...settings,
    setTemplate: async (template) => {
      await settings.setTemplate(template);
      announceApprovalTemplateChange(client, botSlug);
    },
  };
}

export function approvalPresetPort(
  client: HostClient,
  botSlug: string,
  manage: boolean,
): ApprovalPresetPort {
  const settings = announcingTemplates(botSettings(client, botSlug), client, botSlug);
  return {
    load: () => settings.loadTemplates(),
    choose: (template) => settings.setTemplate(template),
    subscribe: (listener) => onApprovalTemplateChange(client, botSlug, listener),
    ...(manage
      ? {
          manage: () =>
            router.push({ pathname: '/bot/[slug]/workspace', params: { slug: botSlug } }),
        }
      : {}),
  };
}
