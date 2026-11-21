import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore } from '../../plugin.js';
import { CloudConnections } from '../../cloud/connections.js';
import { CloudWork } from '../../cloud/work.js';
import { createCloudProvider } from '../../cloud/provider.js';
import { createCloudWorkTool } from '../../cloud/work-tool.js';
import { attachOperationalModule } from '../../database/owner.js';

type CloudOwner = Pick<
  BotHarnessCore,
  | 'operationalDatabase'
  | 'externalMessaging'
  | 'registry'
  | 'cloudConnections'
  | 'cloudWork'
  | 'hostTools'
  | 'contributeBotAgentSetup'
  | 'ownership'
>;

export function apply(ctx: Context, core: CloudOwner) {
  const cloudConnections = new CloudConnections(
    attachOperationalModule(core.operationalDatabase, 'messaging'),
    () => ctx.get('credentials'),
    undefined,
    (phase, id) => ctx.logger.info('cloud-connection %j', { phase, id }),
  );
  core.cloudConnections = cloudConnections;
  const cloudWork = new CloudWork(
    attachOperationalModule(core.operationalDatabase, 'messaging'),
    cloudConnections,
    core.externalMessaging.inbound,
    (slug) => {
      const bot = core.registry.get(slug);
      return bot !== undefined && bot.paused !== true;
    },
    (phase, requestId) => ctx.logger.info('cloud-work %j', { phase, requestId }),
  );
  core.cloudWork = cloudWork;
  ctx.effect(() => () => cloudWork.close(), 'botharness: cloud work');
  core.hostTools.add('cloud_work');
  return { cloudConnections, cloudWork };
}

export function mount(
  ctx: Context,
  core: CloudOwner,
  cloudConnections: CloudConnections,
  cloudWork: CloudWork,
) {
  ctx.effect(
    () => () => {
      core.hostTools.delete('cloud_work');
    },
    'botharness: cloud work tool name',
  );
  ctx.effect(
    () =>
      core.contributeBotAgentSetup((agentCtx, agent, info) => {
        if (info.rootRole === 'orchestrator')
          agentCtx.tools.register(
            createCloudWorkTool(
              cloudWork,
              info.botSlug,
              (call) =>
                call.agent === agent &&
                ctx.agents.get(agent.id) === agent &&
                core.ownership.resolve(agent.session.id)?.botSlug === info.botSlug,
            ),
          );
      }),
    'botharness: cloud work tool',
  );
  ctx.effect(() => () => cloudConnections.close(), 'botharness: cloud connections');
  if (core.operationalDatabase.mode === 'ready')
    ctx.effect(() =>
      core.externalMessaging.register(
        createCloudProvider(cloudConnections, (phase, id, code) =>
          ctx.logger.info('cloud-messaging %j', { phase, id, code }),
        ),
      ),
    );
}
