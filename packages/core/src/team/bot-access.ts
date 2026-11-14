import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';

export const botOwner = (bot: PersonaBotRecord): string =>
  bot.ownerHumanId ?? OWNER_HUMAN_CONTEXT.humanId;

export function ownsBot(human: HumanContext, bot: PersonaBotRecord | undefined): boolean {
  return bot !== undefined && botOwner(bot) === human.humanId;
}

export function privateBotRegistry(
  registry: PersonaBotRegistry,
  human: HumanContext,
): PersonaBotRegistry {
  const own = (bot: PersonaBotRecord | undefined) => (ownsBot(human, bot) ? bot : undefined);
  const scoped = {
    get: (slug) => own(registry.get(slug)),
    getHistorical: (slug) => own(registry.getHistorical(slug)),
    list: () => registry.list(human.humanId),
    listHistorical: () => registry.listHistorical(human.humanId),
    findByWorkspace: (path) => own(registry.findByWorkspace(path)),
    create: (input) => registry.create({ ...input, ownerHumanId: human.humanId }),
    createFromGit: (input, authorize) =>
      registry.createFromGit({ ...input, ownerHumanId: human.humanId }, authorize),
    createFromFiles: (input, authorize) =>
      registry.createFromFiles({ ...input, ownerHumanId: human.humanId }, authorize),
    remove: (slug, options) =>
      ownsBot(human, registry.getHistorical(slug)) && registry.remove(slug, options),
    memoryDirFor: (slug) =>
      own(registry.getHistorical(slug)) ? registry.memoryDirFor(slug) : undefined,
    retainedRecordBody: (slug) =>
      own(registry.getHistorical(slug)) ? registry.retainedRecordBody(slug) : undefined,
  } satisfies Pick<
    PersonaBotRegistry,
    | 'get'
    | 'getHistorical'
    | 'list'
    | 'listHistorical'
    | 'findByWorkspace'
    | 'create'
    | 'createFromGit'
    | 'createFromFiles'
    | 'remove'
    | 'memoryDirFor'
    | 'retainedRecordBody'
  >;
  const mutations: ReadonlySet<PropertyKey> = new Set([
    'update',
    'setMemoryDir',
    'setAppearance',
    'setBanner',
    'setPrimaryColor',
    'setPaused',
    'setComputerAccess',
    'setBrowserAccess',
    'setBrowserProfile',
    'setApprovalTemplate',
    'setVoice',
    'setAsr',
    'setMarketplaceListing',
    'setPromptSettings',
    'setStandingLimits',
    'inheritModel',
    'applyModelPreset',
    'migrateLegacyModel',
    'customizeModelPlan',
    'setAssignmentModels',
    'setModelPlan',
  ]);
  return new Proxy(registry, {
    get(target, key, receiver) {
      if (mutations.has(key)) {
        const operation: unknown = Reflect.get(target, key, receiver);
        if (typeof operation === 'function')
          return (slug: string, ...args: unknown[]) =>
            ownsBot(human, registry.get(slug))
              ? Reflect.apply(operation, target, [slug, ...args])
              : { ok: false, reason: 'not-found' };
      }
      return Reflect.has(scoped, key)
        ? Reflect.get(scoped, key)
        : Reflect.get(target, key, receiver);
    },
  });
}
