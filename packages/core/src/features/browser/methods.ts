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

export type BrowserBridgeMethods = {
  browserAccessSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  browserProfileSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
};

export interface BrowserBridgeDeps {
  browserAccess?: { changed(slug: string): void };
  browserProfile?: { changed(slug: string): void };
}

export function createBrowserBridgeMethods(
  deps: BrowserBridgeDeps & {
    registry: Pick<PersonaBotRegistry, 'setBrowserAccess' | 'setBrowserProfile'>;
  },
  detailOf: PersonaBotDetailProjection,
): BrowserBridgeMethods {
  return {
    browserAccessSet(payload) {
      const slug = asSlug(payload);
      const enabled = asObject(payload)['enabled'];
      if (slug === undefined || typeof enabled !== 'boolean') {
        return invalidInput('slug and enabled are required');
      }
      const result = deps.registry.setBrowserAccess(slug, enabled);
      if (!result.ok) return unknownBot(slug);
      deps.browserAccess?.changed(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    browserProfileSet(payload) {
      const slug = asSlug(payload);
      const profile = asObject(payload)['profile'];
      if (slug === undefined || typeof profile !== 'string') {
        return invalidInput('slug and profile are required');
      }
      const trimmed = profile.trim();
      const normalized = trimmed === 'default' ? '' : trimmed;
      if (normalized === '.' || normalized === '..') {
        return invalidInput(
          'Profile names "." and ".." are reserved; choose a named profile or default',
        );
      }
      if (normalized !== '' && !/^[a-zA-Z0-9._-]{1,40}$/u.test(normalized)) {
        return invalidInput('profile must use letters, digits, dot, dash, or underscore (max 40)');
      }
      const result = deps.registry.setBrowserProfile(slug, normalized);
      if (!result.ok) return unknownBot(slug);
      deps.browserProfile?.changed(slug);
      return { ok: true, value: detailOf(result.record) };
    },
  };
}
