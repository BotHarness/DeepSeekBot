import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelStore } from '../../channels/store.js';
import type { MemoryService } from '../../memory/service.js';
import type { BotAttentionQuery } from '../../runtime/attention.js';
import type { BotRuntime } from '../../runtime/bot-runtime-types.js';
import type {
  HumanAttentionDecisions,
  HumanAttentionQuery,
} from '../../runtime/human-attention.js';
import type { BotSourcePolicyStore } from '../../runtime/source-policy.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { BotStateTracker } from '../../state/bot-state.js';
import type { TeamService } from '../../team/service.js';
import type { UsageProjection } from '../../usage/usage.js';

export interface ActivityBridgeDeps {
  channels: ChannelStore;
  ownership: SessionOwnership;
  registry: PersonaBotRegistry;
  states: BotStateTracker;
  attention?: BotAttentionQuery;
  humanAttention?: HumanAttentionQuery;
  humanAttentionDecisions?: HumanAttentionDecisions;
  memory?: MemoryService;
  runningSessionIds?: () => ReadonlySet<string>;
  runtime?: BotRuntime;
  sourcePolicy?: BotSourcePolicyStore;
  team?: TeamService;
  usage?: UsageProjection;
}
