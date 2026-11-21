import { unwrap } from '../../bridge/rpc-result.js';
import type { PersonaBotDetail } from '../../bridge/methods.js';
import type { ComputerBridgeMethods } from './methods.js';

export function computerAccessSet(
  methods: ComputerBridgeMethods,
  slug: string,
  enabled: boolean,
): { bot: PersonaBotDetail } {
  return unwrap(methods.computerAccessSet({ slug, enabled }));
}
