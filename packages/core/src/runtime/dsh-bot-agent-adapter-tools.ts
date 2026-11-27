import { hasIrreversibleExternalEffect, toolEffects } from '../workspaces/tool-effects.js';
import { createChannelActionTool } from './channel-action-tool.js';
import { executeNativeTool } from './native-agent-compat.js';
import { PRIVATE_INPUT_TOOLS } from '../credentials/tool-contract.js';
import { createBotMessageTool } from './bot-message-tool.js';
import { agentFeatureContext } from './agent-feature-context.js';
import type { FeatureToolPlacement, FeatureToolRegistrar } from '../kernel/feature-contribution.js';
import { registerInboxTools, registerSourceAttentionTools } from '../features/activity/tools.js';
import {
  createAssignmentTool,
  registerAssignmentTools,
  type AssignmentToolOptions,
} from '../features/assignments/tools.js';
import type { Context } from '@deepseek-ai/cordis';
import { AttachmentId } from '@deepseek-ai/dsh-attachment';
import { isBotSubagentModelTool } from './subagent-model-tools.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import {
  defineTool,
  ToolArgsError,
  type ToolDefinition,
  type ToolRunContext,
} from '@deepseek-ai/dsh-tools';
import {
  DirectBotToolError,
  type DirectBotToolSpec,
  type OrchestratorAgentRun,
} from './bot-runtime.js';
import { TURN_ONLY_BOT_TOOLS } from './dsh-bot-agent-adapter-shared.js';
import type { DshBotAgentAdapterState } from './dsh-bot-agent-adapter-state.js';

type OrchestratorToolsContext = Pick<
  DshBotAgentAdapterState,
  | 'assignmentGroups'
  | 'assignmentModes'
  | 'drafts'
  | 'engineChannels'
  | 'featureContributions'
  | 'modelFilter'
  | 'promptText'
  | 'openAssignmentRoutes'
  | 'orchestratorModeChoices'
  | 'resolveModelPlan'
  | 'runs'
>;

type DirectToolsContext = Pick<DshBotAgentAdapterState, 'handles' | 'subagentTools'> &
  DirectToolDefinitionsContext;

type RunDirectToolContext = Pick<
  DshBotAgentAdapterState,
  | 'agents'
  | 'assertOpen'
  | 'handles'
  | 'observeDirectToolCleanupFailure'
  | 'orchestratorHandle'
  | 'prepare'
  | 'runs'
  | 'stoppedBots'
  | 'subagentTools'
> &
  DirectToolDefinitionsContext;

type DirectToolDefinitionsContext = OrchestratorToolsContext;

const CATALOG_RUN = { sessionId: '', bot: { slug: '' } } as unknown as OrchestratorAgentRun;

