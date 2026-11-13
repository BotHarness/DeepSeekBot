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
  return {
    ...registry,
    get: (slug) => own(registry.get(slug)),
    getHistorical: (slug) => own(registry.getHistorical(slug)),
    list: () => registry.list(human.humanId),
    listHistorical: () => registry.listHistorical(human.humanId),
    findByWorkspace: (path) => own(registry.findByWorkspace(path)),
    create: (input) => registry.create({ ...input, ownerHumanId: human.humanId }),
  };
}
