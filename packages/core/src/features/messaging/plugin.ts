import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore } from '../../plugin.js';
import type { createCoreStartup } from '../../diagnostics/core-startup.js';
import { createDshImProvider } from '../../messaging/dsh-im.js';
import { createOutboundMessaging } from '../../messaging/outbound.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import type { ChannelUserQuestions } from '../../channels/user-questions.js';

type Startup = Pick<ReturnType<typeof createCoreStartup>, 'enter'>;
type MessagingOwner = Pick<
  BotHarnessCore,
  'externalMessaging' | 'operationalDatabase' | 'channels'
>;

export function mountProviders(ctx: Context, core: MessagingOwner) {
  ctx.inject(['dshIm'], (child) => {
    for (const platform of ['feishu', 'slack', 'discord', 'weixin', 'qq'] as const) {
      const provider = createDshImProvider(child.get('dshIm'), platform);
      if (provider !== undefined) child.effect(() => core.externalMessaging.register(provider));
    }
  });
}

export function mountCleanup(ctx: Context, core: MessagingOwner) {
  ctx.effect(() => () => core.externalMessaging.close(), 'botharness: external messaging');
}

export function mountApprovals(
  ctx: Context,
  core: MessagingOwner,
  toolApproval: ChannelToolApproval,
) {
  ctx.effect(
    () => core.externalMessaging.approvals.attach(toolApproval, core.channels),
    'botharness: approved IM tool controls',
  );
}

export function mountQuestions(
  ctx: Context,
  core: MessagingOwner,
  userQuestions: ChannelUserQuestions,
) {
  if (core.operationalDatabase.mode === 'ready')
    ctx.effect(
      () => core.externalMessaging.questions.attach(userQuestions, core.channels),
      'botharness: checked IM question answers',
    );
}

export function apply(
  startup: Startup,
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  getBot: BotHarnessCore['registry']['get'],
  options: Omit<
    Parameters<typeof createOutboundMessaging>[0],
    'database' | 'recover' | 'isBotActive'
  >,
) {
  startup.enter('messaging', 'outbound');
  return createOutboundMessaging({
    ...options,
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    recover: operationalDatabase.mode === 'ready',
    isBotActive: (slug) => {
      const bot = getBot(slug);
      return operationalDatabase.mode === 'ready' && bot !== undefined && bot.paused !== true;
    },
  });
}
