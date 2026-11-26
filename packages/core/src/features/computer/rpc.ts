import { unwrap } from '../../kernel/rpc-result.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import type { ComputerBridgeMethods } from './methods.js';

export function computerAccessSet(
  methods: ComputerBridgeMethods,
  slug: string,
  enabled: boolean,
): { bot: PersonaBotDetail } {
  return unwrap(methods.computerAccessSet({ slug, enabled }));
}

export const computerServiceRpc = {
  computerAccessSet(slug: string, enabled: boolean): { bot: PersonaBotDetail } {
    return computerAccessSet(this.methods, slug, enabled);
  },
} satisfies ThisType<{ methods: ComputerBridgeMethods }>;
