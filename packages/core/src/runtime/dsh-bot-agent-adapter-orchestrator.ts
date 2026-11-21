import { randomUUID } from 'node:crypto';
import { TeamError } from '../team/error.js';
import {
  executeNativeTool,
  installNativeModelSelection,
  installAgentNativeTools,
  selectNativeModel,
} from './native-agent-compat.js';
import type { AssignmentModeChoices } from '../features/assignments/tools.js';
import { replyReminderText } from '../features/messaging/prompt.js';
import { GENUI_AUTHORING_SECTION } from '../features/genui/prompt.js';
import { nativeScheduleToolRefusal } from '../features/schedules/tools.js';
import { assertOrchestratorWorkingDirectory } from './orchestrator-working-directory.js';
import { TOB_CLI_PROMPT } from '../tob/service.js';
import type { Context } from '@deepseek-ai/cordis';
import type {
  Agent,
  AgentHandle,
  AssistantStreamFrame,
  CreateAgentOptions,
  ModelSelection,
} from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import {
  DirectBotToolError,
  type OrchestratorAgentRun,
  type OrchestratorAssignmentAccess,
} from './bot-runtime.js';
import {
  type ModelFreeTobTurn,
  ROLE_PROMPT_ORDER,
  EXTERNAL_IM_PROMPT,
  type ActiveRun,
  linkForgottenSessions,
  agentOptions,
  createMeta,
  requireCompletedTurn,
  PreparationStopped,
  interruptedToolCalls,
  turnAborted,
  untilAborted,
} from './dsh-bot-agent-adapter-shared.js';
import { runEngineTurn } from './dsh-bot-agent-adapter-engine.js';
import { orchestratorTools, TOB_CLI_ONLY_TOOLS } from './dsh-bot-agent-adapter-tools.js';
import { orchestratorPromptSections } from './dsh-bot-agent-adapter-orchestrator-prompt.js';
import type { DshBotAgentAdapterState } from './dsh-bot-agent-adapter-state.js';

type RunOrchestratorContext = Pick<
  DshBotAgentAdapterState,
  | 'abandonable'
  | 'assertOpen'
  | 'drafts'
  | 'engines'
  | 'humanStops'
  | 'modelFreeTobTurns'
  | 'observePreparation'
  | 'observeTurnFailure'
  | 'orchestratorBridgeTools'
  | 'orchestratorSelections'
  | 'preparationVisibleMs'
  | 'prepare'
  | 'prepareModelRoute'
  | 'promptText'
  | 'requireNoPreparation'
  | 'runs'
  | 'runsOnEngine'
  | 'stopSeqs'
  | 'stoppedBots'
  | 'turnRefusal'
> &
  Parameters<typeof runEngineTurn>[0] &
  OrchestratorHandleContext &
  OrchestratorSelectionContext &
  WorkContextContext;

type OwnsModelFreeTobTurnContext = Pick<DshBotAgentAdapterState, 'modelFreeTobTurns'>;

type RunModelFreeTobTurnContext = Pick<
  DshBotAgentAdapterState,
  'closed' | 'modelFreeTobTurns' | 'runs' | 'tobCliInvocation'
>;

type StopOrchestratorTurnContext = Pick<
  DshBotAgentAdapterState,
  'abortPreparation' | 'engineStops' | 'handles' | 'humanStops' | 'markStop' | 'runs'
>;

type WorkContextContext = Pick<DshBotAgentAdapterState, 'workContexts'>;

type SteerOrchestratorContext = Pick<
  DshBotAgentAdapterState,
  'assertOpen' | 'engineStops' | 'handles' | 'promptText' | 'runs'
> &
  WorkContextContext;

type AcceptAssistantStreamContext = Pick<DshBotAgentAdapterState, 'drafts' | 'runs'>;

type CaptureNativeOrchestratorModelContext = Pick<
  DshBotAgentAdapterState,
  | 'defaultModel'
  | 'handles'
  | 'orchestratorRoute'
  | 'orchestratorSelections'
  | 'resolveModelPlan'
  | 'runs'
