import { orchestratorHandle } from './dsh-bot-agent-adapter-orchestrator.js';
import type { AssignmentModeChoices } from '../features/assignments/tools.js';
import { ModelFreeTobCliInvocation } from '../tob/cli-invocation.js';
import type { Context } from '@deepseek-ai/cordis';
import { mkdirSync } from 'node:fs';
import type { Agent, AgentHandle, ModelSelection } from '@deepseek-ai/dsh-agent';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotModelPlan } from '../models/presets.js';
import type { OpenAssignmentRoutes } from '../models/open-assignments.js';
import { ChannelDraftTracker } from '../channels/draft.js';
import {
  DirectBotToolError,
  type AssignmentAgentRun,
  type OrchestratorAgentRun,
} from './bot-runtime.js';
import { DEFAULT_PROMPT_TEXT, type PromptText } from '../prompts/prompt-parts.js';
import type { EngineToolGate, EngineToolSource } from '../engines/engine-tools.js';
import type {
  AssignmentGroupRoutes,
  BotAgentSetupInfo,
  DshAgentHost,
  DshAgentPresetHost,
  DshBotAgentAdapterOptions,
  DshBotEngines,
  DshDefaultModelHost,
} from './dsh-bot-agent-adapter.js';
import {
  type ModelFreeTobTurn,
  type ActiveRun,
  PreparationStopped,
  untilAborted,
} from './dsh-bot-agent-adapter-shared.js';

const PREPARATION_TIMEOUT_MS = 120_000;
const PREPARATION_VISIBLE_MS = 1_000;

export class DshBotAgentAdapterState {
  readonly agents: DshAgentHost;
  readonly defaultModel: DshDefaultModelHost;
  readonly resolveModelPlan: ((botSlug: string) => PersonaBotModelPlan | undefined) | undefined;
  readonly modelFilter: DshBotAgentAdapterOptions['modelFilter'];
  readonly subagentTools: DshBotAgentAdapterOptions['subagentTools'];
  readonly openAssignmentRoutes: OpenAssignmentRoutes | undefined;
  readonly orchestratorRoute: DshBotAgentAdapterOptions['orchestratorRoute'];
  readonly assignmentGroups: AssignmentGroupRoutes | undefined;
  readonly prepareModelRoute: DshBotAgentAdapterOptions['prepareModelRoute'];
  readonly observeTurnFailure: DshBotAgentAdapterOptions['observeTurnFailure'];
  readonly turnRefusal: DshBotAgentAdapterOptions['turnRefusal'];
  readonly promptText: (sessionId: string) => PromptText;
  readonly hasSession: DshBotAgentAdapterOptions['hasSession'];
  readonly onGenuiDiagnostic: DshBotAgentAdapterOptions['onGenuiDiagnostic'];
  readonly genuiPreviewBrowserPath: DshBotAgentAdapterOptions['genuiPreviewBrowserPath'];
  readonly genuiAttachmentContext: DshBotAgentAdapterOptions['genuiAttachmentContext'];
  readonly orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  readonly #defaultAgentPresetOf: () => string | undefined;
  readonly #currentBotModeOf: ((botSlug: string) => string | undefined) | undefined;
  readonly #ensureBotModes: (() => Promise<void>) | undefined;
  readonly #recordSessionMode: ((sessionId: string, mode: string) => void) | undefined;
  readonly authorizeBorrow:
    | ((agent: Agent, role: 'orchestrator' | 'assignment') => void)
    | undefined;
  readonly admitSession: DshBotAgentAdapterOptions['admitSession'];
  readonly #resolveAgentPresets: (() => DshAgentPresetHost | undefined) | undefined;
  readonly assignmentModes: ((botSlug: string) => Promise<AssignmentModeChoices>) | undefined;
  readonly onOrchestratorFileSetup: DshBotAgentAdapterOptions['onOrchestratorFileSetup'];
  readonly onAgentSetup:
    | ((agentCtx: Context, agent: Agent, info: BotAgentSetupInfo) => void)
    | undefined;
  readonly ensureWorkspace: (path: string) => void;
  readonly handles = new Map<string, AgentHandle>();
  readonly workContexts = new Map<string, string>();
  readonly orchestratorBridgeTools = new Map<string, (connected: boolean) => void>();
  readonly orchestratorSelections = new Map<
    string,
    { current: ModelSelection | undefined; assembled: ModelSelection | undefined }
  >();
  readonly orchestratorModeChoices = new Map<string, AssignmentModeChoices>();
  readonly assignmentSelections = new Map<
    string,
    { current: ModelSelection | undefined; assembled: ModelSelection | undefined }
  >();
  readonly runs = new Map<string, ActiveRun>();
  readonly modelFreeTobTurns = new Map<string, ModelFreeTobTurn>();
  readonly tobCliInvocation: ModelFreeTobCliInvocation;
  readonly stopping = new Set<string>();
  readonly stoppedBots = new Set<string>();
  readonly humanStops = new Set<string>();
  readonly stopSeqs = new Map<string, number>();
  readonly #abandons = new Map<string, () => void>();
  readonly #preparations = new Map<string, AbortController>();
  readonly #preparationTimeoutMs: number;
  readonly observePreparation: DshBotAgentAdapterOptions['observePreparation'];
  readonly observeDirectToolCleanupFailure: DshBotAgentAdapterOptions['observeDirectToolCleanupFailure'];
  readonly engines: DshBotEngines | undefined;
  readonly enginePersona: DshBotAgentAdapterOptions['enginePersona'];
  readonly engineWorkspaceMode: DshBotAgentAdapterOptions['engineWorkspaceMode'];
  readonly engineTools: EngineToolSource | undefined;
  readonly engineToolGate: EngineToolGate | undefined;
  readonly engineStops = new Map<string, AbortController>();
  readonly borrowedOrchestrators = new WeakSet<AgentHandle>();
  readonly releaseNativeAgent: DshBotAgentAdapterOptions['releaseNativeAgent'];
  readonly engineChannels = new Map<string, string>();
  readonly preparationVisibleMs: number;
  readonly drafts: ChannelDraftTracker;
  closed = false;

