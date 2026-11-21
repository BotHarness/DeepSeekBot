import { unwrap } from '../../bridge/rpc-result.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import type { BrowserBridgeMethods } from './methods.js';

export function browserAccessSet(
  methods: BrowserBridgeMethods,
  slug: string,
  enabled: boolean,
): { bot: PersonaBotDetail } {
  return unwrap(methods.browserAccessSet({ slug, enabled }));
}

export function browserProfileSet(
  methods: BrowserBridgeMethods,
  slug: string,
  profile: string,
): { bot: PersonaBotDetail } {
  return unwrap(methods.browserProfileSet({ slug, profile }));
}