>;

type LoadOrchestratorContext = Pick<
  DshBotAgentAdapterState,
  'assertOpen' | 'engineStops' | 'hasSession' | 'prepare' | 'prepareModelRoute'
> &
  OrchestratorHandleContext;

type OrchestratorSelectionContext = Pick<
  DshBotAgentAdapterState,
  'defaultModel' | 'orchestratorRoute' | 'resolveModelPlan'
>;

type OrchestratorHandleContext = Pick<
  DshBotAgentAdapterState,
  | 'admitSession'
  | 'agents'
  | 'authorizeBorrow'
  | 'borrowedOrchestrators'
  | 'closed'
  | 'composePreset'
  | 'handles'
  | 'hasSession'
  | 'liveHandle'
  | 'onAgentSetup'
  | 'onOrchestratorFileSetup'
  | 'orchestratorBridgeTools'
  | 'orchestratorModeChoices'
  | 'orchestratorSelections'
  | 'promptText'
  | 'runs'
> &
  OrchestratorSelectionContext &
  Parameters<typeof orchestratorTools>[0] &
  ResolveOrchestratorCwdContext &
  ReadAssignmentModesContext &
  CreateOrchestratorContext;

type CreateOrchestratorContext = Pick<
  DshBotAgentAdapterState,
  'agents' | 'botModeOf' | 'ensureWorkspace' | 'loadBotModes'
> &
  ResolveOrchestratorCwdContext;

type ResolveOrchestratorCwdContext = Pick<DshBotAgentAdapterState, 'orchestratorCwd'>;

type ReadAssignmentModesContext = Pick<DshBotAgentAdapterState, 'assignmentModes'>;

export function hostWorkContext(
  access: Pick<OrchestratorAssignmentAccess, 'grants' | 'list'>,
): string {
  const grants = access
    .grants()
    .filter((grant) => grant.revokedAt === undefined)
    .map(
      (grant) =>
        `- Grant ${grant.id}: ${JSON.stringify(grant.workspaceTitle)} at ${grant.workspacePath}${grant.orchestratorWrite === true ? ', Orchestrator may write' : ''}`,
    );
  const assignments = access
    .list()
    .filter((assignment) => assignment.archivedAt === undefined)
    .slice(0, 12)
    .map(
      (assignment) =>
        `- Assignment ${assignment.sessionId}: ${JSON.stringify(assignment.title)}${assignment.continuityKey === undefined ? '' : ` key ${assignment.continuityKey}`}, ${assignment.activity}`,
    );
  return [
    '[Host context] Your active Workspace Grants and unarchived Assignments as of this turn. Use them directly; call list_workspace_grants or list_assignments only for details or a search.',
    grants.length > 0 ? 'Grants:' : 'Grants: none',
    ...grants,
    assignments.length > 0 ? 'Assignments:' : 'Assignments: none',
    ...assignments,
  ].join('\n');
}

