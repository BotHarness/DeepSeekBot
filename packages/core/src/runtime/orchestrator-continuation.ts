import type { TobCliTurn } from '../tob/cli-request.js';
import type { TeamService } from '../team/service.js';
import { botOwner } from '../team/bot-access.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { SessionRecoveryError, type SessionRecoveryAction } from './session-recovery.js';
import { TobError } from '../tob/service.js';
import { randomUUID } from 'node:crypto';
import type { OrchestratorInboxTriage } from './inbox-triage.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { RestingRoute } from '../models/route-rest.js';
import {
  type ModelSwitch,
  type MixedGroupPick,
  type SubscriptionRest,
  routingTargetRestKey,
  unavailableRoutingEngine,
} from '../models/group-fallback.js';
import type { RoutingTarget } from '../models/routing-groups.js';
import { EngineLimitError, EngineRefusal } from '../engines/engine-session.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { dmChannelId } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { SESSION_DIRECT_MESSAGE_PREFIX } from './session-direct-message.js';
import type {
  BotRuntimeOptions,
  BotAgentAdapter,
  OrchestratorAgentRun,
  OrchestratorServiceTurn,
  DmMessageAdmission,
  HandleDmMessageInput,
  OrchestratorReplacement,
  SourceEventClaim,
} from './bot-runtime.js';
export interface PendingAutoContinue {
  timer: NodeJS.Timeout;
  channelId: string;
  messageId: string;
  sessionId: string;
  attempt: number;
}

export type DmContinuation =
  | { kind: 'failure'; code?: string; autoAttempts: number }
  | { kind: 'host-restart'; autoAttempts: number };

const CONTINUE_FROM_SESSION =
  "The tool calls and results it completed are in this Session's history. Continue from where you stopped instead of starting over. A tool call with no recorded result has an unknown outcome: check its effect before repeating it.";

export function continuationNote(continuation: DmContinuation): string {
  const cause =
    continuation.kind === 'host-restart'
      ? 'the Host restarted'
      : `it failed${continuation.code === undefined ? '' : ` with ${continuation.code}`}`;
  return `[Host: your earlier turn for the message below stopped before it finished because ${cause}. ${CONTINUE_FROM_SESSION}]\n\n`;
}

export const MAX_MIXED_GROUP_ATTEMPTS = 32;

export class RouteRestingError extends Error {
  readonly code = 'ROUTE_RESTING';
  constructor(
    readonly rests: readonly RestingRoute[],
    readonly subscription?: SubscriptionRest,
  ) {
    super(
      subscription === undefined
        ? `ROUTE_RESTING: ${rests.map((rest) => `${rest.provider}/${rest.model} rests until ${rest.until}`).join('; ')}; no request was sent.`
        : 'ROUTE_RESTING: All Routing Group targets are resting.',
    );
  }
}

export class RoutingGroupUnavailableError extends Error {
  readonly code = 'ROUTING_GROUP_UNAVAILABLE';
  constructor(
    cause?: unknown,
    message = 'The Routing Group has no usable target. Check its model permissions and credentials.',
  ) {
    super(message, { cause });
  }
}

export function routingTargetKey(target: RoutingTarget): ModelSwitch['to'] {
  return target.kind === 'route'
    ? target.route
    : { provider: target.engine, model: target.model ?? target.engine };
}

interface OrchestratorContinuationPorts {
  admitDmMessage: (human: HumanContext, input: HandleDmMessageInput) => DmMessageAdmission;
  agents: BotAgentAdapter;
  appendModelSwitch: (
    botSlug: string,
    sessionId: string,
    channelId: string | undefined,
    choice: ModelSwitch,
  ) => Promise<void>;
  autoContinues: Map<string, PendingAutoContinue>;
  channels: ChannelStore;
  claimDmContinuation: (botSlug: string, sourceEventId: string) => boolean;
  closed: () => boolean;
  currentOrchestratorSessionId: (botSlug: string) => string | undefined;
  database: OperationalDatabaseModulePort;
  engineFallback: BotRuntimeOptions['engineFallback'];
  enqueue: (turnKey: string, task: () => Promise<void>) => Promise<void>;
  failureStreaks: Map<string, number>;
  groupFallback: BotRuntimeOptions['groupFallback'];
  memberBotEnabled: (bot: PersonaBotRecord) => boolean;
  now: () => Date;
  orchestratorServices: (
    bot: PersonaBotRecord,
    turn: OrchestratorServiceTurn,
  ) => Omit<
    OrchestratorAgentRun,
    'sessionId' | 'resume' | 'bot' | 'message' | 'inbox' | 'inboundChannelId'
  > & { triage: OrchestratorInboxTriage };
  registry: PersonaBotRegistry;
  release: (botSlug: string) => void;
  replaceOrchestrator: <T>(botSlug: string, body: () => T) => Promise<OrchestratorReplacement<T>>;
  requireExecution: BotRuntimeOptions['requireExecution'];
  routeRests: BotRuntimeOptions['routeRests'];
  runHumanDmTurn: (
    bot: PersonaBotRecord,
    channelId: string,
    body: string,
    claim: SourceEventClaim,
    messageId: string,
    continuation?: DmContinuation,
    tobCliTurn?: TobCliTurn,
  ) => Promise<void>;
  sessionRoute: BotRuntimeOptions['sessionRoute'];
  stoppedTurns: Set<string>;
  switchingRoutingGroups: Set<string>;
  tails: Map<string, Promise<unknown>>;
  team: TeamService | undefined;
  warn: ((message: string) => void) | undefined;
}