export function orchestratorTools(
  adapter: OrchestratorToolsContext,
  run: OrchestratorAgentRun,
  agentCtx: Pick<Context, 'get'>,
  registerTool: (tool: ToolDefinition) => unknown,
  registerBridgeTool: (tool: ToolDefinition) => unknown,
  guardFeatureTool: FeatureToolRegistrar['guard'] = () => {},
): void {
  const currentOrchestrator = () => {
    const active = adapter.runs.get(run.sessionId);
    return active?.role === 'orchestrator' ? active : undefined;
  };
  const currentRun = () => currentOrchestrator()?.run;
  const resolveModelPlan = () => adapter.resolveModelPlan?.(run.bot.slug) ?? run.bot.modelPlan;
  const loadAssignmentModes = () => adapter.assignmentModes?.(run.bot.slug);
  const featureContext = {
    ...agentFeatureContext(adapter, run, agentCtx),
    assignmentModelTool: {
      run,
      isRunActive: () => currentRun() !== undefined,
      resolveModelPlan,
      loadAssignmentModes,
      groups: adapter.assignmentGroups,
      modelFilter: () => adapter.modelFilter?.(run.bot.slug),
      openAssignmentRoutes: adapter.openAssignmentRoutes,
    },
    workspaceSessionsAvailable: run === CATALOG_RUN || Boolean(run.workspaceSessions),
  };
  const placedFeatureTools = new Map<FeatureToolPlacement, ToolDefinition[]>();
  const registerPlacedFeatureTools = (placement: FeatureToolPlacement) => {
    const register = placement === 'bridge' ? registerBridgeTool : registerTool;
    for (const tool of placedFeatureTools.get(placement) ?? []) register(tool);
  };
  for (const feature of adapter.featureContributions) {
    feature.tools?.(featureContext, {
      register(tool, placement) {
        if (placement === undefined) registerTool(tool);
        else {
          const tools = placedFeatureTools.get(placement) ?? [];
          tools.push(tool);
          placedFeatureTools.set(placement, tools);
        }
      },
      guard: guardFeatureTool,
    });
  }
  registerTool(
    createChannelActionTool(
      () => {
        const active = adapter.runs.get(run.sessionId);
        if (active?.role !== 'orchestrator') throw new Error('Orchestrator run is unavailable');
        return active.run;
      },
      (channelId) => adapter.drafts.discard(run.sessionId, channelId),
    ),
  );
  registerTool(
    createBotMessageTool(
      () => {
        const active = adapter.runs.get(run.sessionId);
        if (active?.role !== 'orchestrator') throw new Error('Orchestrator run is unavailable');
        return active.run;
      },
      {
        settle: (channelId, body) => adapter.drafts.settle(run.sessionId, channelId, body),
        discard: (channelId) => adapter.drafts.discard(run.sessionId, channelId),
      },
      (messageId) => {
        const active = adapter.runs.get(run.sessionId);
        if (active?.role === 'orchestrator') (active.dmMessageIds ??= []).push(messageId);
      },
    ),
  );
  const assignmentOptions: AssignmentToolOptions = {
    currentRun: currentOrchestrator,
    run,
    resolveModelPlan,
    openAssignmentRoutes: adapter.openAssignmentRoutes,
  };
  registerPlacedFeatureTools('before-assignment-tools');
  registerTool(
    createAssignmentTool({
      ...assignmentOptions,
      assignmentGroups: adapter.assignmentGroups,
      modeChoices: adapter.orchestratorModeChoices.get(run.sessionId),
      loadAssignmentModes,
    }),
  );
  registerPlacedFeatureTools('workspace-tools');
  registerAssignmentTools(assignmentOptions, registerTool);
  registerPlacedFeatureTools('after-assignment-tools');
  if (run === CATALOG_RUN || run.speakerPolicy)
    registerTool(
      defineTool({
        name: 'speaker_policy',
        description:
          'Read the current Host Human roles and resolved advisory topic policy. Latest revision wins and Deny wins conflicts. Omit humanId for the current speaker. This grants no resource access.',
        parameters: { humanId: { type: 'string' }, topic: { type: 'string' } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: async (args) => {
          const active = adapter.runs.get(run.sessionId);
          if (active?.role !== 'orchestrator' || !active.run.speakerPolicy)
            throw new Error('speaker-policy-unavailable');
          return JSON.stringify(active.run.speakerPolicy(args.humanId, args.topic));
        },
      }),
    );
  registerPlacedFeatureTools('bridge');

  registerPlacedFeatureTools('before-inbox-tools');
  registerInboxTools(currentRun, registerTool, () => adapter.engineChannels.get(run.sessionId));
  registerPlacedFeatureTools('after-inbox-tools');
  registerTool(
    defineTool({
      name: 'call_frame',
      description:
        "Zoom into one cell of a call grid: returns that keyframe at its original resolution when the grid's small tiles are hard to read. Pass message_id of the Human call message or frame record that carries the grid and cell, the tile number printed on it, counted from 1 row by row from the top left (a single-frame view is cell 1). Originals live only in Host memory for the most recent 64 keyframes of a running call; after the call ends or newer keyframes replace them the result says released, so answer from the grid itself.",
      parameters: {
        channel_id: {
          type: 'string',
          description: 'Channel id; defaults to the inbound Channel.',
        },
        message_id: {
          type: 'string',
          required: true,
          description: 'The Human call message that carries the grid image.',
        },
        cell: {
          type: 'integer',
          required: true,
          description: 'Tile number printed on the grid, from 1.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            channelId: { type: 'string', required: true },
            messageId: { type: 'string', required: true },
            cell: { type: 'integer', required: true },
            released: { type: 'boolean', required: true },
            cells: { type: 'integer' },
            source: { type: 'string', enum: ['camera', 'screen'] },
            image: {
              type: 'object',
              additionalProperties: false,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: {
                  type: 'string',
                  enum: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'],
                  required: true,
                },
                bytes: { type: 'integer', required: true },
                width: { type: 'integer', required: true },
                height: { type: 'integer', required: true },
                name: { type: 'string' },
                originalDimensions: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    width: { type: 'integer', required: true },
                    height: { type: 'integer', required: true },
                  },
                },
              },
            },
          },
        },
        render: (_args, value) => {
          const image = value.image;
          if (value.released || image === undefined)
            return [
              {
                type: 'text',
                text: `The original keyframes of the grid on message ${value.messageId} are released: the call ended or newer keyframes replaced them. Answer from the grid image itself.`,
              },
            ];
          return [
            {
              type: 'text',
              text: `Cell ${value.cell} of ${value.cells ?? value.cell} from the ${value.source ?? 'call'} grid on message ${value.messageId}, at its original resolution`,
            },
            {
              type: 'image',
              attachment: {
                attachmentId: AttachmentId(image.attachmentId),
                mediaType: image.mediaType,
                bytes: image.bytes,
                width: image.width,
                height: image.height,
                ...(image.name === undefined ? {} : { name: image.name }),
                ...(image.originalDimensions === undefined
                  ? {}
                  : { originalDimensions: { ...image.originalDimensions } }),
              },
            },
          ];
        },
      },
      execute: async (args) => {
        const active = adapter.runs.get(run.sessionId);
        if (active?.role !== 'orchestrator') {
          throw new Error('call_frame: Orchestrator run is unavailable');
        }
        const zoom = active.run.channels.callFrame;
        if (zoom === undefined) throw new Error('call_frame: calls are unavailable on this Host');
        const channelId = args.channel_id ?? active.run.inboundChannelId;
        if (channelId === undefined) throw new Error('call_frame: explicit Channel required');
        const result = zoom({
          ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
          messageId: args.message_id,
          cell: args.cell,
        });
        if (result.released)
          return { channelId, messageId: args.message_id, cell: args.cell, released: true };
        const hostAttachments = agentCtx.get('attachments');
        if (hostAttachments === undefined) {
          throw new Error('call_frame: DSH attachment service is unavailable');
        }
        const image = await hostAttachments.saveImage({
          data: result.jpeg,
          mediaType: 'image/jpeg',
          name: `call-${result.source}-cell-${result.cell}.jpg`,
        });
        return {
          channelId,
          messageId: args.message_id,
          cell: result.cell,
          released: false,
          cells: result.cells,
          source: result.source,
          image,
        };
      },
    }),
  );
  registerPlacedFeatureTools('before-source-attention-tools');
  registerSourceAttentionTools(currentRun, registerTool);
  registerPlacedFeatureTools('after-channel-tools');
  registerPlacedFeatureTools('after-schedule-tools');
}