export async function runOrchestrator(
  adapter: RunOrchestratorContext,
  run: OrchestratorAgentRun,
): Promise<void> {
  adapter.assertOpen();
  if (adapter.stoppedBots.has(run.bot.slug)) throw new Error('PersonaBot is deleted');
  adapter.requireNoPreparation(run.sessionId);
  if (adapter.runs.has(run.sessionId))
    throw new DirectBotToolError('bot-busy', 'The Orchestrator Session already has active work');
  const entry: ActiveRun = {
    role: 'orchestrator',
    run,
  };
  adapter.runs.set(run.sessionId, entry);
  adapter.stopSeqs.delete(run.sessionId);
  const abandonable = adapter.abandonable(run.sessionId);
  const access = new Map<string, boolean>();
  if (run.inboundChannelId !== undefined)
    adapter.drafts.begin(run.sessionId, {
      channelId: run.inboundChannelId,
      botSlug: run.bot.slug,
      replyChannel: (sourceEventId) => {
        try {
          const destination = run.replyDestination?.(sourceEventId);
          return destination?.kind === 'channel' ? destination.channelId : undefined;
        } catch {
          return undefined;
        }
      },
      canAccess: (channelId) => {
        const cached = access.get(channelId);
        if (cached !== undefined) return cached;
        try {
          const allowed = run.channels.list({ channelId, limit: 1 }).channels.length > 0;
          access.set(channelId, allowed);
          return allowed;
        } catch {
          access.set(channelId, false);
          return false;
        }
      },
    });
  try {
    const engines = adapter.engines;
    if (
      run.tobCliTurn === undefined &&
      engines !== undefined &&
      (run.routingTarget === undefined
        ? adapter.runsOnEngine(run.bot.slug)
        : run.routingTarget.kind === 'engine')
    ) {
      await runEngineTurn(adapter, run, engines, abandonable.abandoned);
      return;
    }
    if (adapter.engines?.isLive(run.sessionId)) await adapter.engines.release(run.sessionId);
    let handle: AgentHandle;
    let shown = false;
    const reveal = setTimeout(() => {
      shown = true;
      adapter.observePreparation?.(run.bot.slug, run.sessionId, true);
    }, adapter.preparationVisibleMs);
    reveal.unref?.();
    try {
      handle = await adapter.prepare(
        run.sessionId,
        async (signal) => {
          run.tobCliTurn?.signal.throwIfAborted();
          if (run.tobCliTurn === undefined)
            await adapter.prepareModelRoute?.(
              run.bot.slug,
              'orchestrator',
              run.routingTarget?.kind === 'route' ? run.routingTarget.route : undefined,
            );
          return orchestratorHandle(adapter, run, signal);
        },
        run.tobCliTurn?.signal,
      );
    } catch (error) {
      if (error instanceof PreparationStopped && adapter.humanStops.has(run.sessionId)) return;
      throw error;
    } finally {
      clearTimeout(reveal);
      if (shown) adapter.observePreparation?.(run.bot.slug, run.sessionId, false);
    }
    if (adapter.stoppedBots.has(run.bot.slug)) throw new Error('PersonaBot is deleted');
    adapter.orchestratorBridgeTools.get(run.sessionId)?.(
      run.externalMessaging?.connected() ?? false,
    );
    const selection = adapter.orchestratorSelections.get(run.sessionId);
    if (selection !== undefined) {
      selection.current = orchestratorSelection(adapter, run);
    }
    selectNativeModel(handle.agent, selection?.current);
    const fromSeq = handle.agent.session.seq;
    run.setExecutionReady?.(true);
    run.requireContent?.();
    if (run.tobCliTurn !== undefined) {
      const agent = handle.agent;
      if (agent.status !== 'idle' || agent.inbox.nextTurn.length || agent.inbox.nextStep.length)
        throw new DirectBotToolError('bot-busy', 'The native Agent has pending work');
      const input = createUserMessage({
        content: [{ type: 'text', text: run.message }],
        source: { kind: 'user' },
      });
      const pending: ModelFreeTobTurn = {
        agent,
        turn: run.tobCliTurn,
        inputId: input.id,
        outcome: undefined,
      };
      adapter.modelFreeTobTurns.set(run.sessionId, pending);
      const cancel = () => agent.cancel({ kind: 'user' }, { keepInbox: true });
      run.tobCliTurn.signal.addEventListener('abort', cancel, { once: true });
      try {
        run.tobCliTurn.signal.throwIfAborted();
        agent.followup(input);
        await agent.whenIdle();
        run.tobCliTurn.signal.throwIfAborted();
        if (!pending.outcome)
          throw new DirectBotToolError(
            'native-turn-not-accepted',
            'The native turn did not accept the CLI request',
          );
        if (pending.outcome.kind === 'failed') throw pending.outcome.error;
      } finally {
        run.tobCliTurn.signal.removeEventListener('abort', cancel);
        agent.inbox.remove(input.id);
        if (adapter.modelFreeTobTurns.get(run.sessionId) === pending)
          adapter.modelFreeTobTurns.delete(run.sessionId);
      }
      return;
    }
    const text = [run.message, run.inbox].filter((part) => part.trim().length > 0).join('\n\n');
    if (run.acceptNativeInput !== undefined) {
      if (!run.acceptNativeInput()) return;
    } else
      handle.agent.followup(
        createUserMessage({
          content: [
            { type: 'text', text },
            ...workContext(adapter, run.sessionId, run.assignments),
            { type: 'text', text: replyReminderText(adapter.promptText(run.sessionId)) },
          ],
          source: { kind: 'user' },
        }),
      );
    run.inputAccepted?.();
    const idle = await Promise.race([handle.agent.whenIdle(), abandonable.abandoned]);
    if (adapter.humanStops.has(run.sessionId)) {
      const interrupted = interruptedToolCalls(
        handle,
        fromSeq,
        adapter.stopSeqs.get(run.sessionId),
      );
      if (interrupted.length > 0) run.toolsInterrupted?.(interrupted);
    }
    if (idle === 'abandoned') return;
    if (adapter.humanStops.has(run.sessionId) && turnAborted(handle, fromSeq)) return;
    const provider = selection?.current?.provider;
    requireCompletedTurn(
      handle,
      fromSeq,
      undefined,
      undefined,
      (code) => {
        if (provider !== undefined) adapter.observeTurnFailure?.(provider, code);
      },
      adapter.turnRefusal?.(run.sessionId),
    );
  } finally {
    abandonable.release();
    adapter.stopSeqs.delete(run.sessionId);
    if (adapter.humanStops.delete(run.sessionId)) adapter.drafts.interrupt(run.sessionId);
    else adapter.drafts.end(run.sessionId);
    linkForgottenSessions(entry);
    if (adapter.runs.get(run.sessionId) === entry) {
      adapter.runs.delete(run.sessionId);
      run.setExecutionReady?.(false);
    }
  }
}

