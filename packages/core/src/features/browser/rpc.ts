import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
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

export const browserServiceRpc = {
  browserAccessSet(slug: string, enabled: boolean): { bot: PersonaBotDetail } {
    return browserAccessSet(this.methods, slug, enabled);
  },

  browserProfileSet(slug: string, profile: string): { bot: PersonaBotDetail } {
    return browserProfileSet(this.methods, slug, profile);
  },
} satisfies ThisType<BridgeRpcReceiver>;
