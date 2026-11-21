import { installMemorySkillProvider } from '../skills/memory-provider.js';
import { TeamError } from '../team/error.js';
import {
  installNativeModelSelection,
  installAgentNativeTools,
  selectNativeModel,
} from './native-agent-compat.js';
import { createAssignmentReportTool } from '../features/assignments/tools.js';
import {
  ASSIGNMENT_PROMPT,
  DANGER_ASSIGNMENT_PROMPT,
  assignmentMessage,
} from '../features/assignments/prompt.js';
import { AssignmentInboxAcceptanceUncertainError } from './assignment-delivery.js';
import type { Context } from '@deepseek-ai/cordis';
import type {
  Agent,
  AgentHandle,
  CreateAgentOptions,
  ModelSelection,
} from '@deepseek-ai/dsh-agent';
import { SessionId, type SessionLogOffset } from '@deepseek-ai/dsh-session';
import { routingTargetRestKey } from '../models/group-fallback.js';
import type { AssignmentAgentRun, AssignmentRequestDelivery } from './bot-runtime.js';
import { EngineLimitError } from '../engines/engine-session.js';
import {
  ROLE_PROMPT_ORDER,
  appendSkillInstallation,
  type ActiveRun,
  agentOptions,
  createMeta,
  requireCompletedTurn,
  PreparationStopped,
  interruptedToolCalls,
} from './dsh-bot-agent-adapter-shared.js';
import { runEngineAssignment } from './dsh-bot-agent-adapter-engine.js';
import { UNREPORTED_FINAL_PREFIX } from '../features/assignments/prompt.js';
import type { DshBotAgentAdapterState } from './dsh-bot-agent-adapter-state.js';

type RunAssignmentContext = Pick<DshBotAgentAdapterState, 'assertOpen'> & DriveAssignmentContext;

type RequestAssignmentContext = Pick<
  DshBotAgentAdapterState,
  'assertOpen' | 'assignmentGroupRuns' | 'engines' | 'handles' | 'runs' | 'stoppedBots' | 'stopping'
> &
  SelectAssignmentModelContext &
  DriveAssignmentContext;

type StopAssignmentContext = Pick<
  DshBotAgentAdapterState,
  'abortPreparation' | 'engineStops' | 'handles' | 'markStop' | 'runs' | 'stopping'
>;

type DriveAssignmentContext = Pick<
  DshBotAgentAdapterState,
  'assignmentGroupRuns' | 'closed' | 'stopping'
> &
  DriveAssignmentAttemptContext;

type DriveAssignmentAttemptContext = Pick<
  DshBotAgentAdapterState,
  | 'abandonable'
  | 'assignmentSelections'
  | 'engines'
  | 'observeTurnFailure'
  | 'prepare'
  | 'prepareModelRoute'
  | 'runs'
  | 'runsOnEngine'
  | 'stopSeqs'
  | 'stoppedBots'
  | 'stopping'
  | 'turnRefusal'
> &
  Parameters<typeof runEngineAssignment>[0] &
  AssignmentHandleContext &
  SelectAssignmentModelContext;

type CreateAssignmentContext = Pick<
  DshBotAgentAdapterState,
  'agents' | 'botModeOf' | 'loadBotModes'
>;

type AssignmentHandleContext = Pick<
  DshBotAgentAdapterState,
  | 'admitSession'
  | 'agents'
  | 'assignmentSelections'
  | 'authorizeBorrow'
  | 'closed'
  | 'composePreset'
  | 'defaultModel'
  | 'handles'
  | 'hasSession'
  | 'liveHandle'
  | 'onAgentSetup'
  | 'orchestratorCwd'
  | 'promptText'
  | 'resolveModelPlan'
  | 'runs'
> &
  CreateAssignmentContext;

type SelectAssignmentModelContext = Pick<
  DshBotAgentAdapterState,
  'assignmentSelections' | 'defaultModel' | 'handles' | 'resolveModelPlan'
>;

function finalAssistantText(handle: AgentHandle, fromSeq: SessionLogOffset): string | undefined {
  const event = handle.agent.session
    .snapshotEvents(fromSeq)
    .findLast((candidate) => candidate.type === 'assistant/message');
  const content = (event?.data as { message?: { content?: unknown } } | undefined)?.message
    ?.content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .flatMap((block: unknown) =>
      typeof block === 'object' &&
      block !== null &&
      (block as { type?: unknown }).type === 'text' &&
      typeof (block as { text?: unknown }).text === 'string'
        ? [(block as { text: string }).text]
        : [],
    )
    .join('\n')
    .trim();
  return text.length > 0 ? text : undefined;
}