export function ownsModelFreeTobTurn(adapter: OwnsModelFreeTobTurnContext, agent: Agent): boolean {
  const pending = adapter.modelFreeTobTurns.get(agent.session.id);
  return pending?.agent === agent;
}

export async function runModelFreeTobTurn(
  adapter: RunModelFreeTobTurnContext,
  agent: Agent,
  messages: readonly ReturnType<typeof createUserMessage>[],
  signal: AbortSignal,
  modelSelection: Readonly<ModelSelection>,
): Promise<boolean> {
  const pending = adapter.modelFreeTobTurns.get(agent.session.id);
  if (!pending || pending.agent !== agent) return false;
  if (pending.outcome) return true;
  const turn = pending.turn;
  try {
    if (messages.length !== 1 || messages[0]?.id !== pending.inputId)
      throw new DirectBotToolError('native-turn-not-accepted', 'The native input identity changed');
    const active = adapter.runs.get(agent.session.id);
    if (active?.role !== 'orchestrator' || active.run.tobCliTurn !== turn)
      throw new DirectBotToolError('agent-context-expired', 'The owned CLI turn ended');
    active.run.requireContent?.();
    active.run.inputAccepted?.();
    turn.signal.throwIfAborted();
    const toolSet =
      typeof agent.ctx.tools.resolve === 'function'
        ? await agent.ctx.tools.resolve({ agent, modelSelection, signal })
        : undefined;
    const result = await (async () => {
      try {
        if (!toolSet)
          throw new DirectBotToolError('tool-failed', 'Native tool selection is unavailable');
        const callId = ToolCallId('tob-cli-' + randomUUID());
        const invocationSignal = AbortSignal.any([signal, turn.signal]);
        return await adapter.tobCliInvocation.run(
          {
            agent,
            callId,
            command: turn.command,
            toolSet,
            signal: invocationSignal,
            requireCurrentTurn: () => {
              const current = adapter.runs.get(agent.session.id);
              if (
                adapter.closed ||
                adapter.modelFreeTobTurns.get(agent.session.id) !== pending ||
                pending.outcome ||
                current !== active ||
                current.run.tobCliTurn !== turn
              )
                throw new DirectBotToolError('agent-context-expired', 'The owned CLI turn ended');
              current.run.requireContent?.();
              turn.signal.throwIfAborted();
            },
          },
          () =>
            executeNativeTool(agent.ctx, {
              callId,
              name: 'deepseekbot_cli',
              arguments: turn.command,
              agent,
              signal: invocationSignal,
              toolSet,
            }),
        );
      } finally {
        toolSet?.dispose();
      }
    })();
    if (result.isError)
      throw new DirectBotToolError(result.error.info?.code ?? 'tool-failed', result.error.message);
    const value: unknown =
      typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('exitCode' in value) ||
      typeof value.exitCode !== 'number' ||
      !('stdout' in value) ||
      typeof value.stdout !== 'string' ||
      !('stderr' in value) ||
      typeof value.stderr !== 'string'
    )
      throw new DirectBotToolError('tool-failed', 'The scoped CLI did not return a result');
    turn.complete({ exitCode: value.exitCode, stdout: value.stdout, stderr: value.stderr });
    pending.outcome = { kind: 'completed' };
  } catch (error) {
    pending.outcome = { kind: 'failed', error };
    throw error;
  }
  return true;
}

