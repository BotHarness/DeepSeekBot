import {
  CHANNEL_APPROVAL_ACTIONS,
  DEFAULT_CHANNEL_POLICY,
} from '@botharness/host-protocol/channel-policy';
import { readChannel } from './channel-management';
import { record } from './host-answer';

export type ChannelApprovalKey = (typeof CHANNEL_APPROVAL_ACTIONS)[number];
export type ChannelApprovalChoice = 'allow' | 'deny';

export interface ChannelApprovalRules {
  readonly manager: boolean;
  readonly mode: 'legacy' | 'channel';
  readonly see: ChannelApprovalChoice;
  readonly decide: ChannelApprovalChoice;
  readonly policy: Record<string, unknown>;
  readonly revision: string | undefined;
}

type HostCall = Parameters<typeof readChannel>[0];

function choice(value: unknown, key: ChannelApprovalKey): ChannelApprovalChoice {
  return value === 'allow' || value === 'deny'
    ? value
    : DEFAULT_CHANNEL_POLICY.everyone[key] === 'allow'
      ? 'allow'
      : 'deny';
}

export async function readChannelApprovalRules(
  host: HostCall,
  channelId: string,
): Promise<ChannelApprovalRules | undefined> {
  const answer = await readChannel(host, channelId);
  const policy = record(answer['policy']);
  const role = answer['role'];
  if (policy === undefined || (role !== 'owner' && role !== 'admin' && role !== 'member'))
    return undefined;
  const everyone = record(policy['everyone']);
  const revision = answer['policyRevision'];
  return {
    manager: role !== 'member',
    mode: policy['approvalMode'] === 'legacy' ? 'legacy' : 'channel',
    see: choice(everyone?.['seeApprovals'], 'seeApprovals'),
    decide: choice(everyone?.['decideApprovals'], 'decideApprovals'),
    policy,
    revision: typeof revision === 'string' && revision.length > 0 ? revision : undefined,
  };
}

export async function writeChannelPolicy(
  host: HostCall,
  channelId: string,
  policy: Record<string, unknown>,
  expectedRevision?: string,
): Promise<void> {
  await host.call('channelPolicySet', {
    channelId,
    policy,
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
}

export async function setChannelApprovalRule(
  host: HostCall,
  channelId: string,
  rules: ChannelApprovalRules,
  key: ChannelApprovalKey,
  value: ChannelApprovalChoice,
): Promise<void> {
  const everyone = record(rules.policy['everyone']) ?? {};
  await writeChannelPolicy(
    host,
    channelId,
    { ...rules.policy, approvalMode: 'channel', everyone: { ...everyone, [key]: value } },
    rules.revision,
  );
}