export async function runAssignment(
  adapter: RunAssignmentContext,
  run: AssignmentAgentRun,
): Promise<void> {
  adapter.assertOpen();
  await driveAssignment(adapter, run);
}

export function requestAssignment(
  adapter: RequestAssignmentContext,
  run: AssignmentAgentRun,
): AssignmentRequestDelivery {
  adapter.assertOpen();
  if (adapter.stoppedBots.has(run.bot.slug)) throw new Error('PersonaBot is deleted');
  adapter.stopping.delete(run.sessionId);
  const handle = adapter.handles.get(run.sessionId);
  const active = adapter.runs.get(run.sessionId);
  if (handle !== undefined && active?.role === 'assignment') {
    selectAssignmentModel(adapter, run);
    try {
      handle.agent.steer(assignmentMessage(run.text));
    } catch (error) {
      throw new AssignmentInboxAcceptanceUncertainError(error);
    }
    return { delivery: 'steer' };
  }
  if (active?.role === 'assignment' && adapter.engines?.steerAssignment?.(run.sessionId, run.text))
    return { delivery: 'steer' };
  if (adapter.assignmentGroupRuns.has(run.sessionId))
    throw new Error('Assignment is selecting a Routing Group member');
  let accept!: () => void;
  let refuse!: (error: unknown) => void;
  const accepted = new Promise<void>((resolve, reject) => {
    accept = resolve;
    refuse = reject;
  });
  const done = driveAssignment(adapter, run, accept);
  void done.catch(refuse);
  return { delivery: 'followup', accepted, done };
}

export async function stopAssignment(
  adapter: StopAssignmentContext,
  sessionId: string,
): Promise<void> {
  adapter.stopping.add(sessionId);
  adapter.abortPreparation(sessionId);
  if (adapter.runs.get(sessionId)?.role === 'assignment')
    adapter.engineStops.get(sessionId)?.abort();
  const handle = adapter.handles.get(sessionId);
  if (handle !== undefined && adapter.runs.get(sessionId)?.role === 'assignment') {
    adapter.markStop(sessionId, handle);
    handle.agent.cancel({ kind: 'user' });
    await handle.agent.whenIdle();
  }
}

async function driveAssignment(
  adapter: DriveAssignmentContext,
  run: AssignmentAgentRun,
  accepted?: () => void,
): Promise<void> {
  const select = run.selectGroupTarget;
  if (select === undefined) return driveAssignmentAttempt(adapter, run, accepted);
  const { bot, sessionId, modelRoute: _modelRoute, ...initial } = run;
  const attempted = new Set<string>();
  let next = initial;
  let acceptedInput = false;
  let terminalReport = false;
  let failure: Parameters<NonNullable<AssignmentAgentRun['failedTurn']>>[0] | undefined;
  adapter.assignmentGroupRuns.add(sessionId);
  try {
    let target = await select(attempted);
    if (target === undefined) throw new Error('Assignment stopped before Inbox acceptance');
    for (;;) {
      if (adapter.stopping.has(sessionId) || adapter.closed) {
        if (!acceptedInput) throw new Error('Assignment stopped before Inbox acceptance');
        return;
      }
      const current = target;
      attempted.add(routingTargetRestKey(current));
      let acceptedThisAttempt = false;
      try {
        await driveAssignmentAttempt(adapter, {
          ...next,
          bot,
          sessionId,
          routingTarget: current,
          ...(current.kind === 'route' ? { modelRoute: current.route } : {}),
          report: async (input, execution) => {
            const report = await run.report(input, execution);
            terminalReport ||= input.state === 'completed' || input.state === 'failed';
            return report;
          },
          failedTurn: (execution) => {
            failure = execution;
          },
          accepted: () => {
            acceptedThisAttempt = true;
            if (!acceptedInput) {
              acceptedInput = true;
              accepted?.();
              run.accepted?.();
            }
          },
        });
        return;
      } catch (error) {
        if (adapter.stopping.has(sessionId) || adapter.closed) return;
        if (terminalReport && error instanceof EngineLimitError) return;
        target = await select(attempted, error);
        if (target === undefined) return;
        const inputRecorded =
          current.kind === 'route'
            ? acceptedThisAttempt
            : error instanceof EngineLimitError && error.inputRecorded;
        const { acceptNativeInput: _accept, beginTurn: _begin, ...continuation } = next;
        next = {
          ...continuation,
          text: inputRecorded
            ? '[Host: The previous model reached its limit. Continue the current Assignment from the saved Session. Use completed tool results and verify interrupted effects before retrying.]'
            : next.text,
          resume: true,
          ...(initial.resume === true ? {} : { continueInitialGroupTurn: true }),
          ...(current.kind === 'route' && acceptedThisAttempt
            ? { continuingFromNativeRoute: true }
            : {}),
        };
        failure = undefined;
      }
    }
  } catch (error) {
    if (failure !== undefined) run.failedTurn?.(failure);
    throw error;
  } finally {
    adapter.assignmentGroupRuns.delete(sessionId);
  }
}