export function stopOrchestratorTurn(
  adapter: StopOrchestratorTurnContext,
  botSlug: string,
): string | undefined {
  for (const [sessionId, active] of adapter.runs) {
    if (active.role !== 'orchestrator' || active.direct || active.run.bot.slug !== botSlug)
      continue;
    const engineStop = adapter.engineStops.get(sessionId);
    if (engineStop !== undefined) {
      adapter.humanStops.add(sessionId);
      engineStop.abort();
      return sessionId;
    }
    if (adapter.abortPreparation(sessionId)) {
      adapter.humanStops.add(sessionId);
      return sessionId;
    }
    const handle = adapter.handles.get(sessionId);
    if (handle === undefined) return undefined;
    adapter.humanStops.add(sessionId);
    adapter.markStop(sessionId, handle);
    handle.agent.cancel({ kind: 'user' });
    return sessionId;
  }
  return undefined;
}

function workContext(
  adapter: WorkContextContext,
  sessionId: string,
  access: Pick<OrchestratorAssignmentAccess, 'grants' | 'list'>,
): { type: 'text'; text: string }[] {
  let context: string;
  try {
    context = hostWorkContext(access);
  } catch {
    return [];
  }
  if (adapter.workContexts.get(sessionId) === context) return [];
  adapter.workContexts.set(sessionId, context);
  return [{ type: 'text', text: context }];
}

export function steerOrchestrator(
  adapter: SteerOrchestratorContext,
  botSlug: string,
  text: string,
): boolean {
  adapter.assertOpen();
  for (const [sessionId, active] of adapter.runs) {
    if (
      active.role !== 'orchestrator' ||
      active.direct ||
      adapter.engineStops.has(sessionId) ||
      active.run.tobCliTurn !== undefined ||
      active.run.bot.slug !== botSlug
    )
      continue;
    const handle = adapter.handles.get(sessionId);
    if (handle === undefined) return false;
    handle.agent.steer(
      createUserMessage({
        content: [
          { type: 'text', text },
          ...workContext(adapter, sessionId, active.run.assignments),
          { type: 'text', text: replyReminderText(adapter.promptText(sessionId)) },
        ],
        source: { kind: 'user' },
      }),
    );
    return true;
  }
  return false;
}

