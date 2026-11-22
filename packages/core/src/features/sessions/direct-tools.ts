import { randomUUID } from 'node:crypto';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import { PRIVATE_INPUT_TOOLS } from '../../credentials/tool-contract.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { HumanContext } from '../../humans/context.js';
import { requireSourceEffects } from '../../purge/fence.js';
import type {
  BotAgentAdapter,
  BotRuntime,
  BotRuntimeOptions,
  OrchestratorAgentRun,
  OrchestratorServiceTurn,
} from '../../runtime/bot-runtime.js';
import { isBotSubagentModelTool } from '../../runtime/subagent-model-tools.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { TeamService } from '../../team/service.js';
import { hasIrreversibleExternalEffect, toolEffects } from '../../workspaces/tool-effects.js';
import type { createAssignmentReporting } from '../assignments/reporting.js';
import type { TobCliRequestLease } from '../tob/cli-runtime.js';

export interface DirectBotToolSpec {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface DirectBotToolCall {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  at: string;
  durationMs: number;
  outcome: 'ok' | 'error';
  result: string;
}

const DIRECT_TOOL_CALL_LIMIT = 50;

export class DirectBotToolError extends HarnessError {
  constructor(code: string, message: string) {
    super(message, code);
    this.name = 'DirectBotToolError';
  }
}

const DIRECT_ASSIGNMENT_TOOLS: ReadonlySet<string> = new Set([
  'create_assignment',
  'send_assignment_request',
  'unarchive_assignment',
]);

export interface ActiveDirectTool {
  botSlug: string;
  agentSessionId: string;
  approvalHuman?: HumanContext;
}

interface DirectToolPorts {
  activeDirectTools: Map<string, ActiveDirectTool>;
  agents: BotAgentAdapter;
  channels: ChannelStore;
  closed: () => boolean;
  currentOrchestratorSessionId: NonNullable<BotRuntime['currentOrchestratorSessionId']>;
  database: OperationalDatabaseModulePort;
  directBotTools: NonNullable<BotRuntime['directBotTools']>;
  directToolCalls: Map<string, DirectBotToolCall[]>;
  noticeDirectAssignmentCall: ReturnType<
    typeof createAssignmentReporting
  >['noticeDirectAssignmentCall'];
  now: () => Date;
  orchestratorServices: (
    bot: PersonaBotRecord,
    turn: OrchestratorServiceTurn,
  ) => Omit<
    OrchestratorAgentRun,
    'sessionId' | 'resume' | 'bot' | 'message' | 'inbox' | 'inboundChannelId'
  >;
  ownership: SessionOwnership;
  recordDirectToolSource: (botSlug: string, tool: string) => string;
  registry: PersonaBotRegistry;
  requireExecution: BotRuntimeOptions['requireExecution'];
  requireMembership: (botSlug: string, channelId: string) => ChannelRecord;
  team: TeamService | undefined;
  tobCliRequests: ReadonlyMap<string, TobCliRequestLease>;
  warn: BotRuntimeOptions['warn'];
}

export function createDirectTools(ports: DirectToolPorts) {
  function directBotTools(): DirectBotToolSpec[] {
    return ports.agents.directTools?.() ?? [];
  }

  function directBotToolCalls(botSlug: string): readonly DirectBotToolCall[] {
    return ports.directToolCalls.get(botSlug) ?? [];
  }

  async function runDirectBotTool(
    botSlug: string,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    parentSessionId?: string,
    sourceEventId?: string,
    human?: HumanContext,
  ): Promise<{ tool: string; sessionId: 'direct'; result: unknown }> {
    if (ports.closed()) throw new DirectBotToolError('runtime-closed', 'BotRuntime is closed');
    ports.team?.bots.requireActive(botSlug);
    const bot = ports.registry.get(botSlug);
    if (bot === undefined) throw new DirectBotToolError('unknown-bot', `Unknown bot: ${botSlug}`);
    if (
      [...ports.tobCliRequests.values()].some(
        (request) => request.botSlug === botSlug && request.status.state === 'running',
      )
    )
      throw new DirectBotToolError(
        'bot-busy',
        'Wait for the active Tob CLI request or cancel it first',
      );
    if (bot.paused === true)
      throw new DirectBotToolError('bot-paused', `PersonaBot ${botSlug} is paused`);
    const runDirect = ports.agents.runDirectTool?.bind(ports.agents);
    if (runDirect === undefined)
      throw new DirectBotToolError('unavailable', 'Direct Bot tools are unavailable on this Host');
    if (!ports.directBotTools().some((spec) => spec.name === tool))
      throw new DirectBotToolError(
        'tool-not-direct',
        `${tool} is not a Bot tool the direct runner can call; list them with bot-tools`,
      );
    const delegation = isBotSubagentModelTool(tool);
    if (!delegation && parentSessionId !== undefined)
      throw new DirectBotToolError(
        'invalid-args',
        `${tool} runs as the Bot's Orchestrator; --session applies only to Subagent tools`,
      );
    if (delegation) {
      const owner =
        parentSessionId === undefined ? undefined : ports.ownership.resolve(parentSessionId);
      if (owner?.botSlug !== bot.slug || owner.rootRole !== 'assignment')
        throw new DirectBotToolError(
          'parent-unavailable',
          `${tool} runs inside an Assignment; pass --session with one of ${bot.slug}'s Assignment Sessions`,
        );
    }
    ports.requireExecution?.(bot.slug);
    const sessionId = `direct-${randomUUID()}`;
    const directChannel =
      typeof args.channel_id === 'string'
        ? (() => {
            const channel = ports.channels.get(args.channel_id);
            if (ports.team && channel) {
              ports.team.bots.requireChannel(botSlug, channel);
              return channel;
            }
            return ports.requireMembership(botSlug, args.channel_id);
          })()
        : undefined;
    if (sourceEventId !== undefined) {
      ports.database.read((db) => {
        const source = db
          .prepare(
            `SELECT e.channel_id FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
          WHERE e.source_event_id = ? AND a.bot_slug = ?`,
          )
          .get(sourceEventId, botSlug);
        if (source === undefined)
          throw new DirectBotToolError(
            'source-unavailable',
            'Source Event is not admitted to this Bot',
          );
        requireSourceEffects(db, sourceEventId, botSlug);
        if (typeof source.channel_id === 'string')
          ports.requireMembership(botSlug, source.channel_id);
      });
    }
    const directOrigin =
      sourceEventId === undefined && DIRECT_ASSIGNMENT_TOOLS.has(tool)
        ? ports.recordDirectToolSource(bot.slug, tool)
        : sourceEventId;
    const directSource =
      directOrigin !== undefined
        ? { source_event_id: directOrigin }
        : directChannel === undefined
          ? undefined
          : ports.database.read((db) =>
              db
                .prepare(
                  'SELECT source_event_id FROM channel_placements WHERE channel_id = ? ORDER BY revision DESC LIMIT 1',
                )
                .get(directChannel.id),
            );
    const run: OrchestratorAgentRun = {
      sessionId,
      resume: false,
      bot,
      message: '',
      inbox: '',
      inboundChannelId: undefined,
      ...ports.orchestratorServices(bot, {
        sessionId,
        channelId: undefined,
        sourceEventId: directSource
          ? String(directSource.source_event_id)
          : `direct-${randomUUID()}`,
        markSideEffect: () => undefined,
        readAdmissions: new Set(),
        importedFiles: new Map(),
        turnSources: new Set(),
        observeMemory: false,
        observeReads: false,
      }),
    };
    let approvalHuman: HumanContext | undefined;
    if (
      PRIVATE_INPUT_TOOLS.has(tool) ||
      hasIrreversibleExternalEffect(toolEffects(tool, args)) ||
      toolEffects(tool, args)?.authority === 'management'
    ) {
      approvalHuman = human;
      if (!PRIVATE_INPUT_TOOLS.has(tool))
        ports.ownership.claim({
          sessionId,
          botSlug,
          rootRole: 'orchestrator',
          provenance: 'created',
          at: ports.now().toISOString(),
        });
    }
    const started = ports.now();
    const record = (outcome: 'ok' | 'error', result: string) => {
      const calls = ports.directToolCalls.get(bot.slug) ?? [];
      calls.push({
        callId: sessionId,
        tool,
        args: PRIVATE_INPUT_TOOLS.has(tool) ? {} : args,
        at: started.toISOString(),
        durationMs: ports.now().getTime() - started.getTime(),
        outcome,
        result: PRIVATE_INPUT_TOOLS.has(tool) ? '[private tool result omitted]' : result,
      });
      ports.directToolCalls.set(bot.slug, calls.slice(-DIRECT_TOOL_CALL_LIMIT));
    };
    const executionParentSessionId = delegation
      ? parentSessionId
      : ports.currentOrchestratorSessionId(botSlug);
    ports.activeDirectTools.set(sessionId, {
      botSlug: bot.slug,
      agentSessionId: PRIVATE_INPUT_TOOLS.has(tool)
        ? (executionParentSessionId ?? sessionId)
        : sessionId,
      ...(approvalHuman === undefined ? {} : { approvalHuman }),
    });
    try {
      const result = await runDirect(run, tool, args, signal, executionParentSessionId);
      record('ok', typeof result === 'string' ? result : JSON.stringify(result));
      if (DIRECT_ASSIGNMENT_TOOLS.has(tool)) {
        try {
          ports.noticeDirectAssignmentCall(bot.slug, tool, args, result);
        } catch (error) {
          ports.warn?.(
            `Direct ${tool} succeeded but its Orchestrator notice was not recorded: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return { tool, sessionId: 'direct', result };
    } catch (error) {
      record('error', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      ports.activeDirectTools.delete(sessionId);
    }
  }

  return { directBotTools, directBotToolCalls, runDirectBotTool };
}
