import {
  asObject,
  asSlug,
  invalidInput,
  unknownBot,
  type BridgeResult,
} from '../../kernel/method-utils.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import type { PersonaBotDetailProjection } from '../personabots/bot-details.js';

export type ComputerBridgeMethods = {
  computerAccessSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
};

export interface ComputerBridgeDeps {
  computerAccess?: { changed(slug: string): void };
}

export function createComputerBridgeMethods(
  deps: ComputerBridgeDeps & { registry: Pick<PersonaBotRegistry, 'setComputerAccess'> },
  detailOf: PersonaBotDetailProjection,
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
