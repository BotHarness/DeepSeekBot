import type { createOrchestratorScheduling } from '../../runtime/orchestrator-scheduling.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { type SessionOwnership } from '../../sessions/ownership.js';
import type { createAssignmentExecution } from '../assignments/runtime-execution.js';
import type { createOrchestratorTurns } from './runtime-orchestrator-turns.js';
import type { BotRuntime, BotRuntimeOptions } from '../../runtime/bot-runtime-types.js';

type NativeOrchestratorRefusal =
  | 'runtime-closed'
  | 'aborted'
  | 'bot-missing'
  | 'bot-paused'
  | 'no-current-orchestrator'
  | 'not-current-orchestrator'
  | 'no-native-sender'
  | 'foreign-sender'
  | 'run-not-ready';

interface NativeOrchestratorStepPorts {
  prepareNativeAssignmentStep: ReturnType<
    typeof createAssignmentExecution
  >['prepareNativeAssignmentStep'];
  enqueue: ReturnType<typeof createOrchestratorScheduling>['enqueue'];
  runOrchestratorTurn: ReturnType<typeof createOrchestratorTurns>['runOrchestratorTurn'];
  currentOrchestratorSessionId: NonNullable<BotRuntime['currentOrchestratorSessionId']>;
  ownership: SessionOwnership;
  closed: () => boolean;
  registry: PersonaBotRegistry;
  warn: BotRuntimeOptions['warn'];
  preparedOrchestrators: ReadonlySet<string>;
  waitLifetime: AbortController;
  nativeStepReady: Map<string, (accepted: boolean) => void>;
}

export function createNativeOrchestratorStep(ports: NativeOrchestratorStepPorts) {
  const {
    prepareNativeAssignmentStep,
    enqueue,
    runOrchestratorTurn,
    currentOrchestratorSessionId,
    ownership,
    closed,
    registry,
    warn,
    preparedOrchestrators,
    waitLifetime,
    nativeStepReady,
  } = ports;

  async function prepareNativeOrchestratorStep(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const owner = ownership.resolve(sessionId);
    if (owner?.rootRole === 'assignment' && owner.parentSessionId === undefined)
      return prepareNativeAssignmentStep(sessionId, senderSessionIds, signal);
    if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined) return true;
    const unavailable = (): NativeOrchestratorRefusal | undefined => {
      if (closed()) return 'runtime-closed';
      if (signal.aborted) return 'aborted';
      const bot = registry.get(owner.botSlug);
      if (bot === undefined) return 'bot-missing';
      if (bot.paused) return 'bot-paused';
      const current = currentOrchestratorSessionId(owner.botSlug);
      if (current !== sessionId)
        return current === undefined ? 'no-current-orchestrator' : 'not-current-orchestrator';
      return undefined;
    };
    const available = () => unavailable() === undefined;
    const fatal = (reason: NativeOrchestratorRefusal | undefined) =>
      reason === 'runtime-closed' || reason === 'aborted';
    const admissible = () => !fatal(unavailable());
    const refuse = (reason: NativeOrchestratorRefusal): false => {
      warn?.(
        JSON.stringify({
          event: 'native-orchestrator-input',
          phase: 'refused',
          reason,
          bot: owner.botSlug,
          session: sessionId,
          executionReady: preparedOrchestrators.has(sessionId),
          senders: senderSessionIds.length,
        }),
      );
      return false;
    };
    const admitUnavailable = (reason: NativeOrchestratorRefusal): void =>
      warn?.(
        JSON.stringify({
          event: 'native-orchestrator-input',
          phase: 'admitted-unavailable',
          reason,
          bot: owner.botSlug,
          session: sessionId,
          senders: senderSessionIds.length,
        }),
      );
    const refusal = unavailable();
    if (preparedOrchestrators.has(sessionId)) {
      if (refusal === 'runtime-closed' || refusal === 'aborted') return refuse(refusal);
      if (refusal !== undefined) admitUnavailable(refusal);
      return true;
    }
    if (refusal !== undefined) return refuse(refusal);
    if (!senderSessionIds.length) return refuse('no-native-sender');
    if (
      !senderSessionIds.every((id) => {
        const sender = ownership.resolve(id);
        return (
          sender?.botSlug === owner.botSlug &&
          sender.parentSessionId === sessionId &&
          ownership.contentAvailable(id)
        );
      })
    )
      return refuse('foreign-sender');
    const cancellation = AbortSignal.any([signal, waitLifetime.signal]);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (accepted: boolean) => {
        if (settled) return;
        settled = true;
        cancellation.removeEventListener('abort', abort);
        if (nativeStepReady.get(sessionId) === finish) nativeStepReady.delete(sessionId);
        const refusal = unavailable();
        const stop = fatal(refusal);
        if (accepted && refusal !== undefined && !stop) admitUnavailable(refusal);
        const reason = accepted && !stop ? undefined : (refusal ?? 'run-not-ready');
        if (reason !== undefined) refuse(reason);
        resolve(reason === undefined);
      };
      const abort = () => finish(false);
      nativeStepReady.set(sessionId, finish);
      cancellation.addEventListener('abort', abort, { once: true });
      if (cancellation.aborted) return abort();
      void enqueue(owner.botSlug, async () => {
        if (settled || !available()) return;
        const bot = registry.get(owner.botSlug)!;
        await runOrchestratorTurn(
          bot,
          { sessionId, resume: true },
          undefined,
          undefined,
          '',
          [],
          false,
          () => {
            if (!admissible()) throw new Error('Native Orchestrator is unavailable');
          },
          [],
          [],
          admissible,
        );
      }).then(
        () => finish(false),
        () => {
          finish(false);
          warn?.('native-subagent-input-run-failed');
        },
      );
    });
  }

  return { prepareNativeOrchestratorStep };
}
