import type { RoutingGroupEngineMember } from '@botharness/host-protocol/subscription-engine';
import type { AssignmentModeChoices } from '../features/assignments/tools.js';
import type { GenuiPreviewDiagnostic } from './genui-preview.js';
import type { ModelFreeTobCliInvocation } from '../tob/cli-invocation.js';
import type { Context } from '@deepseek-ai/cordis';
import type {
  Agent,
  AgentHandle,
  AssistantStreamFrame,
  CreateAgentOptions,
  ModelSelection,
  ResumeAgentOptions,
} from '@deepseek-ai/dsh-agent';
import type { createUserMessage } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { ModelRoute, PersonaBotModelPlan } from '../models/presets.js';
import type { OpenAssignmentRoutes } from '../models/open-assignments.js';
import type { GroupPick, MixedGroupPick } from '../models/group-fallback.js';
import type { RoutingTarget } from '../models/routing-groups.js';
import type { RestingRoute } from '../models/route-rest.js';
import { type ChannelDraftEvent } from '../channels/draft.js';
import {
  type AssignmentAgentRun,
  type AssignmentRequestDelivery,
  type BotAgentAdapter,
  type DirectBotToolSpec,
  type OrchestratorAgentRun,
} from './bot-runtime.js';
import { type PromptText } from '../prompts/prompt-parts.js';
import type { EngineTurnOutcome, EngineTurnRequest } from '../engines/engine-host.js';
import type { EngineId, EngineWorkspaceMode } from '../engines/engine-session.js';
import type { EngineBotTool, EngineToolGate, EngineToolSource } from '../engines/engine-tools.js';
import {
  runOrchestrator,
  ownsModelFreeTobTurn,
  runModelFreeTobTurn,
  stopOrchestratorTurn,
  steerOrchestrator,
  acceptAssistantStream,
  captureNativeOrchestratorModel,
  loadOrchestrator,
} from './dsh-bot-agent-adapter-orchestrator.js';
import { runsOnEngine, engineToolCatalog } from './dsh-bot-agent-adapter-engine.js';
import {
  runAssignment,
  requestAssignment,
  stopAssignment,
} from './dsh-bot-agent-adapter-assignment.js';
import { directTools, runDirectTool } from './dsh-bot-agent-adapter-tools.js';
import { DshBotAgentAdapterState } from './dsh-bot-agent-adapter-state.js';
export { TURN_ONLY_BOT_TOOLS } from './dsh-bot-agent-adapter-shared.js';
export { hostWorkContext } from './dsh-bot-agent-adapter-orchestrator.js';
export { orchestratorPromptSections } from './dsh-bot-agent-adapter-orchestrator-prompt.js';

export {
  assignmentModeParameter,
  onlyActiveGrant,
  type AssignmentModeChoices,
} from '../features/assignments/tools.js';

export { replyReminderText } from '../features/messaging/prompt.js';

export interface AssignmentGroupRoutes {
  pick(botSlug: string, groupId: string, effort?: string): Promise<GroupPick | MixedGroupPick>;
  describe(
    groupId: string,
    botSlug: string,
  ): { name: string; routes: ModelRoute[]; targets?: RoutingTarget[] } | undefined;
  engineRestingUntil?(engine: EngineId, accountId?: string): string | undefined;
  restingUntil(route: ModelRoute): RestingRoute | undefined;
  inherited?(): string | undefined;
  inheritedEffort?(): string | undefined;
}

export interface DshAgentHost {
  create(options: CreateAgentOptions): Promise<AgentHandle>;
  resume(options: ResumeAgentOptions): Promise<AgentHandle>;
  get?(id: ReturnType<typeof SessionId>): Agent | undefined;
}

export interface DshAgentPresetHost {
  mount(agentCtx: Context, id?: string): Promise<unknown>;
  presetForSession?(session: Agent['session']): string | null | undefined;
  serviceFor?(agent: Agent, name: string): unknown;
}

