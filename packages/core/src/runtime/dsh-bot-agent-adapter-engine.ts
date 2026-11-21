import { randomUUID } from 'node:crypto';
import { ENGINE_REPORT_TOOL, isReportState } from '../features/assignments/tools.js';
import { ASSIGNMENT_REPORT_CONTRACT } from '../features/assignments/prompt.js';
import { replyReminderText } from '../features/messaging/prompt.js';
import type { Context } from '@deepseek-ai/cordis';
import { SessionId } from '@deepseek-ai/dsh-session';
import { ToolArgsError, type ToolDefinition, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import {
  DirectBotToolError,
  type AssignmentAgentRun,
  type OrchestratorAgentRun,
} from './bot-runtime.js';
import { ENGINE_GATEWAY_TOOLS } from '../engines/engine-host.js';
import { engineAssignmentInstructions, engineInstructions } from '../engines/engine-persona.js';
import { EngineRefusal } from '../engines/engine-session.js';
import {
  ENGINE_LISTED_TOOLS,
  ENGINE_UNSUPPORTED_TOOLS,
  type EngineBotTool,
  searchEngineTools,
  TOOL_CALL,
  TOOL_SEARCH,
} from '../engines/engine-tools.js';
import { type ActiveRun, untilAborted } from './dsh-bot-agent-adapter-shared.js';
import { directToolDefinitions, orchestratorTools } from './dsh-bot-agent-adapter-tools.js';
import { UNREPORTED_FINAL_PREFIX } from '../features/assignments/prompt.js';
import { orchestratorPromptSections } from './dsh-bot-agent-adapter-orchestrator-prompt.js';
import type { DshBotEngines } from './dsh-bot-agent-adapter.js';
import type { DshBotAgentAdapterState } from './dsh-bot-agent-adapter-state.js';

type RunsOnEngineContext = Pick<DshBotAgentAdapterState, 'engines'>;

type RunEngineTurnContext = Pick<
  DshBotAgentAdapterState,
  | 'engineChannels'
  | 'enginePersona'
  | 'engineStops'
  | 'engineToolGate'
  | 'engineWorkspaceMode'
  | 'orchestratorCwd'
  | 'promptText'
> &
  EngineCatalogContext &
  Parameters<typeof directToolDefinitions>[0] &
  ReleaseNativeSessionContext;

type ReleaseNativeSessionContext = Pick<
  DshBotAgentAdapterState,
  | 'agents'
  | 'authorizeBorrow'
  | 'borrowedOrchestrators'
  | 'forgetHandle'
  | 'handles'
  | 'liveHandle'
  | 'releaseNativeAgent'
>;

type EngineCatalogContext = Pick<DshBotAgentAdapterState, 'engineTools'> &
  Parameters<typeof orchestratorTools>[0];

type EngineToolCatalogContext = EngineCatalogContext;

type RunEngineAssignmentContext = Pick<
  DshBotAgentAdapterState,
  'engineStops' | 'engineWorkspaceMode' | 'runs' | 'stoppedBots' | 'stopping'
> &
  ReleaseNativeSessionContext;

function toolCallTarget(args: Record<string, unknown>): [string, Record<string, unknown>] {
  const name = args['name'];
  const inner = args['arguments'] ?? {};
  if (typeof name !== 'string' || name === '') throw new Error('tool_call: name is required');
  if (typeof inner !== 'object' || inner === null || Array.isArray(inner))
    throw new Error('tool_call: arguments must be an object');
  return [name, inner as Record<string, unknown>];
}

export function runsOnEngine(
  adapter: RunsOnEngineContext,
  botSlug: string,
  role: 'orchestrator' | 'assignment' = 'orchestrator',
): boolean {
  const engines = adapter.engines;
  if (engines === undefined) return false;
  return engines.runsOnEngine?.(botSlug, role) ?? engines.engineFor(botSlug, role) !== undefined;
}

export async function runEngineTurn(
  adapter: RunEngineTurnContext,
  run: OrchestratorAgentRun,
  engines: DshBotEngines,
  abandoned: Promise<'abandoned'>,
): Promise<void> {
  const stop = new AbortController();
  adapter.engineStops.set(run.sessionId, stop);
  if (run.inboundChannelId !== undefined)
    adapter.engineChannels.set(run.sessionId, run.inboundChannelId);
  void abandoned.then(() => stop.abort());
  try {
    if (stop.signal.aborted) return;
    run.setExecutionReady?.(true);
    run.requireContent?.();
    if (run.acceptNativeInput !== undefined && !run.acceptNativeInput()) return;
    const catalog = await engineCatalog(adapter, run, stop.signal);
    if (stop.signal.aborted) return;
    const tools = [
      ...directToolDefinitions(adapter, run).filter((tool) => ENGINE_LISTED_TOOLS.has(tool.name)),
      TOOL_SEARCH,
      TOOL_CALL,
    ].filter((tool) => ENGINE_GATEWAY_TOOLS.has(tool.name));
    const text = [run.message, run.inbox].filter((part) => part.trim().length > 0).join('\n\n');
    const promptText = adapter.promptText(run.sessionId);
    const persona = adapter.enginePersona?.(run.bot) ?? {};
    const sessionCwd = adapter.orchestratorCwd?.(run.bot);
    run.inputAccepted?.();
    await engines.runTurn({
      botSlug: run.bot.slug,
      ...(run.observeTurnTarget === undefined ? {} : { observeTurnTarget: run.observeTurnTarget }),
      ...(run.routingTarget?.kind === 'engine' ? { target: run.routingTarget } : {}),
      ...(run.continuingFromNativeRoute ? { continuingFromNativeRoute: true } : {}),
      ...(sessionCwd === undefined ? {} : { sessionCwd }),
      workspaceMode: () => adapter.engineWorkspaceMode?.(run.bot.slug) ?? 'workspace-write',
      releaseNativeSession: () => releaseNativeSession(adapter, run.sessionId, 'orchestrator'),
      sessionId: run.sessionId,
      channelId: run.inboundChannelId,
      input: `${text}\n\n${replyReminderText(promptText)}`,
      readRecoveryContext: () => {
        run.requireContent?.();
        if (run.inboundChannelId === undefined) return [];
        return run.channels
          .read({ channelId: run.inboundChannelId, limit: 8, observe: false })
          .toReversed()
          .map(({ message }) => ({
            label: 'Channel message',
            text: JSON.stringify({
              author: message.author,
              at: message.at,
              body: message.body.slice(0, 600),
            }),
          }));
      },
      instructions: engineInstructions({
        name: run.bot.displayName,
        ...persona,
        replyDelivery: orchestratorPromptSections(promptText).replyDelivery,
      }),
      tools,
      execute: async (name, args, signal, context) => {
        if (name === TOOL_SEARCH.name) return searchEngineTools(catalog, args);
        const [toolName, toolArgs] = name === TOOL_CALL.name ? toolCallTarget(args) : [name, args];
        const tool = catalog.find((entry) => entry.name === toolName);
        if (
          tool === undefined ||
          (name !== TOOL_CALL.name && !tools.some((entry) => entry.name === name))
        )
          throw new Error(`refused: ${toolName} is not available to this engine Session`);
        if (adapter.engineToolGate !== undefined) {
          const refusal = await adapter.engineToolGate({
            botSlug: run.bot.slug,
            sessionId: run.sessionId,
            session: context.session,
            toolName,
            args: toolArgs,
            signal,
            ask: context.ask,
          });
          if (refusal !== undefined) throw new Error(`refused: ${refusal}`);
        }
        return tool.run(toolArgs, signal);
      },
      signal: stop.signal,
    });
  } finally {
    if (adapter.engineStops.get(run.sessionId) === stop) {
      adapter.engineStops.delete(run.sessionId);
      adapter.engineChannels.delete(run.sessionId);
    }
  }
}

async function releaseNativeSession(
  adapter: ReleaseNativeSessionContext,
  sessionId: string,
  role: 'orchestrator' | 'assignment',
): Promise<boolean> {
  const handle = adapter.liveHandle(sessionId);
  const agent = handle?.agent ?? adapter.agents.get?.(SessionId(sessionId));
  if (agent === undefined) return false;
  adapter.authorizeBorrow?.(agent, role);
  const release = adapter.releaseNativeAgent?.(agent);
  if (release !== undefined) {
    if (!(await release))
      throw new DirectBotToolError('bot-busy', 'The native Agent could not release its Session');
  } else if (handle !== undefined && !adapter.borrowedOrchestrators.has(handle)) {
    if (agent.status === 'running' || agent.inbox?.nextTurn.length || agent.inbox?.nextStep.length)
      throw new DirectBotToolError('bot-busy', 'The native Agent has pending work');
    await handle.dispose();
  } else {
    throw new Error('This DSH Host cannot release a borrowed Agent for a Subscription Engine');
  }
  if (adapter.handles.get(sessionId) === handle) adapter.forgetHandle(sessionId);
  return true;
}

async function engineCatalog(
  adapter: EngineCatalogContext,
  run: OrchestratorAgentRun,
  signal: AbortSignal,
): Promise<EngineBotTool[]> {
  const own: ToolDefinition[] = [];
  const collect = (tool: ToolDefinition) => {
    if (!ENGINE_UNSUPPORTED_TOOLS.has(tool.name)) own.push(tool);
  };
  orchestratorTools(
    adapter,
    run,
    { get: () => undefined } as Pick<Context, 'get'>,
    collect,
    collect,
  );
  const catalog: EngineBotTool[] = own.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters as Record<string, unknown>,
    run: async (args, toolSignal) => {
      const callId = `${run.sessionId}:engine:${randomUUID()}`;
      try {
        return await tool.execute(args, {
          callId,
          rootCallId: callId,
          name: tool.name,
          arguments: args,
          signal: toolSignal,
          deferContext: () => undefined,
          concludeTurn: () => undefined,
        } as unknown as ToolRunContext);
      } catch (error) {
        if (error instanceof ToolArgsError)
          throw new Error(`${tool.name}: ${error.message}`, { cause: error });
        throw error;
      }
    },
  }));
  const contributed = await untilAborted(
    Promise.resolve(
      adapter.engineTools?.({ botSlug: run.bot.slug, sessionId: run.sessionId }) ?? [],
    ).catch(() => []),
    signal,
  ).catch(() => []);
  for (const tool of contributed)
    if (!catalog.some((entry) => entry.name === tool.name)) catalog.push(tool);
  return catalog;
}

