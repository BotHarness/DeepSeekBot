import { router } from 'expo-router';
import { botSettings } from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';

import type { ApprovalPresetPort } from './approval-preset';

export function approvalPresetPort(
  client: HostClient,
  botSlug: string,
  manage: boolean,
): ApprovalPresetPort {
  const settings = botSettings(client, botSlug);
  return {
    load: () => settings.loadTemplates(),
    choose: (template) => settings.setTemplate(template),
    ...(manage
      ? {
          manage: () =>
            router.push({ pathname: '/bot/[slug]/workspace', params: { slug: botSlug } }),
        }
      : {}),
  };
}