export function acceptAssistantStream(
  adapter: AcceptAssistantStreamContext,
  sessionId: string,
  frame: AssistantStreamFrame,
  agent?: Agent,
): void {
  if (frame.type === 'start') {
    const active = adapter.runs.get(sessionId);
    const config = agent?.session.requestHeader()?.config;
    if (active?.role === 'orchestrator' && config !== undefined)
      active.run.observeTurnTarget?.(frame.turn, frame.step, {
        kind: 'dsh',
        provider: config.provider,
        model: config.model,
      });
  }
  adapter.drafts.accept(sessionId, frame);
}

export function captureNativeOrchestratorModel(
  adapter: CaptureNativeOrchestratorModelContext,
  sessionId: string,
  bot: PersonaBotRecord,
): void {
  if (adapter.runs.has(sessionId)) return;
  const selection = adapter.orchestratorSelections.get(sessionId);
  if (selection === undefined) return;
  selection.current = agentOptions(
    { bot, inboundChannelId: '' },
    adapter.defaultModel.currentSelection(),
    adapter.resolveModelPlan?.(bot.slug) ?? bot.modelPlan,
    adapter.orchestratorRoute?.(sessionId),
  );
  selectNativeModel(adapter.handles.get(sessionId)?.agent, selection.current);
}

export async function loadOrchestrator(
  adapter: LoadOrchestratorContext,
  run: OrchestratorAgentRun,
): Promise<void> {
  adapter.assertOpen();
  if (adapter.engineStops.has(run.sessionId))
    throw new DirectBotToolError('bot-busy', 'The Orchestrator Session is running on an engine');
  if (adapter.hasSession && !(await adapter.hasSession(run.sessionId))) {
    const error = new Error('Original Session is unavailable');
    error.name = 'SessionUnavailableError';
    throw error;
  }
  await adapter.prepare(run.sessionId, async (signal) => {
    await adapter.prepareModelRoute?.(run.bot.slug, 'orchestrator');
    await orchestratorHandle(adapter, run, signal);
  });
}

function orchestratorSelection(
  adapter: OrchestratorSelectionContext,
  run: OrchestratorAgentRun,
): ModelSelection {
  return agentOptions(
    run,
    adapter.defaultModel.currentSelection(),
    adapter.resolveModelPlan?.(run.bot.slug) ?? run.bot.modelPlan,
    run.routingTarget?.kind === 'route'
      ? run.routingTarget.route
      : adapter.orchestratorRoute?.(run.sessionId),
  );
}

