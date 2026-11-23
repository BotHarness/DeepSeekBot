import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import type { BotRuntimeOptions } from '../../runtime/bot-runtime-types.js';

export async function pickSessionGroup(
  groups: BotRuntimeOptions['groupFallback'],
  botSlug: string,
  choice: Extract<SessionModelChoice, { kind: 'group' }>,
  attempted?: ReadonlySet<string>,
): Promise<import('../../models/group-fallback.js').MixedGroupPick> {
  const mixed = await groups?.pickMixedAssignment?.(botSlug, choice.id, choice.effort, attempted);
  if (mixed !== undefined) return mixed;
  const native = await groups?.pick(botSlug, choice.id, choice.effort);
  if (native?.kind === 'exhausted') return native;
  if (native?.kind !== 'route') return { kind: 'unavailable' };
  const { route, switchReason } = native;
  return {
    kind: 'target',
    target: { kind: 'route', route },
    ...(switchReason === undefined ? {} : { switchReason }),
  };
}