export function directTools(adapter: DirectToolsContext): DirectBotToolSpec[] {
  const privateTools = new Map<string, ToolDefinition>();
  for (const handle of adapter.handles.values()) {
    for (const name of PRIVATE_INPUT_TOOLS) {
      const tool = handle.agent.ctx.tools.get(name, handle.agent);
      if (tool !== undefined) privateTools.set(name, tool);
    }
  }
  return [
    ...directToolDefinitions(adapter, CATALOG_RUN),
    ...(adapter.subagentTools?.(CATALOG_RUN.bot.slug) ?? []),
    ...privateTools.values(),
  ].map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
  }));
}

export async function runDirectTool(
  adapter: RunDirectToolContext,
  releaseSession: DshBotAgentAdapterState['releaseSession'],
  run: OrchestratorAgentRun,
  name: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
  parentSessionId?: string,
): Promise<unknown> {
  adapter.assertOpen();
  if (adapter.stoppedBots.has(run.bot.slug)) throw new Error('PersonaBot is deleted');
  const tool =
    PRIVATE_INPUT_TOOLS.has(name) ||
    (adapter.subagentTools !== undefined && isBotSubagentModelTool(name))
      ? name
      : directToolDefinitions(adapter, run).find((entry) => entry.name === name);
  if (tool === undefined)
    throw new DirectBotToolError('tool-not-direct', `${name} cannot run outside a Bot turn`);
  if (adapter.runs.has(run.sessionId)) throw new Error('Direct run session is already active');
  adapter.runs.set(run.sessionId, { role: 'orchestrator', run, direct: true });
  try {
    let value: unknown;
    if (typeof tool === 'string') {
      const parent =
        parentSessionId === undefined
          ? undefined
          : (adapter.handles.get(parentSessionId)?.agent ??
            adapter.agents.get?.(SessionId(parentSessionId)));
      if (parent === undefined)
        throw new DirectBotToolError(
          'parent-unavailable',
          isBotSubagentModelTool(name)
            ? 'No live Assignment Agent is available for this Session; continue the Assignment before calling its Subagent tools'
            : 'No live Orchestrator Agent is available; send this Bot a DM before calling its private tools',
        );
      if (PRIVATE_INPUT_TOOLS.has(name) && parent.ctx.tools.get(name, parent) === undefined)
        throw new DirectBotToolError(
          'tool-not-direct',
          'This private tool is unavailable to the Bot',
        );
      const result = await executeNativeTool(parent.ctx, {
        callId: ToolCallId(run.sessionId),
        name,
        arguments: args,
        agent: parent,
        signal,
      });
      if (result.isError)
        throw new DirectBotToolError(
          result.error.info?.code === 'INVALID_ARGS'
            ? 'invalid-args'
            : (result.error.info?.code ?? 'tool-failed'),
          result.error.message,
        );
      value = result.value;
    } else if (
      hasIrreversibleExternalEffect(toolEffects(name, args)) ||
      toolEffects(name, args)?.authority === 'management'
    ) {
      const handle = await adapter.prepare(
        run.sessionId,
        (preparationSignal) => adapter.orchestratorHandle(run, preparationSignal),
        signal,
      );
      signal.throwIfAborted();
      const result = await executeNativeTool(handle.agent.ctx, {
        callId: ToolCallId(run.sessionId),
        name,
        arguments: args,
        agent: handle.agent,
        signal,
      });
      if (result.isError)
        throw new DirectBotToolError(
          result.error.info?.code ?? 'tool-failed',
          result.error.message,
        );
      value = result.value;
    } else {
      value = await tool.execute(args, {
        callId: run.sessionId,
        rootCallId: run.sessionId,
        name,
        arguments: args,
        signal,
        deferContext: () => undefined,
        concludeTurn: () => undefined,
      } as unknown as ToolRunContext);
    }
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  } catch (error) {
    if (error instanceof ToolArgsError)
      throw new DirectBotToolError('invalid-args', `${name}: ${error.message}`);
    throw error;
  } finally {
    adapter.runs.delete(run.sessionId);
    const cleanupStarted = Date.now();
    try {
      await releaseSession(run.sessionId);
    } catch {
      try {
        adapter.observeDirectToolCleanupFailure?.({
          sessionId: run.sessionId,
          durationMs: Date.now() - cleanupStarted,
        });
      } catch {}
    }
  }
}

export function directToolDefinitions(
  adapter: DirectToolDefinitionsContext,
  run: OrchestratorAgentRun,
): ToolDefinition[] {
  const tools: ToolDefinition[] = [];
  const collect = (tool: ToolDefinition) => {
    if (!TURN_ONLY_BOT_TOOLS.has(tool.name)) tools.push(tool);
  };
  orchestratorTools(
    adapter,
    run,
    { get: () => undefined } as Pick<Context, 'get'>,
    collect,
    collect,
  );
  return tools;
}