  orchestratorHandle(run: OrchestratorAgentRun, signal?: AbortSignal): Promise<AgentHandle> {
    return orchestratorHandle(this, run, signal);
  }

  constructor(
    options: DshBotAgentAdapterOptions,
    readonly runsOnEngine: (botSlug: string, role?: 'orchestrator' | 'assignment') => boolean,
  ) {
    this.tobCliInvocation = options.tobCliInvocation ?? new ModelFreeTobCliInvocation();
    this.onGenuiDiagnostic = options.onGenuiDiagnostic;
    this.genuiPreviewBrowserPath = options.genuiPreviewBrowserPath;
    this.genuiAttachmentContext = options.genuiAttachmentContext;
    this.agents = options.agents;
    this.defaultModel = options.defaultModel;
    this.resolveModelPlan = options.resolveModelPlan;
    this.modelFilter = options.modelFilter;
    this.subagentTools = options.subagentTools;
    this.openAssignmentRoutes = options.openAssignmentRoutes;
    this.orchestratorRoute = options.orchestratorRoute;
    this.assignmentGroups = options.assignmentGroups;
    this.prepareModelRoute = options.prepareModelRoute;
    this.observeTurnFailure = options.observeTurnFailure;
    this.turnRefusal = options.turnRefusal;
    this.promptText = options.promptText ?? (() => DEFAULT_PROMPT_TEXT);
    this.hasSession = options.hasSession;
    this.orchestratorCwd = options.orchestratorCwd;
    this.#currentBotModeOf = options.botModeOf;
    this.#ensureBotModes = options.ensureBotModes;
    this.#recordSessionMode = options.recordSessionMode;
    const defaultAgentPreset = options.defaultAgentPreset;
    this.#defaultAgentPresetOf =
      typeof defaultAgentPreset === 'function' ? defaultAgentPreset : () => defaultAgentPreset;
    this.authorizeBorrow = options.authorizeBorrow;
    this.releaseNativeAgent = options.releaseNativeAgent;
    this.admitSession = options.admitSession;
    this.onAgentSetup = options.onAgentSetup;
    this.onOrchestratorFileSetup = options.onOrchestratorFileSetup;
    this.#resolveAgentPresets = options.resolveAgentPresets;
    this.assignmentModes = options.assignmentModes;
    this.ensureWorkspace =
      options.ensureWorkspace ?? ((path) => void mkdirSync(path, { recursive: true }));
    this.drafts = new ChannelDraftTracker(options.publishDraft ?? (() => undefined));
    this.#preparationTimeoutMs = options.preparationTimeoutMs ?? PREPARATION_TIMEOUT_MS;
    this.observePreparation = options.observePreparation;
    this.observeDirectToolCleanupFailure = options.observeDirectToolCleanupFailure;
    this.preparationVisibleMs = options.preparationVisibleMs ?? PREPARATION_VISIBLE_MS;
    this.engines = options.engines;
    this.enginePersona = options.enginePersona;
    this.engineWorkspaceMode = options.engineWorkspaceMode;
    this.engineTools = options.engineTools;
    this.engineToolGate = options.engineToolGate;
  }

