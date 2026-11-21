import type { SessionLinkKind } from './bot-message-tool.js';
import { externalImPrompt } from '../features/messaging/prompt.js';
import { EXTERNAL_ATTACHMENT_PROMPT } from '../features/channel-files/prompt.js';
import type { Agent, AgentHandle, ModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { type SessionLogOffset } from '@deepseek-ai/dsh-session';
import type { ModelRoute, PersonaBotModelPlan } from '../models/presets.js';
import {
  type AssignmentAgentRun,
  type InterruptedToolCall,
  type OrchestratorAgentRun,
} from './bot-runtime.js';
import { type PromptText } from '../prompts/prompt-parts.js';

export interface ModelFreeTobTurn {
  agent: Agent;
  turn: NonNullable<OrchestratorAgentRun['tobCliTurn']>;
  inputId: ReturnType<typeof createUserMessage>['id'];
  outcome: { kind: 'completed' } | { kind: 'failed'; error: unknown } | undefined;
}

export const ROLE_PROMPT_ORDER = 10_350;

export const EXTERNAL_IM_PROMPT = externalImPrompt(EXTERNAL_ATTACHMENT_PROMPT);

export function appendSkillInstallation(prompt: string, text: PromptText): string {
  const guidance = text('skill-installation');
  return guidance === '' ? prompt : `${prompt}\n\n${guidance}`;
}

export type ActiveRun =
  | {
      role: 'orchestrator';
      run: OrchestratorAgentRun;
      direct?: true;
      sessionLinks?: Map<string, SessionLinkKind>;
      dmMessageIds?: string[];
      linkedSessionIds?: Set<string>;
    }
  | { role: 'assignment'; run: AssignmentAgentRun; reported: boolean };

export function linkForgottenSessions(active: Extract<ActiveRun, { role: 'orchestrator' }>): void {
  const [messageId, ...others] = active.dmMessageIds ?? [];
  const linkSessions = active.run.channels.linkSessions;
  if (messageId === undefined || others.length > 0 || linkSessions === undefined) return;
  const links = [...(active.sessionLinks ?? [])].flatMap(([sessionId, kind]) => {
    if (active.linkedSessionIds?.has(sessionId)) return [];
    const assignment = active.run.assignments.inspect(sessionId);
    return assignment === undefined
      ? []
      : [{ sessionId, kind, title: assignment.title, createdAt: assignment.createdAt }];
  });
  if (links.length === 0) return;
  try {
    linkSessions({ messageId, links });
  } catch {
    return;
  }
}

export function agentOptions(
  run: Pick<OrchestratorAgentRun, 'bot' | 'inboundChannelId'> | AssignmentAgentRun,
  defaultSelection: ModelSelection,
  plan: PersonaBotModelPlan | undefined,
  fallback?: ModelRoute,
): ModelSelection {
  const route = 'inboundChannelId' in run ? (fallback ?? plan?.orchestrator) : run.modelRoute;
  if (route !== undefined) {
    return {
      provider: route.provider,
      model: route.model,
      ...(route.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
    };
  }
  if (run.bot.model !== undefined) {
    throw new Error('Legacy Bot model requires provider selection in PersonaBot Profile');
  }
  return defaultSelection;
}

export function createMeta(
  run: OrchestratorAgentRun | AssignmentAgentRun,
  cwd: string,
  ensureWorkspace: ((path: string) => void) | undefined,
  botMode: string | undefined,
) {
  ensureWorkspace?.(cwd);
  const agentPreset = ('agentPreset' in run ? run.agentPreset : undefined) ?? botMode;
  return {
    cwd,
    ...(agentPreset === undefined ? {} : { agentPreset }),
  };
}

export function requireCompletedTurn(
  handle: AgentHandle,
  fromSeq: SessionLogOffset,
  cancelledTurn?: AssignmentAgentRun['cancelledTurn'],
  failedTurn?: AssignmentAgentRun['failedTurn'],
  observeFailure?: (code: string) => void,
  refusal?: string | Error,
): { turn: number; endSeq: number } {
  const turnEnd = handle.agent.session
    .snapshotEvents(fromSeq)
    .find((event) => event.type === 'turn/end');
  if (turnEnd === undefined) {
    throw new Error('Agent became idle without a durable turn/end');
  }
  const reason = turnEnd.data.reason;
  if (reason.kind === 'completed') return { turn: turnEnd.data.turn, endSeq: turnEnd.seq };
  if (reason.kind === 'aborted' && reason.reason.kind === 'user')
    cancelledTurn?.({ turn: turnEnd.data.turn, endSeq: turnEnd.seq });
  if (reason.kind === 'error') {
    failedTurn?.({ turn: turnEnd.data.turn, endSeq: turnEnd.seq });
    observeFailure?.(reason.error.code);
    const routeNeedsRepair =
      [
        'MISSING_CREDENTIAL',
        'INVALID_CREDENTIAL',
        'NO_ADAPTER',
        'MODEL_NOT_FOUND',
        'UNSUPPORTED_REASONING_EFFORT',
      ].includes(reason.error.code) ||
      ('status' in reason.error && (reason.error.status === 401 || reason.error.status === 403));
    const failure = new Error(
      `${reason.error.code}: ${reason.error.message}${routeNeedsRepair ? '. Open PersonaBot Profile and select an available Model Preset or repair the DSH provider credential before retrying.' : ''}`,
    );
    if ('status' in reason.error && typeof reason.error.status === 'number') {
      Object.assign(failure, { status: reason.error.status });
    }
    throw failure;
  }
  if (reason.kind === 'max-tokens')
    throw new Error(
      'OUTPUT_TOKEN_LIMIT: The model reached its output limit before completing this reply',
    );
  if (reason.kind === 'blocked' && refusal !== undefined)
    throw refusal instanceof Error ? refusal : new Error(refusal);
  throw new Error(`Agent turn ended without completion: ${reason.kind}`);
}

export class PreparationStopped extends Error {
  constructor() {
    super('Turn preparation was stopped');
  }
}

export function interruptedToolCalls(
  handle: AgentHandle,
  fromSeq: SessionLogOffset,
  stopSeq: number | undefined,
): InterruptedToolCall[] {
  if (stopSeq === undefined) return [];
  const started = new Map<string, InterruptedToolCall>();
  const asked = new Map<string, string>();
  const awaitingApproval = new Set<string>();
  for (const event of handle.agent.session.snapshotEvents(fromSeq)) {
    if (Number(event.seq) >= stopSeq) break;
    if (event.type === 'approval/asked') {
      const data = event.data as { id: string; callId?: string };
      if (data.callId !== undefined) {
        asked.set(String(data.id), String(data.callId));
        awaitingApproval.add(String(data.callId));
      }
      continue;
    }
    if (event.type === 'approval/decided') {
      const data = event.data as { id: string };
      const callId = asked.get(String(data.id));
      if (callId !== undefined) awaitingApproval.delete(callId);
      continue;
    }
    if (event.type === 'tool/call') {
      const data = event.data as { callId: string; name: string; arguments: string };
      started.set(String(data.callId), {
        callId: String(data.callId),
        name: data.name,
        arguments: data.arguments,
      });
    } else if (event.type === 'tool/result') {
      const data = event.data as { message?: { source?: { callId?: string } } };
      const callId = data.message?.source?.callId;
      if (callId !== undefined) started.delete(String(callId));
    }
  }
  return [...started.values()].filter((call) => !awaitingApproval.has(call.callId));
}

export function turnAborted(handle: AgentHandle, fromSeq: SessionLogOffset): boolean {
  const turnEnd = handle.agent.session
    .snapshotEvents(fromSeq)
    .find((event) => event.type === 'turn/end');
  return turnEnd === undefined || turnEnd.data.reason.kind === 'aborted';
}

export async function untilAborted<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> {
  if (signal === undefined) return work;
  return new Promise<T>((resolve, reject) => {
    const stop = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error('Preparation stopped', { cause: signal.reason }),
      );
    signal.addEventListener('abort', stop, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

export const TURN_ONLY_BOT_TOOLS: ReadonlySet<string> = new Set([
  'wait_for_assignment',
  'channel_read_image',
  'call_frame',
  'channel_attachment_open',
  'memory_switch_branch',
  'memory_continue_from_commit',
]);
