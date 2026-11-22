import type {
  ChannelAssignmentSummary,
  HumanAssignmentContext,
  HumanAttentionItem,
  ProfileActivity,
  ProfileModelUsageRow,
  ProfileTokenBuckets,
  WireApprovalCard,
  WireAuthor,
  WireMessage,
} from './wire';

export interface WireHumanIdentity {
  humanId: string;
  defaultDisplayName: string | null;
  displayName: string;
  avatarVersion?: string;
  profileSetup?: 'pending';
}

export interface WireHumanAvatar {
  humanId: string;
  version: string;
  avatar: string;
}

export interface WireHumanAttentionItem extends HumanAttentionItem {
  kind:
    | 'group-join-request'
    | 'pairing-request'
    | 'user-question'
    | 'private-input'
    | 'takeover-request'
    | 'tool-approval'
    | 'auto-rejection'
    | 'workspace-grant-request'
    | 'bot-dm-message'
    | 'assignment-waiting-human'
    | 'assignment-blocked'
    | 'assignment-report'
    | 'bot-message-needs-repair'
    | 'channel-unread'
    | 'channel-reply'
    | 'channel-mention';
  author?: Extract<WireAuthor, { kind: 'bot' }> & { displayName?: string };
  approval?: WireApprovalCard;
  responseSourceEventId?: string;
}

export interface WireHumanAttentionPage {
  queryVersion?: 1;
  notificationVersion?: 1;
  dismissed?: boolean;
  items: WireHumanAttentionItem[];
  nextCursor?: string;
}

export interface WireAttentionDismissal {
  accepted: true;
  dismissed: number;
  read: number;
  more: boolean;
}

export interface WireHumanAssignmentContext extends HumanAssignmentContext {
  title: string;
  description: string;
  hasOlder?: boolean;
  hasNewer?: boolean;
}

export interface WireAssignmentAccessPreset {
  botSlug: string;
  mode: 'workspace-write' | 'danger-full-access';
  scope?: 'chat' | 'assignments';
  revision: number;
  changedAt?: string;
}

export interface WireWorkspaceGrant {
  id: string;
  botSlug: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  createdAt: string;
  revokedAt?: string;
  orchestratorWrite?: boolean;
  writeRevision?: number;
}

export interface WireGrantApprovalMessage extends WireMessage {
  author: Extract<WireAuthor, { kind: 'human' }> & { deleted?: boolean };
  replyTo: string;
  grantRequestResolution: { requestMessageId: string; grantId: string };
}

export interface WireAssignmentTimelineEntry {
  status: 'running' | 'done' | 'failed' | 'denied' | 'cancelled';
  kind: 'read' | 'edit' | 'delete' | 'move' | 'search' | 'execute' | 'fetch' | 'other';
  tool: string;
  detail?: string;
  at: string;
  round?: number;
}

export interface WireAssignmentTimelineLane {
  role: 'main' | 'subagent';
  index: number;
  sessionId: string;
  title?: string;
  route?: NonNullable<ChannelAssignmentSummary['modelRoute']>;
  state: 'running' | 'done' | 'failed' | 'cancelled' | 'idle';
  startedAt?: string;
  updatedAt?: string;
  round?: number;
  entries: WireAssignmentTimelineEntry[];
  omitted: number;
}

export interface WireAssignmentTimelineRound {
  index: number;
  kind: 'created' | 'continued';
  at: string;
  instruction?: string;
}

export interface WireAssignmentTimeline {
  assignment: Omit<ChannelAssignmentSummary, 'subagentCount'> & {
    sourceEventId: string;
    executionWait?: 'waiting-human' | 'waiting-capacity';
    continuityKey?: string;
    agentPreset?: string;
    openAsk?: { sourceEventId: string; summary: string; at: string };
    permission?: {
      grantId: string;
      workspaceId: string;
      primaryCwd: string;
      mode: WireAssignmentAccessPreset['mode'];
      approval: 'ask' | 'never';
      presetRevision: number;
    };
  };
  lanes: WireAssignmentTimelineLane[];
  rounds?: WireAssignmentTimelineRound[];
  omittedSubagents: number;
  omittedRounds?: number;
}

export interface WireRosterSnapshot {
  pins: string[];
  hidden: string[];
  muted?: string[];
  sectionOrder: string[];
  sections: { id: string; name: string; channelIds: string[] }[];
  topOrder?: { kind: 'section' | 'channel'; id: string }[];
}

export interface WireProfileActivity extends Omit<
  ProfileActivity,
  'modelUsageRows' | 'modelUsageStatus'
> {
  slug: string;
  since: string;
  tokenTotals: ProfileTokenBuckets;
  modelUsageRows?: ProfileModelUsageRow[];
  modelUsageStatus?: ProfileActivity['modelUsageStatus'];
  idleCompactions?: {
    botSlug: string;
    at: string;
    provider: string;
    model: string;
    idleGapMs: number;
    cacheLifetimeMs: number;
    cacheLifetimeSource: 'setting' | 'catalog' | 'observed' | 'default' | 'unknown';
    tokensBefore: number;
    tokensAfter: number | null;
    outcome: 'compacted' | 'nothing' | 'failed';
    error?: string;
    inputTokens: number | null;
    cacheReadTokens: number | null;
    outputTokens: number | null;
  }[];
}

export interface WireTeamMode {
  isolation: 'trial' | 'enforced';
  confinement?: {
    enforcement: 'full' | 'partial' | 'unavailable';
    filesystem: boolean;
    network: boolean;
    missing: string[];
  };
  enabled: boolean;
  privateAccessNotice?: true;
  activeMembers: number;
  suspendedMembers?: number;
  ownerPasswordSet: boolean;
  insecureHttpAllowed: boolean;
  memberUrls: string[];
  viewer: {
    humanId: string;
    kind: 'owner' | 'member';
    displayName: string;
    mustChangePassword: boolean;
    models: { all: true } | { all: false; providers: string[]; routes: string[] };
    permissions: string[];
    roleIds: string[];
    owner: boolean;
  };
}

export interface WireBotDeletion {
  slug: string;
  displayName: string;
  acceptedAt: string;
  memoryDir: string;
  eraseMemory: boolean;
  ownership?: { path: string; device: number; inode: number };
  phase: 'stopping' | 'cleanup' | 'complete' | 'incomplete';
  memory: 'retained' | 'pending' | 'erased';
  failure?: string;
  cleanupAccepted?: boolean;
}

export interface WireBotDeletionPreview {
  slug: string;
  displayName: string;
  memoryDir: string;
  token: string;
  eraseAvailable: boolean;
  refusal?: string;
  dependencies: {
    sessions: string[];
    workspaces: string[];
    grants: string[];
    identities: string[];
    channels: string[];
  };
  deletion?: WireBotDeletion;
}

export type WireAdministrativeDeletion = Pick<
  WireBotDeletion,
  'slug' | 'displayName' | 'acceptedAt' | 'eraseMemory' | 'phase' | 'memory'
>;

export type WireAdministrativeDeletionPreview = Pick<
  WireBotDeletionPreview,
  'slug' | 'displayName' | 'token' | 'eraseAvailable'
> & { deletion?: WireAdministrativeDeletion };
