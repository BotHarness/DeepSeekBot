import type { HumanContext } from '../../humans/context.js';
import type { BridgeMethods } from '../../bridge/methods.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { BotCreationService } from '../../bots/creation.js';
import { createTobBotCreationOperations } from './cli-bot-create.js';
import { createTobBotProfileOperations } from './cli-bot-profile-operations.js';
import { createTobMemoryEditOperations } from './cli-memory-edit-operations.js';
import type { MemoryService } from '../../memory/service.js';
import type { PrepareTobOperation } from '../../kernel/tob-cli-operations.js';
import { TobError } from '../../tob/service.js';

export function createMemberTobOperations(deps: {
  human: HumanContext;
  bridge: BridgeMethods;
  registry: PersonaBotRegistry;
  creations: BotCreationService;
  memory?: () => MemoryService | undefined;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const creation = createTobBotCreationOperations(deps);
  const profile = createTobBotProfileOperations({
    ...deps,
    human: () => deps.human,
    bridge: () => deps.bridge,
  });
  const memory = createTobMemoryEditOperations({
    registry: deps.registry,
    memory: () => deps.memory?.(),
    human: () => deps.human,
    isProtectedBot: deps.isProtectedBot,
  });
  return async (command, args, signal) => {
    const authorizeCreation = () => {
      if (command !== 'create') return;
      const result = deps.bridge.createLookup(args);
      if (!result.ok) throw new TobError(result.error.code);
    };
    authorizeCreation();
    if (typeof args.slug === 'string' && !deps.registry.get(args.slug))
      throw new TobError('bot-not-found');
    const prepared =
      (await creation(command, args, signal)) ??
      (await profile(command, args, signal)) ??
      (await memory(command, args, signal));
    if (prepared)
      return {
        ...prepared,
        run(guard, beforeEffect) {
          authorizeCreation();
          return prepared.run(guard, beforeEffect);
        },
      };
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
        case undefined:
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
