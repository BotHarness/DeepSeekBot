import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { BotCreationService } from '../../bots/creation.js';
import type { ChannelStore } from '../../channels/store.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { BotStateTracker } from '../../state/bot-state.js';
import type { TeamService } from '../../team/service.js';
import type { BotRuntime } from '../../runtime/bot-runtime-types.js';
import type { BotContextWindow } from '../../runtime/context-window.js';
import type { PublicToolCall } from '../../runtime/assignment-timeline.js';
import type { PresentToolResult } from '../../runtime/session-tool-detail.js';
import type { SessionLiveStreams } from '../../runtime/session-live.js';
import type { DshUsageSessionLogReader, UsageProjection } from '../../usage/usage.js';
import type { RegisterFolderWorkspace } from '../../workspaces/folder-create.js';
import type { WorkspaceLooks } from '../../workspaces/workspace-looks.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { TelemetryCapture } from '../../telemetry/service.js';
import type { ModelsBridgeDeps } from '../models/deps.js';
import type { ExternalSessionReader } from './external-sessions.js';
import type { NativeSessions } from './host-sessions.js';
import type { IdleCompactionDeps, SessionEngineQuota } from './methods.js';

export interface SessionsBridgeDeps extends Pick<
  ModelsBridgeDeps,
  | 'engineSelection'
  | 'routingGroups'
  | 'modelCatalog'
  | 'subscriptionEngines'
  | 'defaultModel'
  | 'modelPresets'
> {
  channels: ChannelStore;
  ownership: SessionOwnership;
  registry: PersonaBotRegistry;
  states: BotStateTracker;
  team?: TeamService;
  runtime?: BotRuntime;
  botContext?(slug: string): Promise<BotContextWindow>;
  sessionModels?: ReturnType<
    typeof import('../../runtime/session-model-choices.js').sessionModelChoices
  >;
  describeEngineSession?(sessionId: string):
    | {
        engine: string;
        account?: string;
        state: 'starting' | 'running' | 'waiting-approval' | 'idle';
        quota?: SessionEngineQuota;
      }
    | undefined;
  describeToolCall?(sessionId: string, name: string, args: unknown): PublicToolCall | undefined;
  idleCompaction?: IdleCompactionDeps;
  presentToolResult?: PresentToolResult;
  readSessionTitles?: (ids: readonly string[]) => Promise<ReadonlyMap<string, string>>;
  readUsageSessionLog?: DshUsageSessionLogReader;
  usage?: UsageProjection;
  nativeSessions?: NativeSessions;
  sessionLive?: SessionLiveStreams;
  workspaceLooks?: WorkspaceLooks;
  externalSessions?: ExternalSessionReader;
  creations?: BotCreationService;
  grants?: WorkspaceGrantStore;
  registerWorkspace?: RegisterFolderWorkspace;
  telemetry?: { capture?: TelemetryCapture };
}