async function driveAssignmentAttempt(
  adapter: DriveAssignmentAttemptContext,
  run: AssignmentAgentRun,
  accepted?: () => void,
): Promise<void> {
  if (adapter.stoppedBots.has(run.bot.slug)) throw new Error('PersonaBot is deleted');
  const entry: ActiveRun = { role: 'assignment', run, reported: false };
  adapter.runs.set(run.sessionId, entry);
  adapter.stopSeqs.delete(run.sessionId);
  const abandonable = adapter.abandonable(run.sessionId);
  try {
    const engines = adapter.engines;
    if (
      engines !== undefined &&
      (run.routingTarget === undefined
        ? adapter.runsOnEngine(run.bot.slug, 'assignment')
        : run.routingTarget.kind === 'engine')
    ) {
      await runEngineAssignment(adapter, run, engines, entry, abandonable.abandoned, accepted);
      return;
    }
    if (engines?.isLive(run.sessionId)) await engines.release(run.sessionId);
    const handle = await adapter
      .prepare(run.sessionId, async (signal) => {
        await adapter.prepareModelRoute?.(run.bot.slug, 'assignment', run.modelRoute);
        return assignmentHandle(adapter, run, signal);
      })
      .catch((error: unknown) => {
        if (error instanceof PreparationStopped)
          throw new Error('Assignment stopped before Inbox acceptance');
        throw error;
      });
    selectAssignmentModel(adapter, run);
    if (adapter.stopping.has(run.sessionId) || adapter.stoppedBots.has(run.bot.slug))
      throw new Error('Assignment stopped before Inbox acceptance');
    const fromSeq = handle.agent.session.seq;
    run.setExecutionReady?.(true);
    run.requireContent?.();
    if (run.acceptNativeInput !== undefined) {
      if (!run.acceptNativeInput()) return;
    } else {
      run.beginTurn?.();
      try {
        handle.agent.followup(assignmentMessage(run.text));
      } catch (error) {
        throw new AssignmentInboxAcceptanceUncertainError(error);
      }
    }
    accepted?.();
    run.accepted?.();
    const idle = await Promise.race([handle.agent.whenIdle(), abandonable.abandoned]);
    if (adapter.stopping.has(run.sessionId) || adapter.stoppedBots.has(run.bot.slug)) {
      const interrupted = interruptedToolCalls(
        handle,
        fromSeq,
        adapter.stopSeqs.get(run.sessionId),
      );
      if (interrupted.length > 0) run.toolsInterrupted?.(interrupted);
      return;
    }
    if (idle === 'abandoned') return;
    const provider = adapter.assignmentSelections.get(run.sessionId)?.current?.provider;
    const completion = requireCompletedTurn(
      handle,
      fromSeq,
      run.cancelledTurn,
      run.failedTurn,
      (code) => {
        if (provider !== undefined) adapter.observeTurnFailure?.(provider, code);
      },
      adapter.turnRefusal?.(run.sessionId),
    );
    run.completedTurn?.(completion);
    if (run.resume === true && run.continueInitialGroupTurn !== true) return;
    if (!entry.reported) {
      const text = finalAssistantText(handle, fromSeq);
      if (text !== undefined) {
        await run.report(
          { state: 'completed', summary: `${UNREPORTED_FINAL_PREFIX}\n\n${text}` },
          { turn: completion.turn },
        );
        entry.reported = true;
      }
    }
    if (!entry.reported) {
      throw new Error('Assignment finished without report_to_orchestrator');
    }
  } finally {
    abandonable.release();
    adapter.stopSeqs.delete(run.sessionId);
    if (adapter.runs.get(run.sessionId) === entry) {
      adapter.runs.delete(run.sessionId);
      run.setExecutionReady?.(false);
    }
  }
}

async function createAssignment(
  adapter: CreateAssignmentContext,
  run: AssignmentAgentRun,
  options: CreateAgentOptions,
  signal: AbortSignal | undefined,
): Promise<AgentHandle> {
  await adapter.loadBotModes(signal);
  const meta = createMeta(run, run.permission.primaryCwd, undefined, adapter.botModeOf(run.bot));
  return adapter.agents.create({
    ...options,
    ...(meta === undefined ? {} : { meta }),
    ...(signal === undefined ? {} : { signal }),
  });
}

