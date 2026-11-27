import type { Context } from '@deepseek-ai/cordis';

import type { BotHarnessCore } from '../../plugin.js';
import type { CloudConnections } from '../../cloud/connections.js';
import type { CloudWork } from '../../cloud/work.js';
import { createCloudProvider } from '../../cloud/provider.js';
import { createCloudWorkTool } from '../../cloud/work-tool.js';

type CloudOwner = Pick<
  BotHarnessCore,
  | 'operationalDatabase'
  | 'externalMessaging'
  | 'hostTools'
  | 'contributeBotAgentSetup'
  | 'ownership'
>;

export function installCloudWorkLifetime(
  ctx: Context,
  core: Pick<CloudOwner, 'hostTools'>,
  cloudWork: CloudWork,
): void {
  ctx.effect(() => () => cloudWork.close(), 'botharness: cloud work');
  core.hostTools.add('cloud_work');
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