export interface DshBotAgentAdapterOptions {
  tobCliInvocation?: ModelFreeTobCliInvocation;
  onGenuiDiagnostic?: (event: GenuiPreviewDiagnostic) => void;
  genuiPreviewBrowserPath?: string;
  genuiAttachmentContext?: Pick<Context, 'get'>;
  agents: DshAgentHost;
  defaultModel: DshDefaultModelHost;
  resolveModelPlan?: (botSlug: string) => PersonaBotModelPlan | undefined;
  modelFilter?: (botSlug: string) => (route: ModelRoute) => boolean;
  openAssignmentRoutes?: OpenAssignmentRoutes;
  orchestratorRoute?: (sessionId: string) => ModelRoute | undefined;
  assignmentGroups?: AssignmentGroupRoutes;
  subagentTools?: (botSlug: string) => ToolDefinition[];
  hasSession?: (sessionId: string) => Promise<boolean>;
  prepareModelRoute?: (
    botSlug: string,
    role: 'orchestrator' | 'assignment',
    retainedRoute?: ModelRoute,
  ) => Promise<void>;

  resolveAgentPresets?: () => DshAgentPresetHost | undefined;

  defaultAgentPreset?: string | (() => string | undefined);
  botModeOf?: (botSlug: string) => string | undefined;
  ensureBotModes?: () => Promise<void>;
  recordSessionMode?: (sessionId: string, mode: string) => void;
  assignmentModes?: (botSlug: string) => Promise<AssignmentModeChoices>;

  orchestratorCwd?: (bot: PersonaBotRecord) => string | undefined;
  ensureWorkspace?: (path: string) => void;
  publishDraft?: (event: ChannelDraftEvent) => void;

  authorizeBorrow?: (agent: Agent, role: 'orchestrator' | 'assignment') => void;
  releaseNativeAgent?: (agent: Agent) => Promise<boolean> | undefined;

  admitSession?: (agent: Agent) => void;

  onOrchestratorFileSetup?: (agentCtx: Context, agent: Agent) => Promise<() => Promise<void>>;

  onAgentSetup?: (agentCtx: Context, agent: Agent, info: BotAgentSetupInfo) => void;

  observeTurnFailure?: (provider: string, code: string) => void;

  turnRefusal?: (sessionId: string) => string | Error | undefined;

  promptText?: (sessionId: string) => PromptText;

  preparationTimeoutMs?: number;

  preparationVisibleMs?: number;

  observePreparation?: (botSlug: string, sessionId: string, preparing: boolean) => void;
  observeDirectToolCleanupFailure?: (event: { sessionId: string; durationMs: number }) => void;
  engines?: DshBotEngines;
  engineWorkspaceMode?(
    slug: string,
    permission?: AssignmentAgentRun['permission'],
  ): EngineWorkspaceMode;
  enginePersona?: (bot: PersonaBotRecord) => { soul?: string; coreMemory?: string };
  engineTools?: EngineToolSource;
  engineToolGate?: EngineToolGate;
}

export interface DshBotEngines {
  engineFor(botSlug: string, role?: 'orchestrator' | 'assignment'): string | undefined;
  runsOnEngine?(botSlug: string, role?: 'orchestrator' | 'assignment'): boolean;
  assertAssignmentAccount?(botSlug: string, target?: RoutingGroupEngineMember): void;
  runTurn(request: EngineTurnRequest): Promise<EngineTurnOutcome | void>;
  steerAssignment?(sessionId: string, text: string): boolean;
  release(sessionId: string): Promise<void>;
  isLive(sessionId: string): boolean;
}

export interface BotAgentSetupInfo {
  readonly botSlug: string;
  readonly rootRole: 'orchestrator' | 'assignment';
}

export interface DshDefaultModelHost {
  currentSelection(): ModelSelection;
}

