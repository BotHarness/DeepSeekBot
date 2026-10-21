import type { SavedHost } from './hosts';
import type { PushTarget } from './push';
import type { ApprovalChoice, DecisionResult, RequestRef } from './requests';

export const APPROVAL_CATEGORY = 'tool-approval';
export const APPROVAL_ONCE_CATEGORY = 'tool-approval-once';
export const DEVICE_PAIRED_CATEGORY = 'device-paired';
export const REMOVE_DEVICE_ACTION = 'remove-device';

export const APPROVAL_ACTIONS: Readonly<Record<string, ApprovalChoice>> = {
  always: 'allowed-always-tool',
  approve: 'allowed-once',
  reject: 'rejected',
};

export type PushDecision = DecisionResult | 'failed';

export type ApprovalButton = 'always' | 'approve' | 'reject' | typeof REMOVE_DEVICE_ACTION;

export async function registerApprovalCategories(
  set: (identifier: string, buttons: readonly ApprovalButton[]) => Promise<unknown>,
): Promise<void> {
  await set(APPROVAL_CATEGORY, ['always', 'approve', 'reject']);
  await set(APPROVAL_ONCE_CATEGORY, ['approve', 'reject']);
  await set(DEVICE_PAIRED_CATEGORY, [REMOVE_DEVICE_ACTION]);
}

export async function removeFromPush(
  hosts: readonly SavedHost[],
  target: PushTarget,
  action: string | undefined,
  remove: (host: SavedHost, deviceId: string) => Promise<'removed' | 'unreachable'>,
): Promise<'removed' | 'unreachable' | 'failed' | undefined> {
  if (
    action !== REMOVE_DEVICE_ACTION ||
    target.kind !== DEVICE_PAIRED_CATEGORY ||
    target.deviceId === undefined
  )
    return undefined;
  const host = hosts.find((entry) => entry.hostId === target.hostId);
  if (host === undefined) return 'failed';
  return remove(host, target.deviceId);
}

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