  requireNoPreparation(sessionId: string): void {
    if (this.#preparations.has(sessionId))
      throw new DirectBotToolError(
        'bot-busy',
        'The previous native preparation is still being cleaned up',
      );
  }

  async prepare<T>(
    sessionId: string,
    work: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    this.requireNoPreparation(sessionId);
    const controller = new AbortController();
    this.#preparations.set(sessionId, controller);
    const abort = () => controller.abort();
    const release = () => {
      if (this.#preparations.get(sessionId) === controller) this.#preparations.delete(sessionId);
    };
    let pending: Promise<T> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const stopped = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(new PreparationStopped()), {
          once: true,
        });
        timer = setTimeout(() => {
          reject(
            new Error(
              `Preparing this turn took longer than ${Math.round(this.#preparationTimeoutMs / 1000)} s (model route or Session resume did not answer). Check the DSH model provider, then send the message again.`,
            ),
          );
          controller.abort();
        }, this.#preparationTimeoutMs);
      });
      signal?.addEventListener('abort', abort, { once: true });
      signal?.throwIfAborted();
      pending = Promise.resolve().then(() => work(controller.signal));
      void pending.then(release, release);
      return await Promise.race([pending, stopped]);
    } finally {
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
      if (pending === undefined) release();
    }
  }

  abortPreparation(sessionId: string): boolean {
    const controller = this.#preparations.get(sessionId);
    if (controller === undefined) return false;
    controller.abort();
    return true;
  }

  abandonable(sessionId: string): { abandoned: Promise<'abandoned'>; release(): void } {
    let abandon!: () => void;
    const abandoned = new Promise<'abandoned'>((resolve) => {
      abandon = () => resolve('abandoned');
    });
    this.#abandons.set(sessionId, abandon);
    return {
      abandoned,
      release: () => {
        if (this.#abandons.get(sessionId) === abandon) this.#abandons.delete(sessionId);
      },
    };
  }

  markStop(sessionId: string, handle: AgentHandle | undefined): void {
    if (handle === undefined || this.stopSeqs.has(sessionId)) return;
    this.stopSeqs.set(sessionId, Number(handle.agent.session.seq));
  }

  forgetAgent(agent: Agent): void {
    const sessionId = String(agent.session.id);
    if (this.handles.get(sessionId)?.agent === agent) this.forgetHandle(sessionId);
  }

  forgetHandle(sessionId: string): void {
    this.handles.delete(sessionId);
    this.orchestratorSelections.delete(sessionId);
    this.orchestratorModeChoices.delete(sessionId);
    this.orchestratorBridgeTools.delete(sessionId);
    this.assignmentSelections.delete(sessionId);
  }

  liveHandle(sessionId: string): AgentHandle | undefined {
    const handle = this.handles.get(sessionId);
    if (handle === undefined || this.agents.get === undefined) return handle;
    if (this.agents.get(SessionId(sessionId)) === handle.agent) return handle;
    this.forgetHandle(sessionId);
    void handle.dispose().catch(() => undefined);
    return undefined;
  }

  modelSelection(sessionId: string): ModelSelection | undefined {
    return (
      this.orchestratorSelections.get(sessionId)?.current ??
      this.assignmentSelections.get(sessionId)?.current
    );
  }

  async stopBot(botSlug: string, sessionIds: string[]): Promise<void> {
    this.stoppedBots.add(botSlug);
    const ids = new Set([
      ...sessionIds,
      ...[...this.runs].filter(([, entry]) => entry.run.bot.slug === botSlug).map(([id]) => id),
    ]);
    const agents = [...ids].flatMap((id) => {
      this.stopping.add(id);
      this.abortPreparation(id);
      const agent = this.handles.get(id)?.agent ?? this.agents.get?.(SessionId(id));
      if (agent === undefined) return [];
      agent.cancel({ kind: 'user' });
      return [agent];
    });
    await Promise.all(agents.map((agent) => agent.whenIdle()));
    for (const id of ids) {
      const handle = this.handles.get(id);
      if (handle === undefined) continue;
      await handle.dispose();
      this.forgetHandle(id);
    }
  }

  async abandonSession(sessionId: string): Promise<void> {
    const active = this.runs.get(sessionId);
    if (active?.role === 'orchestrator') this.humanStops.add(sessionId);
    else this.stopping.add(sessionId);
    this.abortPreparation(sessionId);
    this.#abandons.get(sessionId)?.();
    const handle = this.handles.get(sessionId);
    if (handle === undefined) return;
    this.forgetHandle(sessionId);
    void handle.dispose().catch(() => undefined);
  }

  async releaseSession(sessionId: string): Promise<void> {
    if (this.runs.has(sessionId)) return;
    const handle = this.handles.get(sessionId);
    if (handle === undefined) return;
    this.forgetHandle(sessionId);
    await handle.dispose();
  }

  readonly assignmentGroupRuns = new Set<string>();

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const handles = [...this.handles.values()];
    this.handles.clear();
    this.orchestratorSelections.clear();
    this.orchestratorModeChoices.clear();
    this.assignmentSelections.clear();
    for (const sessionId of this.runs.keys()) this.drafts.end(sessionId);
    for (const controller of this.#preparations.values()) controller.abort();
    this.runs.clear();
    this.stopping.clear();
    await Promise.all(handles.map(async (handle) => handle.dispose()));
  }

  async composePreset(
    agentCtx: Context,
    agent: Agent,
    run: OrchestratorAgentRun | AssignmentAgentRun,
  ): Promise<void> {
    const presets = this.#resolveAgentPresets?.();
    if (presets === undefined) return;
    let recorded: string | undefined;
    try {
      recorded = presets.presetForSession?.(agent.session) ?? undefined;
    } catch {
      recorded = undefined;
    }
    const mode =
      recorded ?? ('agentPreset' in run ? run.agentPreset : undefined) ?? this.botModeOf(run.bot);
    await presets.mount(agentCtx, mode);
    if (mode !== undefined) this.#recordSessionMode?.(run.sessionId, mode);
  }

  botModeOf(bot: PersonaBotRecord): string | undefined {
    return this.#currentBotModeOf?.(bot.slug) ?? bot.preset ?? this.#defaultAgentPresetOf();
  }

  async loadBotModes(signal: AbortSignal | undefined): Promise<void> {
    signal?.throwIfAborted();
    const loading = this.#ensureBotModes?.();
    if (loading !== undefined) await untilAborted(loading, signal);
  }

  assertOpen(): void {
    if (this.closed) throw new Error('DSH Bot Agent adapter is closed');
  }
}
