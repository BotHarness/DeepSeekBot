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
export interface ChannelPolicy {
  readonly version: 1;
  readonly approvalMode?: 'legacy' | 'channel' | undefined;
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