export function createOrchestratorContinuation(ports: OrchestratorContinuationPorts) {
  async function retryDmMessage(
    channelId: string,
    messageId: string,
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<void> {
    const message = retryableDmMessage(channelId, messageId);
    const admission = ports.admitDmMessage(human, {
      channelId,
      messageId,
      body: message.body,
    });
    if (!admission.admitted) throw new Error(admission.reason);
    void admission.settled.catch(() => undefined);
  }

  function retryableDmMessage(channelId: string, messageId: string) {
    const channel = ports.channels.get(channelId);
    const message = ports.channels.message(channelId, messageId);
    const direct = message === undefined && messageId.startsWith(SESSION_DIRECT_MESSAGE_PREFIX);
    if (channel?.type !== 'dm' || !channel.botSlug || (message?.author.kind !== 'human' && !direct))
      throw new Error('Retry requires the original Human DM message');
    if (message?.tobCliRequestId !== undefined) throw new TobError('cli-request-expired');
    const safe = ports.database.read((database) =>
      database
        .prepare(
          `
      SELECT e.body FROM source_events e JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
      WHERE e.channel_id = ? AND e.message_id = ? AND a.bot_slug = ?
        AND e.attempt_state = 'retryable' AND a.attempt_state = 'retryable'
        AND e.side_effect_started_at IS NULL AND a.side_effect_started_at IS NULL
    `,
        )
        .get(channelId, messageId, channel.botSlug!),
    ) as { body: string } | undefined;
    if (!safe)
      throw new Error('This message cannot be safely retried; inspect its original Session');
    return { body: message?.body ?? safe.body };
  }

  function continuableDmEvent(channelId: string, messageId: string): string | undefined {
    if (ports.channels.message(channelId, messageId)?.tobCliRequestId !== undefined)
      return undefined;
    const channel = ports.channels.get(channelId);
    const message = ports.channels.message(channelId, messageId);
    if (
      channel?.type !== 'dm' ||
      !channel.botSlug ||
      (message?.author.kind !== 'human' && !messageId.startsWith(SESSION_DIRECT_MESSAGE_PREFIX))
    )
      return undefined;
    const row = ports.database.read((database) =>
      database
        .prepare(
          `
      SELECT e.source_event_id FROM source_events e
        JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
       WHERE e.channel_id = ? AND e.message_id = ? AND a.bot_slug = ?
         AND e.source_kind = 'human-message' AND a.reason = 'human-dm'
         AND e.attempt_state IN ('retryable', 'needs-repair')
         AND a.attempt_state IN ('retryable', 'needs-repair')
    `,
        )
        .get(channelId, messageId, channel.botSlug!),
    ) as { source_event_id: string } | undefined;
    return row?.source_event_id;
  }

  function continueDmTurn(
    botSlug: string,
    channelId: string,
    messageId: string,
    continuation: DmContinuation,
  ): Promise<void> | undefined {
    const bot = ports.registry.get(botSlug);
    if (ports.closed() || bot === undefined || bot.paused === true) return undefined;
    const sourceEventId = continuableDmEvent(channelId, messageId);
    if (sourceEventId === undefined) return undefined;
    const body =
      ports.channels.message(channelId, messageId)?.body ??
      (
        ports.database.read((database) =>
          database
            .prepare('SELECT body FROM source_events WHERE source_event_id = ?')
            .get(sourceEventId),
        ) as { body: string } | undefined
      )?.body;
    if (body === undefined) return undefined;
    if (!ports.claimDmContinuation(botSlug, sourceEventId)) return undefined;
    return ports.enqueue(botSlug, () =>
      ports.runHumanDmTurn(
        bot,
        channelId,
        body,
        { sourceEventId, shouldRun: true },
        messageId,
        continuation,
      ),
    );
  }

  function rearmAutoContinues(): void {
    for (const bot of ports.registry.list()) {
      if (bot.paused === true || ports.autoContinues.has(bot.slug)) continue;
      const channelId = dmChannelId(bot.slug);
      const card = ports.channels.latestMessage(channelId);
      const failure = card?.sessionFailure;
      if (
        card?.author.kind !== 'bot' ||
        failure?.autoContinue === undefined ||
        failure.requestMessageId === undefined ||
        failure.role !== 'orchestrator' ||
        failure.code === undefined ||
        ports.currentOrchestratorSessionId(bot.slug) !== failure.sessionId ||
        continuableDmEvent(channelId, failure.requestMessageId) === undefined
      )
        continue;
      armAutoContinue(
        bot.slug,
        {
          channelId,
          messageId: failure.requestMessageId,
          sessionId: failure.sessionId,
          attempt: failure.autoContinue.attempt,
        },
        Math.max(0, Date.parse(failure.autoContinue.at) - ports.now().getTime()),
        failure.code,
      );
    }
  }

  function cancelAutoContinue(botSlug: string): PendingAutoContinue | undefined {
    const pending = ports.autoContinues.get(botSlug);
    if (pending === undefined) return undefined;
    clearTimeout(pending.timer);
    ports.autoContinues.delete(botSlug);
    return pending;
  }

  function armAutoContinue(
    botSlug: string,
    pending: Omit<PendingAutoContinue, 'timer'>,
    delayMs: number,
    code: string,
  ): void {
    cancelAutoContinue(botSlug);
    const timer = setTimeout(() => {
      if (ports.autoContinues.get(botSlug)?.timer !== timer) return;
      ports.autoContinues.delete(botSlug);
      if (ports.closed() || ports.currentOrchestratorSessionId(botSlug) !== pending.sessionId)
        return;
      const settled = continueDmTurn(botSlug, pending.channelId, pending.messageId, {
        kind: 'failure',
        code,
        autoAttempts: pending.attempt,
      });
      void settled?.catch(() => undefined);
    }, delayMs);
    timer.unref?.();
    ports.autoContinues.set(botSlug, { ...pending, timer });
  }

  async function recoverDmMessage(
    input: {
      channelId: string;
      failureMessageId: string;
      action: SessionRecoveryAction;
      compact(sessionId: string): Promise<boolean>;
    },
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<void> {
    const card = ports.channels.message(input.channelId, input.failureMessageId);
    const failure = card?.sessionFailure;
    const channel = ports.channels.get(input.channelId);
    const botSlug = channel?.type === 'dm' ? channel.botSlug : undefined;
    if (
      !botSlug ||
      card?.author.kind !== 'bot' ||
      card.author.slug !== botSlug ||
      failure?.role !== 'orchestrator' ||
      !failure.requestMessageId
    )
      throw new SessionRecoveryError(
        'retry-unavailable',
        'Recovery requires the original Bot failure',
      );
    const messageId = failure.requestMessageId;
    const continuing = input.action === 'continue';
    const assertAllowed = () => {
      const bot = ports.registry.get(botSlug);
      if (
        !bot ||
        bot.paused ||
        ports.closed() ||
        (ports.team
          ? !ports.team.channelAccess.canRead(human, input.channelId) ||
            !ports.team.bots.canReach(human, bot.slug)
          : botOwner(bot) !== human.humanId) ||
        !ports.memberBotEnabled(bot)
      )
        throw new SessionRecoveryError('recovery-unavailable', 'This Bot is unavailable');
      ports.requireExecution?.(botSlug);
      if (continuing) {
        if (continuableDmEvent(input.channelId, messageId) === undefined)
          throw new SessionRecoveryError(
            'retry-unavailable',
            'This message has nothing left to continue. Inspect its original Session.',
          );
        return;
      }
      try {
        retryableDmMessage(input.channelId, messageId);
      } catch {
        throw new SessionRecoveryError(
          'retry-unavailable',
          'This message cannot be safely retried. Inspect its original Session.',
        );
      }
    };
    const assertCurrent = () => {
      if (ports.currentOrchestratorSessionId(botSlug) !== failure.sessionId)
        throw new SessionRecoveryError(
          'session-changed',
          'The Session has changed. Retry the message without resetting it.',
        );
      assertAllowed();
    };
    assertCurrent();
    if (ports.tails.has(botSlug))
      throw new SessionRecoveryError(
        'bot-busy',
        'Wait for the current reply or stop the Bot first',
      );
    cancelAutoContinue(botSlug);
    ports.release(botSlug);
    if (continuing) {
      const settled = continueDmTurn(botSlug, input.channelId, messageId, {
        kind: 'failure',
        ...(failure.code === undefined ? {} : { code: failure.code }),
        autoAttempts: 0,
      });
      if (settled === undefined)
        throw new SessionRecoveryError(
          'retry-unavailable',
          'This message has nothing left to continue. Inspect its original Session.',
        );
      void settled.catch(() => undefined);
      return;
    }
    await ports.enqueue(botSlug, async () => {
      assertCurrent();
      if (input.action === 'new-session') {
        const result = await ports.replaceOrchestrator(botSlug, assertAllowed);
        if (result.outcome === 'refused')
          throw new SessionRecoveryError(
            'bot-busy',
            'Wait for the current reply or stop the Bot first',
          );
      } else {
        await loadOrchestrator(botSlug, failure.sessionId);
        assertCurrent();
        const compacted = await input.compact(failure.sessionId).catch(() => false);
        if (!compacted)
          throw new SessionRecoveryError(
            'compaction-failed',
            'Could not compact this Session. Start a new Session to recover.',
          );
        assertCurrent();
      }
      await retryDmMessage(input.channelId, messageId, human);
    });
  }

  async function loadOrchestrator(botSlug: string, sessionId: string): Promise<void> {
    const bot = ports.registry.get(botSlug);
    if (!bot || bot.paused || !ports.agents.loadOrchestrator)
      throw new SessionRecoveryError('recovery-unavailable', 'Could not load the original Session');
    ports.requireExecution?.(botSlug);
    const loading = ports.agents.loadOrchestrator({
      sessionId,
      resume: true,
      bot,
      message: '',
      inbox: '',
      inboundChannelId: undefined,
      ...ports.orchestratorServices(bot, {
        sessionId,
        channelId: undefined,
        sourceEventId: `maintenance-${randomUUID()}`,
        markSideEffect: () => {
          throw new Error('Maintenance cannot perform Bot actions');
        },
        readAdmissions: new Set(),
        importedFiles: new Map(),
        turnSources: new Set(),
        observeMemory: false,
        observeReads: false,
      }),
    });
    await loading.catch((error: unknown) => {
      if (error instanceof Error && error.name === 'SessionUnavailableError')
        throw new SessionRecoveryError(
          'session-unsaved',
          'This Session was never saved, so there is nothing to compact. Start a new Session to recover.',
        );
      throw error;
    });
  }

  async function compactOrchestrator<T>(
    botSlug: string,
    compact: (sessionId: string) => Promise<T>,
  ): Promise<T> {
    if (ports.tails.has(botSlug))
      throw new SessionRecoveryError(
        'bot-busy',
        'Wait for the current reply or stop the Bot first',
      );
    let result: { value: T } | undefined;
    await ports.enqueue(botSlug, async () => {
      const sessionId = ports.currentOrchestratorSessionId(botSlug);
      if (!sessionId)
        throw new SessionRecoveryError('recovery-unavailable', 'No Session to compact');
      await loadOrchestrator(botSlug, sessionId);
      result = { value: await compact(sessionId) };
    });
    if (!result) throw new SessionRecoveryError('recovery-unavailable', 'This Bot is unavailable');
    return result.value;
  }

  async function runMixedGroupTurn(
    run: OrchestratorAgentRun,
    target: RoutingTarget,
    sourceEventId: string | undefined,
    select: (attempted: ReadonlySet<string>) => Promise<MixedGroupPick | undefined>,
  ): Promise<void> {
    const { acceptNativeInput, ...initial } = run;
    const { bot, sessionId, inboundChannelId: channelId } = initial;
    const attempted = new Set<string>();
    let current = initial;
    let accepted = false;
    let inputRecorded = false;
    try {
      for (;;) {
        attempted.add(routingTargetRestKey(target));
        let inputAccepted = false;
        try {
          await ports.agents.runOrchestrator({
            ...current,
            routingTarget: target,
            inputAccepted: () => {
              inputAccepted = true;
              run.inputAccepted?.();
            },
            ...(accepted || acceptNativeInput === undefined
              ? {}
              : { acceptNativeInput: () => (accepted = acceptNativeInput()) }),
          });
          return;
        } catch (error) {
          const rest = routingTargetFailure(target, error);
          if (rest === undefined && !(target.kind === 'engine' && unavailableRoutingEngine(error)))
            throw error;
          ports.switchingRoutingGroups.add(bot.slug);
          const next = await select(attempted);
          if (ports.closed() || ports.stoppedTurns.has(bot.slug))
            throw new Error('The Routing Group switch was cancelled', { cause: error });
          if (next?.kind === 'exhausted')
            throw new RouteRestingError(next.rests, next.subscription);
          if (next?.kind !== 'target') throw new RoutingGroupUnavailableError(error);
          if (
            attempted.size >= MAX_MIXED_GROUP_ATTEMPTS ||
            attempted.has(routingTargetRestKey(next.target))
          )
            throw new RoutingGroupUnavailableError(
              error,
              'The Routing Group reached its continuation limit for this turn.',
            );
          inputRecorded ||= error instanceof EngineLimitError ? error.inputRecorded : inputAccepted;
          current = {
            ...(rest === undefined
              ? current
              : mixedGroupContinuation(initial, sourceEventId, rest, inputRecorded)),
            switchReason: next.switchReason ?? rest?.reason ?? 'credential',
            ...(target.kind === 'route' && inputAccepted
              ? { continuingFromNativeRoute: true }
              : {}),
          };
          ports.failureStreaks.delete(bot.slug);
          await ports.appendModelSwitch(bot.slug, sessionId, channelId, {
            kind: 'switch',
            from: routingTargetKey(target),
            to: routingTargetKey(next.target),
            reason: rest?.reason ?? 'credential',
            ...(rest === undefined ? {} : { until: rest.until }),
          });
          if (ports.closed() || ports.stoppedTurns.has(bot.slug))
            throw new Error('The Routing Group switch was cancelled', { cause: error });
          ports.requireExecution?.(bot.slug);
          target = next.target;
        }
      }
    } finally {
      ports.switchingRoutingGroups.delete(bot.slug);
    }
  }

  function routingTargetFailure(target: RoutingTarget, error: unknown): RestingRoute | undefined {
    if (target.kind === 'route') return ports.routeRests?.restingUntil(target.route);
    return error instanceof EngineLimitError ? error.rests[0] : undefined;
  }

  function mixedGroupContinuation(
    run: OrchestratorAgentRun,
    sourceEventId: string | undefined,
    rest: RestingRoute,
    inputRecorded: boolean,
  ): OrchestratorAgentRun {
    const priorReply = routingGroupReplyState(run.bot.slug, run.sessionId, sourceEventId);
    const priorReplies = run.priorEngineReplies?.();
    const replyInstruction =
      priorReply === 'delivered'
        ? 'The previous target already delivered a reply to this Source Event. Continue any remaining work without answering it again.'
        : priorReply === 'uncertain'
          ? 'The previous reply may have been sent. Check its delivery receipt before considering another send.'
          : 'Reply to the original request if it still needs an answer.';
    const source = sourceEventId === undefined ? '' : ` Source Event ${sourceEventId}.`;
    const cause = rest.reason === 'credential' ? 'lost its credentials' : 'reached its limit';
    const note = `[Host: the previous target ${cause} mid-turn.${source} ${CONTINUE_FROM_SESSION} Use completed tool results without repeating their calls. Verify the effects of any interrupted tool before retrying. ${replyInstruction}]`;
    const continuation: OrchestratorAgentRun = {
      ...run,
      resume: true,
      message: inputRecorded ? note : `${note}\n\n${run.message}`,
      inbox: inputRecorded ? '' : run.inbox,
    };
    if (priorReply === undefined && !priorReplies?.size) return continuation;

    const requireUnanswered = (id: string | undefined): void => {
      if (id === undefined) return;
      if (id === sourceEventId && priorReply !== undefined) throw new Error(replyInstruction);
      if (priorReplies?.has(id))
        throw new Error(
          'A reply to this Source Event is already recorded. Check its delivery receipt.',
        );
    };
    const channelId = run.inboundChannelId;
    continuation.channels = {
      ...run.channels,
      send: (input) => {
        const implicitSource =
          (input.channelId ?? channelId) === channelId ? sourceEventId : undefined;
        requireUnanswered(input.replySourceEventId ?? implicitSource);
        return run.channels.send(input);
      },
    };
    const external = run.externalMessaging;
    if (external !== undefined)
      continuation.externalMessaging = {
        ...external,
        reply: (id, text, key) => {
          requireUnanswered(id);
          return external.reply(id, text, key);
        },
        replyFile: (id, file, key) => {
          requireUnanswered(id);
          return external.replyFile(id, file, key);
        },
      };
    return continuation;
  }

  function routingGroupReplyState(
    botSlug: string,
    sessionId: string,
    sourceEventId: string | undefined,
  ): 'delivered' | 'uncertain' | undefined {
    if (sourceEventId === undefined) return undefined;
    return ports.database.read((db) => {
      const output = db
        .prepare(`
        SELECT 1 FROM channel_output_origins origin
        JOIN source_events output ON output.source_event_id = origin.source_event_id
        JOIN source_events request ON request.source_event_id = origin.request_source_event_id
        WHERE origin.request_source_event_id = ? AND origin.session_id = ?
          AND output.channel_id = request.channel_id AND output.source_kind = 'bot-message'
        LIMIT 1
      `)
        .get(sourceEventId, sessionId);
      if (output !== undefined) return 'delivered';
      const request = db
        .prepare(
          "SELECT 1 FROM source_events WHERE source_event_id = ? AND source_kind = 'bridge-message'",
        )
        .get(sourceEventId);
      if (request === undefined) return undefined;
      const reply = db
        .prepare(`
        SELECT state FROM messaging_outbox
        WHERE bot_slug = ? AND json_extract(body, '$.sourceEventId') = ?
          AND state IN ('provider-accepted', 'pending', 'in-flight', 'unknown-outcome')
        ORDER BY state = 'provider-accepted' DESC, created_at DESC LIMIT 1
      `)
        .get(botSlug, sourceEventId);
      return reply === undefined
        ? undefined
        : reply['state'] === 'provider-accepted'
          ? 'delivered'
          : 'uncertain';
    });
  }

  function restingRoute(botSlug: string, sessionId: string | undefined): RestingRoute | undefined {
    if (ports.routeRests === undefined || sessionId === undefined) return undefined;
    const route = ports.sessionRoute?.(botSlug, sessionId);
    return route === undefined ? undefined : ports.routeRests.restingUntil(route);
  }

  function restsOf(botSlug: string, error: unknown): readonly RestingRoute[] | undefined {
    if (error instanceof RouteRestingError || error instanceof EngineLimitError) return error.rests;
    if (error instanceof RoutingGroupUnavailableError || error instanceof EngineRefusal)
      return undefined;
    const rest = restingRoute(botSlug, ports.currentOrchestratorSessionId(botSlug));
    return rest === undefined ? undefined : [rest];
  }

  async function fallBack(
    botSlug: string,
    sessionId: string,
    channelId: string | undefined,
    error?: unknown,
  ): Promise<ModelSwitch | readonly RestingRoute[] | undefined> {
    if (error instanceof EngineLimitError) {
      const choice = ports.engineFallback?.(botSlug, error);
      if (choice === undefined) return error.rests;
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'engine-fallback',
          botSlug,
          engine: error.engine,
          to: `${choice.to.provider}/${choice.to.model}`,
          until: choice.until,
        }),
      );
      await ports.appendModelSwitch(botSlug, sessionId, channelId, choice);
      return choice;
    }
    const rest = restingRoute(botSlug, sessionId);
    if (rest === undefined) return undefined;
    const choice = await ports.groupFallback?.choose(botSlug, sessionId, rest);
    if (choice?.kind !== 'switch') return choice?.rests ?? [rest];
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'model-fallback',
        botSlug,
        from: `${choice.from.provider}/${choice.from.model}`,
        to: `${choice.to.provider}/${choice.to.model}`,
        reason: choice.reason,
        until: choice.until,
      }),
    );
    await ports.appendModelSwitch(botSlug, sessionId, channelId, choice);
    return choice;
  }

  function clearAutoContinues(): void {
    for (const pending of ports.autoContinues.values()) clearTimeout(pending.timer);
    ports.autoContinues.clear();
  }

  return {
    clearAutoContinues,
    retryDmMessage,
    recoverDmMessage,
    compactOrchestrator,
    cancelAutoContinue,
    restsOf,
    fallBack,
    armAutoContinue,
    runMixedGroupTurn,
    routingGroupReplyState,
    routingTargetFailure,
    continueDmTurn,
    rearmAutoContinues,
  };
}