export async function orchestratorHandle(
  adapter: OrchestratorHandleContext,
  run: OrchestratorAgentRun,
  signal?: AbortSignal,
): Promise<AgentHandle> {
  signal?.throwIfAborted();
  const existing = adapter.liveHandle(run.sessionId);
  if (existing !== undefined) return existing;
  const resolvedAgentOptions = orchestratorSelection(adapter, run);
  const selection = {
    current: resolvedAgentOptions,
    assembled: undefined as ModelSelection | undefined,
  };
  const borrowedDisposers: Array<() => void | Promise<void>> = [];
  const setup = async (agentCtx: Context, agent: Agent, borrowed = false): Promise<void> => {
    adapter.admitSession?.(agent);
    adapter.onAgentSetup?.(agentCtx, agent, {
      botSlug: run.bot.slug,
      rootRole: 'orchestrator',
    });
    if (!borrowed) {
      await adapter.composePreset(agentCtx, agent, run);
    }
    const disposeFiles = await adapter.onOrchestratorFileSetup?.(agentCtx, agent);
    if (borrowed && disposeFiles !== undefined) borrowedDisposers.push(disposeFiles);
    const disposeSelection = installNativeModelSelection(agentCtx, agent, selection);
    if (borrowed) borrowedDisposers.push(disposeSelection);
    const registerTool = (tool: Parameters<typeof agentCtx.tools.register>[0]) => {
      if (run.tobCli && TOB_CLI_ONLY_TOOLS.has(tool.name)) return () => undefined;
      const dispose = agentCtx.tools.register(tool);
      if (borrowed) borrowedDisposers.push(dispose);
      return dispose;
    };
    const bridgeTools: Array<Parameters<typeof agentCtx.tools.register>[0]> = [];
    const registerBridgeTool = (tool: Parameters<typeof agentCtx.tools.register>[0]) => {
      bridgeTools.push(tool);
    };
    const disposePresentation = await installAgentNativeTools(agentCtx, agent);
    if (borrowed) borrowedDisposers.push(disposePresentation);
    const disposeNativeSchedules = agentCtx.tools.guard(({ name }) =>
      nativeScheduleToolRefusal(name),
    );
    if (borrowed) borrowedDisposers.push(disposeNativeSchedules);
    const disposePurgeFence = agentCtx.tools.guard(() => {
      try {
        adapter.runs.get(run.sessionId)?.run.requireContent?.();
      } catch (error) {
        return error instanceof TeamError
          ? error.code
          : 'Source Event content was purged or its authority is unavailable';
      }
      return undefined;
    });
    if (borrowed) borrowedDisposers.push(disposePurgeFence);
    const disposeRolePrompt = agentCtx.systemPrompt.section({
      name: 'botharness:orchestrator-role',
      order: ROLE_PROMPT_ORDER,
      text: () =>
        orchestratorPromptSections(adapter.promptText(run.sessionId), run.tobCli === true).role,
    });
    if (borrowed) borrowedDisposers.push(disposeRolePrompt);
    if (run.tobCli) {
      const disposeLegacyManagement = agentCtx.tools.guard(({ name }) =>
        TOB_CLI_ONLY_TOOLS.has(name) ? 'Tob must use the scoped deepseekbot CLI' : undefined,
      );
      if (borrowed) borrowedDisposers.push(disposeLegacyManagement);
      const disposeTobPrompt = agentCtx.systemPrompt.section({
        name: 'botharness:tob-cli',
        order: ROLE_PROMPT_ORDER + 1,
        text: TOB_CLI_PROMPT,
      });
      if (borrowed) borrowedDisposers.push(disposeTobPrompt);
    }
    const disposeReplyPrompt = agentCtx.systemPrompt.section({
      name: 'botharness:reply-delivery',
      order: 10_450,
      text: () => orchestratorPromptSections(adapter.promptText(run.sessionId)).replyDelivery,
    });
    if (borrowed) borrowedDisposers.push(disposeReplyPrompt);
    const disposeGenuiPrompt = agentCtx.systemPrompt.section({ ...GENUI_AUTHORING_SECTION });
    if (borrowed) borrowedDisposers.push(disposeGenuiPrompt);
    orchestratorTools(adapter, run, agentCtx, registerTool, registerBridgeTool);
    let bridgeDisposers: Array<() => void> | undefined;
    const listBridgeTools = (connected: boolean) => {
      if (connected === (bridgeDisposers !== undefined)) return;
      if (!connected) {
        for (const dispose of bridgeDisposers!.reverse()) dispose();
        bridgeDisposers = undefined;
        return;
      }
      const disposers = [
        agentCtx.systemPrompt.section({
          name: 'botharness:external-im',
          order: ROLE_PROMPT_ORDER + 1,
          text: EXTERNAL_IM_PROMPT,
        }),
      ];
      for (const tool of bridgeTools) disposers.push(agentCtx.tools.register(tool));
      bridgeDisposers = disposers;
    };
    listBridgeTools(run.externalMessaging?.connected() ?? false);
    if (borrowed) borrowedDisposers.push(() => listBridgeTools(false));
    const disposeBridgeListing = agentCtx.effect(() => {
      adapter.orchestratorBridgeTools.set(run.sessionId, listBridgeTools);
      return () => {
        if (adapter.orchestratorBridgeTools.get(run.sessionId) === listBridgeTools)
          adapter.orchestratorBridgeTools.delete(run.sessionId);
      };
    }, 'botharness: Orchestrator bridge tools lifetime');
    if (borrowed) borrowedDisposers.push(disposeBridgeListing);
  };
  const live = adapter.agents.get?.(SessionId(run.sessionId));
  if (live !== undefined) {
    assertOrchestratorWorkingDirectory(
      run.sessionId,
      live.session.header.cwd,
      resolveOrchestratorCwd(adapter, run.bot),
    );
    adapter.authorizeBorrow?.(live, 'orchestrator');
    try {
      await setup(live.ctx, live, true);
      signal?.throwIfAborted();
      run.tobCliTurn?.signal.throwIfAborted();
    } catch (error) {
      for (const dispose of borrowedDisposers.reverse()) await dispose();
      throw error;
    }
    const borrowed: AgentHandle = {
      agent: live,
      dispose: async () => {
        for (const dispose of borrowedDisposers.reverse()) await dispose();
      },
    };
    adapter.borrowedOrchestrators.add(borrowed);
    adapter.handles.set(run.sessionId, borrowed);
    adapter.orchestratorSelections.set(run.sessionId, selection);
    return borrowed;
  }
  const options = {
    agentOptions: resolvedAgentOptions,
    setup,
    ...(signal === undefined ? {} : { signal }),
  };
  const resume =
    run.resume && (adapter.hasSession === undefined || (await adapter.hasSession(run.sessionId)));
  const modeChoices = await readAssignmentModes(adapter, run.bot.slug, signal);
  if (modeChoices === undefined) adapter.orchestratorModeChoices.delete(run.sessionId);
  else adapter.orchestratorModeChoices.set(run.sessionId, modeChoices);
  const handle = resume
    ? await adapter.agents.resume({
        resumeSessionId: SessionId(run.sessionId),
        ...options,
      })
    : await createOrchestrator(adapter, run, options);
  try {
    signal?.throwIfAborted();
    run.tobCliTurn?.signal.throwIfAborted();
    assertOrchestratorWorkingDirectory(
      run.sessionId,
      handle.agent.session.header.cwd,
      resolveOrchestratorCwd(adapter, run.bot),
    );
  } catch (error) {
    await handle.dispose();
    throw error;
  }
  const raced = adapter.handles.get(run.sessionId);
  if (raced !== undefined || adapter.closed) {
    await handle.dispose();
    if (raced === undefined) throw new Error('Agent adapter is closed');
    return raced;
  }
  adapter.handles.set(run.sessionId, handle);
  adapter.orchestratorSelections.set(run.sessionId, selection);
  return handle;
}

