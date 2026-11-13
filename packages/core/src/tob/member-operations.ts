import type { BridgeMethods } from '../bridge/methods.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { BotCreationService } from '../bots/creation.js';
import { createTobBotCreationOperations } from './cli-bot-create.js';
import { createTobBotProfileOperations } from './cli-bot-profile-operations.js';
import type { PrepareTobOperation } from './cli-operations.js';
import { TobError } from './service.js';

export function createMemberTobOperations(deps: {
  bridge: BridgeMethods;
  registry: PersonaBotRegistry;
  creations: BotCreationService;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const creation = createTobBotCreationOperations(deps);
  const profile = createTobBotProfileOperations({ ...deps, bridge: () => deps.bridge });
  return async (command, args, signal) => {
    if (typeof args.slug === 'string' && !deps.registry.get(args.slug))
      throw new TobError('bot-not-found');
    const prepared =
      (await creation(command, args, signal)) ?? (await profile(command, args, signal));
    if (prepared) return prepared;
    if (
      command !== 'cli' ||
      !Array.isArray(args.argv) ||
      !args.argv.every((arg) => typeof arg === 'string')
    )
      throw new TobError('permission-required');
    const [name, target, ...rest] = args.argv;
    if (rest.length || target?.startsWith('-')) throw new TobError('permission-required');
    const read = () => {
      switch (name) {
        case 'list':
          return deps.bridge.list({});
        case 'show':
          return deps.bridge.get({ slug: target });
        case 'channels':
          return deps.bridge.channels({});
        case 'channel':
          return deps.bridge.channelGet({ channelId: target });
        case 'activity':
          return deps.bridge.humanAttention({});
        case 'activity-status':
          return deps.bridge.humanAttentionStatus({ messageCounts: true });
        case 'activity-overview':
          return deps.bridge.activitySnapshot({});
        case 'session-ids':
          return deps.bridge.botSessionIds({});
        default:
          throw new TobError('permission-required');
      }
    };
    return {
      async run(guard) {
        guard();
        const result = await read();
        if (!result.ok) throw new TobError(result.error.code);
        return result.value;
      },
    };
  };
}
