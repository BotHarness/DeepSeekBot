import type { SavedHost } from './hosts';
import type { PushTarget } from './push';
import type { ApprovalChoice, DecisionResult, RequestRef } from './requests';

export const APPROVAL_CATEGORY = 'tool-approval';
export const APPROVAL_ONCE_CATEGORY = 'tool-approval-once';

export const APPROVAL_ACTIONS: Readonly<Record<string, ApprovalChoice>> = {
  always: 'allowed-always-exact',
  approve: 'allowed-once',
  reject: 'rejected',
};

export type PushDecision = DecisionResult | 'failed';

export async function decideFromPush(
  hosts: readonly SavedHost[],
  target: PushTarget,
  action: string,
  decide: (
    host: SavedHost,
    route: string,
    ref: RequestRef,
    outcome: ApprovalChoice,
  ) => Promise<DecisionResult>,
): Promise<PushDecision | undefined> {
  const outcome = APPROVAL_ACTIONS[action];
  if (
    outcome === undefined ||
    target.kind !== APPROVAL_CATEGORY ||
    target.botSlug === undefined ||
    target.channelId === undefined ||
    target.messageId === undefined
  )
    return undefined;
  const host = hosts.find((entry) => entry.hostId === target.hostId);
  if (host === undefined) return 'failed';
  const ref = { channelId: target.channelId, messageId: target.messageId, botSlug: target.botSlug };
  for (const route of host.routes) {
    try {
      return await decide(host, route, ref, outcome);
    } catch {}
  }
  return 'failed';
}