async function assignmentHandle(
  adapter: AssignmentHandleContext,
  run: AssignmentAgentRun,
  signal?: AbortSignal,
): Promise<AgentHandle> {
  signal?.throwIfAborted();
  const existing = adapter.liveHandle(run.sessionId);
  if (existing !== undefined) return existing;
  const resolvedAgentOptions = agentOptions(
    run,
    adapter.defaultModel.currentSelection(),
    adapter.resolveModelPlan?.(run.bot.slug) ?? run.bot.modelPlan,
  );
  const selection = {
    current: resolvedAgentOptions,
    assembled: undefined as ModelSelection | undefined,
  };
  const borrowedDisposers: Array<() => void | Promise<void>> = [];
  const createOptions: CreateAgentOptions = {
    sessionId: SessionId(run.sessionId),
    agentOptions: resolvedAgentOptions,
    setup: async (agentCtx, agent, borrowed = false) => {
      adapter.admitSession?.(agent);
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
      adapter.onAgentSetup?.(agentCtx, agent, {
        botSlug: run.bot.slug,
        rootRole: 'assignment',
      });
      if (!borrowed) {
        await adapter.composePreset(agentCtx, agent, run);
      }
      const disposeSelection = installNativeModelSelection(agentCtx, agent, selection);
      if (borrowed) borrowedDisposers.push(disposeSelection);
      const registerTool = (tool: Parameters<typeof agentCtx.tools.register>[0]) => {
        const dispose = agentCtx.tools.register(tool);
        if (borrowed) borrowedDisposers.push(dispose);
        return dispose;
      };
      const disposePresentation = await installAgentNativeTools(agentCtx, agent);
      if (borrowed) borrowedDisposers.push(disposePresentation);
      const disposeRolePrompt = agentCtx.systemPrompt.section({
        name: 'botharness:assignment-role',
        order: ROLE_PROMPT_ORDER,
        text: () =>
          appendSkillInstallation(
            run.permission.mode === 'danger-full-access'
              ? DANGER_ASSIGNMENT_PROMPT
              : ASSIGNMENT_PROMPT,
            adapter.promptText(run.sessionId),
          ),
      });
      if (borrowed) borrowedDisposers.push(disposeRolePrompt);
      const disposeMemorySkills = installMemorySkillProvider(agentCtx, () =>
        adapter.orchestratorCwd?.(run.bot),
      );
      if (borrowed) borrowedDisposers.push(disposeMemorySkills);
      registerTool(
        createAssignmentReportTool(() => {
          const active = adapter.runs.get(run.sessionId);
          return active?.role === 'assignment' ? active : undefined;
        }, agent),
      );
    },
  };
  const live = adapter.agents.get?.(SessionId(run.sessionId));
  if (live !== undefined) {
    adapter.authorizeBorrow?.(live, 'assignment');
    try {
      await (
        createOptions.setup as (ctx: Context, agent: Agent, borrowed: boolean) => Promise<void>
      )(live.ctx, live, true);
      signal?.throwIfAborted();
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
    adapter.handles.set(run.sessionId, borrowed);
    adapter.assignmentSelections.set(run.sessionId, selection);
    return borrowed;
  }
  const resume =
    run.resume === true &&
    (adapter.hasSession === undefined || (await adapter.hasSession(run.sessionId)));
  const handle = resume
    ? await adapter.agents.resume({
        resumeSessionId: SessionId(run.sessionId),
        agentOptions: resolvedAgentOptions,
        setup: createOptions.setup!,
        ...(signal === undefined ? {} : { signal }),
      })
    : await createAssignment(adapter, run, createOptions, signal);
  const raced = adapter.handles.get(run.sessionId);
  if (raced !== undefined || adapter.closed) {
    await handle.dispose();
    if (raced === undefined) throw new Error('Agent adapter is closed');
    return raced;
  }
  adapter.handles.set(run.sessionId, handle);
  adapter.assignmentSelections.set(run.sessionId, selection);
  return handle;
}

function selectAssignmentModel(
  adapter: SelectAssignmentModelContext,
  run: AssignmentAgentRun,
): void {
  const selection = adapter.assignmentSelections.get(run.sessionId);
  if (selection === undefined) return;
  selection.current = agentOptions(
    run,
    adapter.defaultModel.currentSelection(),
    adapter.resolveModelPlan?.(run.bot.slug) ?? run.bot.modelPlan,
  );
  selectNativeModel(adapter.handles.get(run.sessionId)?.agent, selection.current);
}