export async function engineToolCatalog(
  adapter: EngineToolCatalogContext,
  botSlug: string,
): Promise<EngineBotTool[]> {
  return engineCatalog(
    adapter,
    { sessionId: '', bot: { slug: botSlug } } as unknown as OrchestratorAgentRun,
    AbortSignal.timeout(30_000),
  );
}

export async function runEngineAssignment(
  adapter: RunEngineAssignmentContext,
  run: AssignmentAgentRun,
  engines: DshBotEngines,
  entry: Extract<ActiveRun, { role: 'assignment' }>,
  abandoned: Promise<'abandoned'>,
  accepted: (() => void) | undefined,
): Promise<void> {
  const stop = new AbortController();
  adapter.engineStops.set(run.sessionId, stop);
  void abandoned.then(() => stop.abort());
  const stopped = () =>
    stop.signal.aborted ||
    adapter.stopping.has(run.sessionId) ||
    adapter.stoppedBots.has(run.bot.slug);
  let terminalReport:
    | { inputRevision: number; published: ReturnType<AssignmentAgentRun['report']> }
    | undefined;
  try {
    if (stopped()) throw new Error('Assignment stopped before Inbox acceptance');
    const target = run.routingTarget?.kind === 'engine' ? run.routingTarget : undefined;
    engines.assertAssignmentAccount?.(run.bot.slug, target);
    run.setExecutionReady?.(true);
    run.requireContent?.();
    if (run.acceptNativeInput !== undefined) {
      if (!run.acceptNativeInput()) return;
    } else run.beginTurn?.();
    accepted?.();
    run.accepted?.();
    const outcome =
      (await engines.runTurn({
        botSlug: run.bot.slug,
        role: 'assignment',
        ...(target === undefined ? {} : { target }),
        ...(run.groupEffort === undefined ? {} : { groupEffort: run.groupEffort }),
        ...(run.continuingFromNativeRoute ? { continuingFromNativeRoute: true } : {}),
        releaseNativeSession: () => releaseNativeSession(adapter, run.sessionId, 'assignment'),
        cwd: run.permission.primaryCwd,
        workspaceMode: () =>
          adapter.engineWorkspaceMode?.(run.bot.slug, run.permission) ?? 'read-only',
        sessionId: run.sessionId,
        channelId: undefined,
        input: `${run.text}\n\n[Host Assignment report transport] ${ASSIGNMENT_REPORT_CONTRACT}`,
        readRecoveryContext: () => {
          const entry = run.recoveryEntry?.();
          return entry === undefined
            ? undefined
            : [
                {
                  label: 'Assignment Directory',
                  text: JSON.stringify({ title: entry.title, description: entry.description }),
                },
              ];
        },
        instructions: [
          ASSIGNMENT_REPORT_CONTRACT,
          engineAssignmentInstructions({
            name: run.bot.displayName,
            cwd: run.permission.primaryCwd,
            fullAccess: run.permission.mode === 'danger-full-access',
          }),
        ].join('\n\n'),
        tools: [ENGINE_REPORT_TOOL],
        execute: async (name, args, signal, context) => {
          if (name !== ENGINE_REPORT_TOOL.name)
            throw new Error(`refused: ${name} is not available to this Assignment`);
          const state = typeof args['state'] === 'string' ? args['state'] : '';
          if (!isReportState(state))
            throw new Error(
              'report_to_orchestrator: state must be progress, completed, blocked, waiting-human, or failed',
            );
          if (typeof args['summary'] !== 'string')
            throw new Error('report_to_orchestrator: summary must be a string');
          const assertActive = () => {
            if (signal.aborted || adapter.runs.get(run.sessionId) !== entry)
              throw new Error('report_to_orchestrator: Assignment run is unavailable');
          };
          assertActive();
          const terminal = state === 'completed' || state === 'failed';
          const inputRevision = context.assignmentInputRevision ?? 0;
          const prior = terminalReport;
          if (terminal && prior?.inputRevision === inputRevision) {
            await prior.published;
            return 'Terminal report already delivered to the Orchestrator.';
          }
          const start = context.session
            .snapshotEvents()
            .findLast((event) => event.type === 'turn/start');
          if (start === undefined) throw new Error('Assignment Report has no native Turn identity');
          const summary = args['summary'];
          const expectsReply = args['expects_reply'];
          const publish = async () => {
            assertActive();
            return run.report(
              {
                state,
                summary,
                ...(expectsReply === undefined ? {} : { expectsReply: expectsReply === true }),
              },
              { turn: start.data.turn },
            );
          };
          const report =
            terminal && prior !== undefined
              ? prior.published.catch(() => undefined).then(publish)
              : publish();
          if (terminal) terminalReport = { inputRevision, published: report };
          try {
            await report;
          } catch (error) {
            if (terminalReport?.published === report) terminalReport = undefined;
            throw error;
          }
          entry.reported = true;
          return 'Report delivered to the Orchestrator.';
        },
        signal: stop.signal,
      })) ?? {};
    if (stopped()) return;
    await terminalReport?.published.catch(() => undefined);
    if (stopped()) return;
    if (outcome.turn !== undefined && outcome.endSeq !== undefined)
      run.completedTurn?.({ turn: outcome.turn, endSeq: outcome.endSeq });
    if (run.resume === true && run.continueInitialGroupTurn !== true) return;
    if (!entry.reported && outcome.text !== undefined && outcome.text.trim() !== '') {
      await run.report(
        { state: 'completed', summary: `${UNREPORTED_FINAL_PREFIX}\n\n${outcome.text.trim()}` },
        ...(outcome.turn === undefined ? [] : [{ turn: outcome.turn }]),
      );
      entry.reported = true;
    }
    if (!entry.reported) throw new Error('Assignment finished without report_to_orchestrator');
  } catch (error) {
    if (
      !stopped() &&
      error instanceof EngineRefusal &&
      error.code === 'engine-recovery-unavailable'
    )
      await (run.failEngineRecovery?.(error.message) ??
        run.report({ state: 'failed', summary: error.message }));
    throw error;
  } finally {
    if (adapter.engineStops.get(run.sessionId) === stop) adapter.engineStops.delete(run.sessionId);
  }
}
