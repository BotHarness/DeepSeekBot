import type { AttachmentStore } from '../../attachments/store.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelManagementService } from '../../channels/management.js';
import type { ChannelStore } from '../../channels/store.js';
import type { ChannelUserQuestions } from '../../channels/user-questions.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import type { ContentPurge } from '../../purge/contracts.js';
import type { RosterStore } from '../../roster/store.js';
import type { BotRuntime } from '../../runtime/bot-runtime.js';
import type { HumanAttentionQuery } from '../../runtime/human-attention.js';
import type { BotSourcePolicyStore } from '../../runtime/source-policy.js';
import type { SkillCatalog } from '../../skills/catalog.js';
import type { TeamService } from '../../team/service.js';
import type { CallTextHarvest, CallTextInput } from '../../voice/call-text.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import type { IdleCompactionDeps } from '../sessions/methods.js';

export interface ChannelsBridgeDeps {
  channels: ChannelStore;
  registry: PersonaBotRegistry;
  roster: RosterStore;
  attachments?: AttachmentStore;
  channelManagement?: ChannelManagementService;
  contentPurge?: ContentPurge;
  idleCompaction?: IdleCompactionDeps;
  runtime?: BotRuntime;
  team?: TeamService;
  externalMessaging?: OutboundMessaging;
  sourcePolicy?: BotSourcePolicyStore;
  toolApproval?: ChannelToolApproval;
  userQuestions?: ChannelUserQuestions;
  warn?: (message: string) => void;
  callText?: (input: CallTextInput) => Promise<CallTextHarvest | undefined>;
  grants?: WorkspaceGrantStore;
  humanAttention?: HumanAttentionQuery;
  skills?: SkillCatalog;
}
