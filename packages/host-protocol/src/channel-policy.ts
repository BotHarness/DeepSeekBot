export const CHANNEL_ACTIONS = [
  'addMembers',
  'post',
  'mentionAll',
  'wakeBot',
  'addBots',
  'seeApprovals',
  'decideApprovals',
  'editDetails',
] as const;

export const CHANNEL_APPROVAL_ACTIONS = ['seeApprovals', 'decideApprovals'] as const;

export type ChannelAction = (typeof CHANNEL_ACTIONS)[number];
export type ChannelPolicyEffect = 'allow' | 'deny' | 'inherit';
const approvalPolicies = {
  legacy: { mode: 'legacy', see: 'eligible-deciders', decide: 'bot-owner-or-opaque-tools' },
  channel: {
    mode: 'channel',
    see: 'channel-policy-or-eligible-deciders',
    decide: 'channel-policy-or-bot-owner-or-opaque-tools',
  },
} as const;

export type ChannelApprovalPolicy = (typeof approvalPolicies)[keyof typeof approvalPolicies];

export function channelApprovalPolicy(mode: unknown): ChannelApprovalPolicy {
  return approvalPolicies[mode === 'channel' ? 'channel' : 'legacy'];
}

export interface ChannelPolicy {
  readonly version: 1;
  readonly approvalMode?: ChannelApprovalPolicy['mode'] | undefined;
  readonly everyone: Readonly<Record<ChannelAction, ChannelPolicyEffect>>;
  readonly overrides: readonly {
    roleId: string;
    actions: Readonly<Partial<Record<ChannelAction, ChannelPolicyEffect>>>;
  }[];
}

export const DEFAULT_CHANNEL_POLICY: ChannelPolicy = {
  version: 1,
  everyone: {
    addMembers: 'allow',
    post: 'allow',
    mentionAll: 'allow',
    addBots: 'deny',
    editDetails: 'deny',
    wakeBot: 'allow',
    seeApprovals: 'allow',
    decideApprovals: 'deny',
  },
  overrides: [],
};