class DshBotAgentAdapter implements BotAgentAdapter {
  readonly #state: DshBotAgentAdapterState;
  constructor(options: DshBotAgentAdapterOptions) {
    this.#state = new DshBotAgentAdapterState(options, (...args) => this.runsOnEngine(...args));
  }
  runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    return runOrchestrator(this.#state, run);
  }

  runsOnEngine(botSlug: string, role: 'orchestrator' | 'assignment' = 'orchestrator'): boolean {
    return runsOnEngine(this.#state, botSlug, role);
  }

  engineToolCatalog(botSlug: string): Promise<EngineBotTool[]> {
    return engineToolCatalog(this.#state, botSlug);
  }

  ownsModelFreeTobTurn(agent: Agent): boolean {
    return ownsModelFreeTobTurn(this.#state, agent);
  }

  runModelFreeTobTurn(
    agent: Agent,
    messages: readonly ReturnType<typeof createUserMessage>[],
    signal: AbortSignal,
    modelSelection: Readonly<ModelSelection>,
  ): Promise<boolean> {
    return runModelFreeTobTurn(this.#state, agent, messages, signal, modelSelection);
  }

  stopOrchestratorTurn(botSlug: string): string | undefined {
    return stopOrchestratorTurn(this.#state, botSlug);
  }

  steerOrchestrator(botSlug: string, text: string): boolean {
    return steerOrchestrator(this.#state, botSlug, text);
  }

  acceptAssistantStream(sessionId: string, frame: AssistantStreamFrame, agent?: Agent): void {
    return acceptAssistantStream(this.#state, sessionId, frame, agent);
  }

  forgetAgent(agent: Agent): void {
    return this.#state.forgetAgent(agent);
  }

  modelSelection(sessionId: string): ModelSelection | undefined {
    return this.#state.modelSelection(sessionId);
  }

  captureNativeOrchestratorModel(sessionId: string, bot: PersonaBotRecord): void {
    return captureNativeOrchestratorModel(this.#state, sessionId, bot);
  }

  runAssignment(run: AssignmentAgentRun): Promise<void> {
    return runAssignment(this.#state, run);
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    return requestAssignment(this.#state, run);
  }

  stopBot(botSlug: string, sessionIds: string[]): Promise<void> {
    return this.#state.stopBot(botSlug, sessionIds);
  }

  abandonSession(sessionId: string): Promise<void> {
    return this.#state.abandonSession(sessionId);
  }

  releaseSession(sessionId: string): Promise<void> {
    return this.#state.releaseSession(sessionId);
  }

  stopAssignment(sessionId: string): Promise<void> {
    return stopAssignment(this.#state, sessionId);
  }

  close(): Promise<void> {
    return this.#state.close();
  }

  loadOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    return loadOrchestrator(this.#state, run);
  }

  directTools(): DirectBotToolSpec[] {
    return directTools(this.#state);
  }

  runDirectTool(
    run: OrchestratorAgentRun,
    name: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    parentSessionId?: string,
  ): Promise<unknown> {
    return runDirectTool(
      this.#state,
      (sessionId) => this.releaseSession(sessionId),
      run,
      name,
      args,
      signal,
      parentSessionId,
    );
  }
}

export function createDshBotAgentAdapter(options: DshBotAgentAdapterOptions): BotAgentAdapter & {
  acceptAssistantStream(sessionId: string, frame: AssistantStreamFrame, agent?: Agent): void;
  forgetAgent(agent: Agent): void;
  modelSelection(sessionId: string): ModelSelection | undefined;
  ownsModelFreeTobTurn(agent: Agent): boolean;
  engineToolCatalog(botSlug: string): Promise<EngineBotTool[]>;
  runModelFreeTobTurn(
    agent: Agent,
    messages: readonly ReturnType<typeof createUserMessage>[],
    signal: AbortSignal,
    modelSelection: Readonly<ModelSelection>,
  ): Promise<boolean>;
} {
  return new DshBotAgentAdapter(options);
}
