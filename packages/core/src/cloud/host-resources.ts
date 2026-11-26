import type { Context } from '@deepseek-ai/cordis';
import type { BotHarnessCore } from '../plugin-types.js';
import { attachOperationalModule } from '../database/owner.js';
import { CloudConnections } from './connections.js';
import { CloudWork } from './work.js';

export function createCloudResources(
  ctx: Context,
  core: Pick<
    BotHarnessCore,
    'operationalDatabase' | 'externalMessaging' | 'registry' | 'cloudConnections' | 'cloudWork'
  >,
) {
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
  return { cloudConnections, cloudWork };
}
