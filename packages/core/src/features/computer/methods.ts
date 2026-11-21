import {
  asObject,
  asSlug,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';

export interface ComputerBridgeMethods {
  computerAccessSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
}

export interface ComputerBridgeDeps {
  computerAccess?: { changed(slug: string): void };
}

export function createComputerBridgeMethods(
  deps: ComputerBridgeDeps & { registry: Pick<PersonaBotRegistry, 'setComputerAccess'> },
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
): ComputerBridgeMethods {
  return {
    computerAccessSet(payload) {
      const slug = asSlug(payload);
      const enabled = asObject(payload)['enabled'];
      if (slug === undefined || typeof enabled !== 'boolean') {
        return invalidInput('slug and enabled are required');
      }
      const result = deps.registry.setComputerAccess(slug, enabled);
      if (!result.ok) return unknownBot(slug);
      deps.computerAccess?.changed(slug);
      return { ok: true, value: detailOf(result.record) };
    },
  };
}