async function createOrchestrator(
  adapter: CreateOrchestratorContext,
  run: OrchestratorAgentRun,
  options: Omit<CreateAgentOptions, 'sessionId' | 'meta'>,
): Promise<AgentHandle> {
  await adapter.loadBotModes(options.signal);
  const meta = createMeta(
    run,
    resolveOrchestratorCwd(adapter, run.bot),
    adapter.ensureWorkspace,
    adapter.botModeOf(run.bot),
  );
  return adapter.agents.create({
    sessionId: SessionId(run.sessionId),
    ...(meta === undefined ? {} : { meta }),
    ...options,
  });
}

function resolveOrchestratorCwd(
  adapter: ResolveOrchestratorCwdContext,
  bot: PersonaBotRecord,
): string {
  const cwd = adapter.orchestratorCwd?.(bot);
  if (cwd === undefined) {
    throw new Error(`Memory workspace unavailable for Orchestrator ${bot.slug}`);
  }
  return cwd;
}

async function readAssignmentModes(
  adapter: ReadAssignmentModesContext,
  botSlug: string,
  signal: AbortSignal | undefined,
): Promise<AssignmentModeChoices | undefined> {
  signal?.throwIfAborted();
  const reading = adapter.assignmentModes?.(botSlug).catch(() => undefined);
  return reading === undefined ? undefined : untilAborted(reading, signal);
}
