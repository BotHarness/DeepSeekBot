import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type { SessionModelChoice } from '@botharness/host-protocol/session-model';

import type { OriginalAttachmentAccess } from '../../attachments/original-access.js';
import type { ChannelAttachmentRef } from '../../attachments/ref.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { createCausalSending } from '../../channels/causal-sending.js';
import {
  dmChannelId,
  type ChannelMessage,
  type ChannelRecord,
  type SessionFailureProgress,
} from '../../channels/channel.js';
import type { createChannelAdmission } from '../../channels/runtime-admission.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { humanContext } from '../../humans/context.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import type { MessagingProcessing } from '../../messaging/typing.js';
import type { PromptText } from '../../prompts/prompt-parts.js';
import { requireSourceEffects } from '../../purge/fence.js';
import type {
  OrchestratorReplacement,
  OrchestratorAgentRun,
  OrchestratorServiceTurn,
  BotAgentAdapter,
  BotRuntimeOptions,
  SourceEventClaim,
  BotHoldCause,
} from '../../runtime/bot-runtime.js';
import { renderInbox, type InboxUnit } from '../../runtime/inbox-render.js';
import type { InboxTriage, OrchestratorInboxTriage } from '../../runtime/inbox-triage.js';
import type { createOrchestratorCancellation } from '../../runtime/orchestrator-cancellation.js';
import {
  type createOrchestratorContinuation,
  type PendingAutoContinue,
  type DmContinuation,
  continuationNote,
  RouteRestingError,
  RoutingGroupUnavailableError,
} from '../../runtime/orchestrator-continuation.js';
import { OrchestratorWorkingDirectoryError } from '../../runtime/orchestrator-working-directory.js';
import {
  directSessionTarget,
  type sessionModelChoices,
} from '../../runtime/session-model-choices.js';
import { recordTurnTarget, type TurnTargetSegment } from '../../runtime/turn-targets.js';
import { botOwner } from '../../team/bot-access.js';
import type { TobCliTurn } from '../../tob/cli-request.js';
import { TobError } from '../../tob/service.js';
import type { createActivityEvents } from '../activity/events.js';
import type { createInboxHarvest } from '../activity/inbox-harvest.js';
import type { createAssignmentExecution } from '../assignments/runtime-execution.js';
import type { createMemoryEvents } from '../memory/events.js';
import { sessionFailureDetails, TRANSIENT_FAILURE_CODES } from './runtime-turn-failures.js';

export const SESSION_STOPPED_REFUSAL =
  'The Human stopped this Session. This action was not performed; wait for the Human before doing more.';

interface OrchestratorTurnsPorts {
  activeMemoryEvents: Map<string, { eventIds: string[]; preserveObservation: boolean }>;
  activeSessionModels: Map<string, SessionModelChoice | null>;
  activityEvents: ReturnType<typeof createActivityEvents>;
  admissionHandled: (sourceEventId: string, botSlug: string) => boolean;
  agents: BotAgentAdapter;
  assignmentExecution: ReturnType<typeof createAssignmentExecution>;
  autoContinueDelaysMs: readonly number[];
  autoContinues: Map<string, PendingAutoContinue>;
  cancellation: ReturnType<typeof createOrchestratorCancellation>;
  causalSending: ReturnType<typeof createCausalSending>;
  channelAdmission: ReturnType<typeof createChannelAdmission>;
  channels: ChannelStore;
  closed: () => boolean;
  continuation: ReturnType<typeof createOrchestratorContinuation>;
  currentOrchestratorSessionId: (botSlug: string) => string | undefined;
  database: OperationalDatabaseModulePort;
  ensureOrchestrator: (bot: PersonaBotRecord, at: string) => { sessionId: string; resume: boolean };
  externalMessaging: OutboundMessaging | undefined;
  failureStreaks: Map<string, number>;
  groupFallback: BotRuntimeOptions['groupFallback'];
  held: Map<string, BotHoldCause>;
  holdForRestingRoute: (
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ) => Promise<boolean>;
  inboxHarvest: ReturnType<typeof createInboxHarvest>;
  inboxTriage: InboxTriage;
  interruptedDmNotice: (botSlug: string, channelId: string | undefined) => string;
  isMember: (botSlug: string, channel: ChannelRecord) => boolean;
  markReportsHandled: (sourceEventIds: string[], botSlug?: string, sessionId?: string) => void;
  markReportSideEffects: (
    sourceEventIds: readonly string[],
    botSlug: string,
    transaction?: DatabaseSync,
  ) => void;
  markSideEffectStarted: (sourceEventId: string, transaction?: DatabaseSync) => void;
  markSourceEventFailed: (sourceEventId: string) => void;
  memberBotEnabled: (bot: PersonaBotRecord) => boolean;
  memory: BotRuntimeOptions['memory'];
  memoryEvents: ReturnType<typeof createMemoryEvents>;
  memoryTurnOperations: Set<string>;
  nativeStepReady: Map<string, (accepted: boolean) => void>;
  notifyReadAdmissions: (sourceEventIds: Set<string>) => void;
  now: () => Date;
  observeAdmission: (
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    messageId: string,
    claimPending?: boolean,
  ) => void;
  orchestratorServices: (
    bot: PersonaBotRecord,
    turn: OrchestratorServiceTurn,
  ) => Omit<
    OrchestratorAgentRun,
    'sessionId' | 'resume' | 'bot' | 'message' | 'inbox' | 'inboundChannelId'
  > & { triage: OrchestratorInboxTriage };
  originalAttachments: OriginalAttachmentAccess;
  pickSessionGroup: (
    botSlug: string,
    choice: Extract<SessionModelChoice, { kind: 'group' }>,
    attempted?: ReadonlySet<string>,
  ) => Promise<import('../../models/group-fallback.js').MixedGroupPick>;
  preparedOrchestrators: Set<string>;
  promptText: (botSlug: string) => PromptText;
  publishSessionFailure: (input: {
    channelId: string;
    requestMessageId?: string;
    botSlug: string;
    sessionId: string;
    role: 'orchestrator' | 'assignment';
    error: unknown;
    context?: string;
    assignmentAnswerTo?: string;
    progress?: SessionFailureProgress | undefined;
    autoContinue?: { attempt: number; maxAttempts: number; at: string };
  }) => Promise<void>;
  readTurnProgress: BotRuntimeOptions['readTurnProgress'];
  recordTurnCommits: (botSlug: string, causeSourceEventId: string) => Promise<void>;
  refreshQuoteBlocks: (
    body: string,
    sources: ReadonlyArray<readonly [string, { channelId: string; message: ChannelMessage }]>,
  ) => string;
  replaceOrchestrator: <T>(botSlug: string, body: () => T) => Promise<OrchestratorReplacement<T>>;
  requireExecution: BotRuntimeOptions['requireExecution'];
  requireModelRoute: BotRuntimeOptions['requireModelRoute'];
  requireTurnAccess: (botSlug: string, ids: Iterable<string>) => void;
  sessionArchived: ((sessionId: string) => boolean) | undefined;
  sessionModels: ReturnType<typeof sessionModelChoices>;
  setObserved: (sourceEventIds: string[], at: string | null, botSlug?: string) => void;
  speakerInput: (
    botSlug: string,
    sessionId: string,
    ids: readonly string[],
    body: string,
  ) => { text: string; commit: () => void } | undefined;
  stopNotices: Map<string, string>;
  stoppedTurns: Set<string>;
  triageBaseline: Map<string, number>;
  triageRunning: Map<string, number>;
  turnQuoteBlocks: (
    body: string,
  ) => ReadonlyArray<readonly [string, { channelId: string; message: ChannelMessage }]>;
  turnSideEffectStarted: (botSlug: string) => boolean;
  turnSources: Map<
    string,
    {
      sessionId: string;
      eventIds: Set<string>;
      acceptedEventIds: Set<string>;
      inboundChannelId: string | undefined;
      steeredChannelIds: Set<string>;
      memoryObservation: 'source-event' | 'recovered-question';
    }
  >;
  typingTurns: Map<string, MessagingProcessing>;
  warn: ((message: string) => void) | undefined;
}

export function createOrchestratorTurns(ports: OrchestratorTurnsPorts) {
  async function runHumanDmTurn(
    bot: PersonaBotRecord,
    channelId: string,
    body: string,
    claim: SourceEventClaim,
    messageId: string,
    continuation?: DmContinuation,
    tobCliTurn?: TobCliTurn,
  ): Promise<void> {
    if (claim.reconciliationRequired === true) {
      throw new Error(`Source Event ${claim.sourceEventId} requires reconciliation before replay`);
    }
    if (!claim.shouldRun) return;
    if (ports.admissionHandled(claim.sourceEventId, bot.slug)) return;
    if (continuation === undefined && ports.autoContinues.get(bot.slug)?.messageId !== messageId)
      ports.continuation.cancelAutoContinue(bot.slug);

    const timestamp = ports.now().toISOString();
    let orchestrator = ports.ensureOrchestrator(bot, timestamp);

    const collected =
      tobCliTurn === undefined
        ? ports.inboxHarvest.collectInbox(bot.slug)
        : { units: [], eventIds: [] };
    ports.setObserved(collected.eventIds, timestamp, bot.slug);
    try {
      tobCliTurn?.signal.throwIfAborted();
      ports.observeAdmission(claim.sourceEventId, bot.slug, channelId, messageId, true);
      await runOnLiveOrchestrator(bot, orchestrator, (session) => {
        orchestrator = session;
        return runOrchestratorTurn(
          bot,
          session,
          claim.sourceEventId,
          channelId,
          (continuation === undefined ? '' : continuationNote(continuation)) +
            ports.channelAdmission.inboundChannelMessage(
              bot.slug,
              channelId,
              messageId,
              body,
              claim.sourceEventId,
            ),
          collected.units,
          ports.channels.message(channelId, messageId)?.memorySwitchTarget !== undefined,
          undefined,
          collected.eventIds,
          undefined,
          undefined,
          undefined,
          undefined,
          tobCliTurn,
        );
      });
    } catch (error) {
      ports.setObserved(collected.eventIds, null, bot.slug);
      ports.markSourceEventFailed(claim.sourceEventId);
      const code = sessionFailureDetails(error).code;
      const autoAttempts = continuation?.autoAttempts ?? 0;
      const delayMs = ports.autoContinueDelaysMs[autoAttempts];
      const resting = ports.continuation.restsOf(bot.slug, error) !== undefined;
      if (
        resting &&
        !(error instanceof RouteRestingError) &&
        tobCliTurn === undefined &&
        !ports.stoppedTurns.has(bot.slug) &&
        !ports.held.has(bot.slug) &&
        channelId === dmChannelId(bot.slug)
      ) {
        const fallback = await ports.continuation.fallBack(
          bot.slug,
          orchestrator.sessionId,
          channelId,
          error,
        );
        if (fallback !== undefined && 'kind' in fallback) {
          ports.failureStreaks.delete(bot.slug);
          ports.continuation.armAutoContinue(
            bot.slug,
            { channelId, messageId, sessionId: orchestrator.sessionId, attempt: autoAttempts },
            0,
            code ?? 'ROUTE_FALLBACK',
          );
          throw error;
        }
      }
      const autoContinue =
        tobCliTurn === undefined &&
        !resting &&
        code !== undefined &&
        TRANSIENT_FAILURE_CODES.has(code) &&
        delayMs !== undefined &&
        !ports.stoppedTurns.has(bot.slug) &&
        !ports.held.has(bot.slug) &&
        channelId === dmChannelId(bot.slug)
          ? {
              attempt: autoAttempts + 1,
              maxAttempts: ports.autoContinueDelaysMs.length,
              at: new Date(ports.now().getTime() + delayMs).toISOString(),
            }
          : undefined;
      const sessionId = orchestrator.sessionId;
      await ports.publishSessionFailure({
        channelId,
        requestMessageId: messageId,
        botSlug: bot.slug,
        sessionId,
        role: 'orchestrator',
        error,
        progress: await ports.readTurnProgress?.(sessionId).catch(() => undefined),
        ...(autoContinue === undefined ? {} : { autoContinue }),
      });
      if (resting) await ports.holdForRestingRoute(bot.slug, channelId, error);
      if (autoContinue !== undefined && code !== undefined && delayMs !== undefined)
        ports.continuation.armAutoContinue(
          bot.slug,
          { channelId, messageId, sessionId, attempt: autoContinue.attempt },
          delayMs,
          code,
        );
      throw error;
    }
    ports.markReportsHandled(collected.eventIds, bot.slug, orchestrator.sessionId);
    const handledAt = ports.now().toISOString();
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET handled_at = ?, attempt_state = 'handled'
              WHERE source_event_id = ?`,
          )
          .run(handledAt, claim.sourceEventId);
        database
          .prepare(
            `
          UPDATE inbox_admissions
             SET handled_at = ?, attempt_state = 'handled', opened_at = COALESCE(opened_at, ?)
           WHERE source_event_id = ? AND bot_slug = ?
        `,
          )
          .run(handledAt, handledAt, claim.sourceEventId, bot.slug);
      },
      ['source-event', 'bot-inbox'],
    );
    ports.channels.admissionChanged?.(
      channelId,
      ports.database.read((database) => {
        const row = database
          .prepare('SELECT message_id FROM source_events WHERE source_event_id = ?')
          .get(claim.sourceEventId) as { message_id: string | null } | undefined;
        return row?.message_id ?? '';
      }),
    );
  }

  async function runOrchestratorTurn(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    sourceEventId: string | undefined,
    channelId: string | undefined,
    body: string,
    inboxUnits: InboxUnit[],
    coordinateBranchSwitch = false,
    markAttemptSideEffect: (database?: DatabaseSync) => void = (database) => {
      if (sourceEventId !== undefined) ports.markSideEffectStarted(sourceEventId, database);
    },
    reportEventIds: readonly string[] = [],
    wakeEventIds: readonly string[] = sourceEventId === undefined ? [] : [sourceEventId],
    acceptNativeInput?: () => boolean,
    nativeSourceIds: readonly string[] = [],
    memoryObservation: 'source-event' | 'recovered-question' = 'source-event',
    tobCliTurn?: TobCliTurn,
  ): Promise<void> {
    if (!ports.memberBotEnabled(bot)) throw new TobError('permission-required');
    const readAdmissions = new Set<string>();
    ports.requireExecution?.(bot.slug);
    const choice =
      tobCliTurn === undefined ? ports.sessionModels.get(orchestrator.sessionId) : null;
    const explicitEngine =
      tobCliTurn === undefined && choice === null && ports.agents.runsOnEngine?.(bot.slug) === true;
    const selectGroup = async (attempted?: ReadonlySet<string>) =>
      choice?.kind === 'group'
        ? ports.pickSessionGroup(bot.slug, choice, attempted)
        : ports.groupFallback?.pickMixedOrchestrator?.(bot.slug, attempted);
    const group =
      tobCliTurn === undefined && (choice?.kind === 'group' || (choice === null && !explicitEngine))
        ? await selectGroup()
        : undefined;
    if (group?.kind === 'exhausted') throw new RouteRestingError(group.rests, group.subscription);
    if (group?.kind === 'unavailable') throw new RoutingGroupUnavailableError();
    const routingTarget =
      choice !== null && choice.kind !== 'group' ? directSessionTarget(choice) : group?.target;
    if (routingTarget?.kind === 'route') ports.requireModelRoute?.(bot.slug, routingTarget.route);
    let switchReason = group?.switchReason;
    if (routingTarget === undefined && !explicitEngine) {
      if (!orchestrator.resume) await ports.groupFallback?.start(bot.slug, orchestrator.sessionId);
      const fallback = await ports.continuation.fallBack(
        bot.slug,
        orchestrator.sessionId,
        channelId,
      );
      if (fallback !== undefined && !('kind' in fallback)) throw new RouteRestingError(fallback);
      if (fallback?.kind === 'switch') switchReason = fallback.reason;
    }
    const turnSources = new Set([
      ...(sourceEventId === undefined ? [] : [sourceEventId]),
      ...wakeEventIds,
      ...reportEventIds,
      ...nativeSourceIds,
    ]);
    ports.activeSessionModels.set(orchestrator.sessionId, choice);
    ports.turnSources.set(bot.slug, {
      sessionId: orchestrator.sessionId,
      eventIds: turnSources,
      acceptedEventIds: new Set(turnSources),
      inboundChannelId: channelId,
      steeredChannelIds: new Set(),
      memoryObservation,
    });
    const typingSources = [...turnSources, ...inboxUnits.map((unit) => unit.sourceEventId)];
    for (const unit of inboxUnits) {
      if (!unit.assignmentSessionId) continue;
      const origin = ports.assignmentExecution.assignmentRow(
        bot.slug,
        unit.assignmentSessionId,
      )?.source_event_id;
      if (origin) typingSources.push(origin);
    }
    let processing: MessagingProcessing | undefined;
    const memorySource = ports.database.read((db) =>
      db
        .prepare(
          `
          SELECT e.source_kind, EXISTS (
            SELECT 1 FROM inbox_admissions a
             WHERE a.source_event_id = e.source_event_id AND a.bot_slug = ?
               AND a.reason = 'group-ordinary'
          ) AS ordinary
            FROM source_events e WHERE e.source_event_id = ?
        `,
        )
        .get(bot.slug, sourceEventId ?? null),
    );
    const observeMemory =
      tobCliTurn === undefined &&
      memoryObservation === 'source-event' &&
      sourceEventId !== undefined &&
      memorySource?.source_kind !== 'bridge-message' &&
      !(memorySource?.source_kind === 'bot-message' && memorySource.ordinary === 1);
    let memoryEventIds: string[] = [];
    let preserveObservation = false;
    const importedFiles = new Map<string, ChannelAttachmentRef>();
    const markSideEffect = (database?: DatabaseSync): void => {
      ports.requireTurnAccess(bot.slug, new Set([...turnSources, ...readAdmissions]));
      if (ports.stoppedTurns.has(bot.slug)) throw new Error(SESSION_STOPPED_REFUSAL);
      ports.database.read((db) => {
        for (const id of new Set([...turnSources, ...readAdmissions]))
          requireSourceEffects(db, id, bot.slug);
      });
      ports.markReportSideEffects([...reportEventIds, ...memoryEventIds], bot.slug, database);
      markAttemptSideEffect(database);
    };
    try {
      const ids = [...new Set(wakeEventIds)];
      if (ids.length > 0)
        ports.database.transaction(
          (database) => {
            const rows = database
              .prepare(
                `
          SELECT DISTINCT reason FROM inbox_admissions
           WHERE bot_slug = ? AND source_event_id IN (${ids.map(() => '?').join(', ')})
        `,
              )
              .all(bot.slug, ...ids) as { reason: string }[];
            const startedAt = ports.now().toISOString();
            for (const row of rows)
              database
                .prepare(
                  `
          INSERT INTO bot_source_wake_attempts
            (wake_id, bot_slug, source_class, session_id, started_at)
          VALUES (?, ?, ?, ?, ?)
        `,
                )
                .run(randomUUID(), bot.slug, row.reason, orchestrator.sessionId, startedAt);
          },
          ['bot-inbox'],
        );
      if (observeMemory) ports.memoryTurnOperations.add(bot.slug);
      const quoteSources = ports.turnQuoteBlocks(body);
      const change = observeMemory
        ? await (ports.memory?.prepareTurnAsync ?? ports.memory?.prepareTurn)?.(
            bot.slug,
            orchestrator.sessionId,
            {
              coordinateBranchSwitch,
            },
          )
        : undefined;
      if (ports.closed() || ports.stoppedTurns.has(bot.slug))
        throw new Error(SESSION_STOPPED_REFUSAL);
      body = ports.refreshQuoteBlocks(body, quoteSources);
      const observation = observeMemory
        ? ports.memory?.preparedObservation?.(bot.slug, orchestrator.sessionId)
        : undefined;
      if (observation !== undefined) {
        preserveObservation = true;
        ports.memoryEvents.recordMemoryObservation(bot.slug, observation);
        preserveObservation = false;
      } else if (change !== undefined) {
        preserveObservation = true;
        ports.memoryEvents.admitMemoryChange(bot.slug, change);
        preserveObservation = false;
      }
      const memoryInbox = observeMemory
        ? ports.memoryEvents.collectMemoryInbox(bot.slug)
        : { units: [], eventIds: [] };
      memoryEventIds = memoryInbox.eventIds;
      const units = [...inboxUnits, ...memoryInbox.units];
      const inbox = [
        units.length === 0 ? '' : renderInbox(units, ports.promptText(bot.slug)),
        ports.inboxTriage.openSummary(bot.slug),
      ]
        .filter((part) => part.length > 0)
        .join('\n\n');
      ports.setObserved(memoryEventIds, ports.now().toISOString());
      if (observeMemory)
        ports.activeMemoryEvents.set(bot.slug, {
          eventIds: memoryEventIds,
          preserveObservation: false,
        });
      ports.memoryTurnOperations.delete(bot.slug);
      processing = ports.externalMessaging?.beginProcessing(bot.slug, typingSources);
      if (processing) ports.typingTurns.set(bot.slug, processing);
      ports.database.transaction(
        (db) => {
          const source = db
            .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
            .get(sourceEventId ?? null);
          const humanId = typeof source?.['human_id'] === 'string' ? source['human_id'] : undefined;
          if (humanId)
            db.prepare('INSERT OR REPLACE INTO usage_turn_humans VALUES (?, -1, ?, ?)').run(
              orchestrator.sessionId,
              humanId,
              ports.now().getTime(),
            );
          else
            db.prepare('DELETE FROM usage_turn_humans WHERE session_id = ? AND turn = -1').run(
              orchestrator.sessionId,
            );
        },
        ['usage'],
      );
      const envelope = ports.speakerInput(bot.slug, orchestrator.sessionId, [...turnSources], body);
      const request = randomUUID();
      const segments: TurnTargetSegment[] = [];
      const observeTurnTarget: NonNullable<OrchestratorAgentRun['observeTurnTarget']> = (
        turn,
        step,
        target,
        reason,
      ) => {
        const previous = segments.at(-1);
        if (previous?.turn === turn && JSON.stringify(previous.target) === JSON.stringify(target))
          return;
        const segment = {
          turn,
          step,
          request,
          target,
          ...(reason === undefined ? {} : { switchReason: reason }),
        };
        recordTurnTarget(ports.database, orchestrator.sessionId, segment);
        if (previous?.turn === turn && previous.step === step) segments.pop();
        segments.push(segment);
      };
      const run: OrchestratorAgentRun & { triage: OrchestratorInboxTriage } = {
        observeTurnTarget,
        ...(switchReason === undefined ? {} : { switchReason }),
        ...(choice === null ? {} : { groupEffort: choice.effort ?? null }),
        ...(tobCliTurn === undefined ? {} : { tobCliTurn }),
        setExecutionReady: (ready) => {
          if (ready) {
            ports.preparedOrchestrators.add(orchestrator.sessionId);
            ports.nativeStepReady.get(orchestrator.sessionId)?.(true);
          } else ports.preparedOrchestrators.delete(orchestrator.sessionId);
        },
        canUseEngineChannel: (id) => {
          const turn = ports.turnSources.get(bot.slug);
          if (turn?.sessionId !== orchestrator.sessionId) return false;
          const channel = ports.channels.get(id);
          if (channel === undefined || !ports.isMember(bot.slug, channel)) return false;
          return (
            turn.steeredChannelIds.has(id) ||
            ports.causalSending.turnSourceIn(
              bot.slug,
              id,
              readAdmissions,
              turn.acceptedEventIds,
            ) !== undefined
          );
        },
        priorEngineReplies: () => {
          const turn = ports.turnSources.get(bot.slug);
          if (turn?.sessionId !== orchestrator.sessionId) return new Set();
          return new Set(
            [...turn.acceptedEventIds].filter(
              (id) =>
                ports.continuation.routingGroupReplyState(bot.slug, orchestrator.sessionId, id) !==
                undefined,
            ),
          );
        },
        inputAccepted: () => envelope?.commit(),
        ...(acceptNativeInput === undefined ? {} : { acceptNativeInput }),
        requireContent: () => {
          ports.requireTurnAccess(bot.slug, new Set([...turnSources, ...readAdmissions]));
          ports.database.read((db) => {
            for (const id of new Set([...turnSources, ...readAdmissions]))
              requireSourceEffects(db, id, bot.slug);
          });
        },
        sessionId: orchestrator.sessionId,
        resume: orchestrator.resume,
        bot,
        toolsInterrupted: (calls) =>
          ports.cancellation.recordInterruptedTools(bot.slug, orchestrator.sessionId, calls),
        message: (() => {
          const human =
            channelId === undefined
              ? undefined
              : ports.channels
                  .listHumanMembers(humanContext(botOwner(bot)), channelId)
                  .find((member) => member.humanId === botOwner(bot));
          const stopped = ports.stopNotices.get(bot.slug) ?? '';
          ports.stopNotices.delete(bot.slug);
          return (
            stopped +
            ports.cancellation.takeInterruptedToolsNote(orchestrator.sessionId) +
            ports.interruptedDmNotice(bot.slug, channelId) +
            (envelope
              ? envelope.text
              : human === undefined || human.displayName === 'Human'
                ? body
                : 'Current Channel Human: ' +
                  JSON.stringify({
                    humanId: human.humanId,
                    displayName: human.displayName,
                  }) +
                  '\n' +
                  body)
          );
        })(),
        inbox,
        inboundChannelId: channelId,
        ...ports.orchestratorServices(bot, {
          sessionId: orchestrator.sessionId,
          channelId,
          sourceEventId,
          markSideEffect,
          readAdmissions,
          importedFiles,
          turnSources,
          observeMemory,
          observeReads: true,
          modelContent: body + '\n' + inbox,
          replyTargets: () => segments,
        }),
      };
      if (group?.kind === 'target') {
        await ports.continuation.runMixedGroupTurn(run, group.target, sourceEventId, selectGroup);
      } else {
        try {
          await ports.agents.runOrchestrator({
            ...run,
            ...(routingTarget === undefined ? {} : { routingTarget }),
          });
        } catch (error) {
          const rest =
            routingTarget === undefined
              ? undefined
              : ports.continuation.routingTargetFailure(routingTarget, error);
          if (rest !== undefined) throw new RouteRestingError([rest]);
          throw error;
        }
      }
      ports.requireTurnAccess(bot.slug, turnSources);
      if (acceptNativeInput === undefined) envelope?.commit();
      if (tobCliTurn !== undefined && sourceEventId !== undefined)
        run.triage.resolve({ ids: [sourceEventId], outcome: 'done' });
      if (observeMemory) {
        await ports.memoryEvents.settleSteerMemoryScan(bot.slug);
        ports.memoryTurnOperations.add(bot.slug);
        await (ports.memory?.reconcileTurnAsync ?? ports.memory?.reconcileTurn)?.({
          botSlug: bot.slug,
          sessionId: orchestrator.sessionId,
          sourceEventId,
          preserveObservation: ports.activeMemoryEvents.get(bot.slug)?.preserveObservation ?? false,
        });
        await ports.recordTurnCommits(bot.slug, sourceEventId!);
      }
      ports.markReportsHandled(memoryEventIds);
      ports.inboxHarvest.settleHarvestHandled(bot.slug, [...readAdmissions]);
      ports.notifyReadAdmissions(readAdmissions);
      if (!ports.triageRunning.has(bot.slug)) ports.triageBaseline.delete(bot.slug);
      if (tobCliTurn === undefined && !ports.stoppedTurns.has(bot.slug))
        ports.activityEvents.queueTriage(bot.slug);
    } catch (error) {
      ports.setObserved(memoryEventIds, null);
      ports.inboxHarvest.settleHarvestFailure(bot.slug, [...readAdmissions], String(error));
      ports.notifyReadAdmissions(readAdmissions);
      if (observeMemory) {
        await ports.memoryEvents.settleSteerMemoryScan(bot.slug);
        ports.memoryTurnOperations.add(bot.slug);
        await (ports.memory?.abortTurnAsync ?? ports.memory?.abortTurn)?.(
          bot.slug,
          orchestrator.sessionId,
          preserveObservation || ports.activeMemoryEvents.get(bot.slug)?.preserveObservation,
        );
      }
      throw error;
    } finally {
      ports.memoryTurnOperations.delete(bot.slug);
      await processing?.stop();
      if (ports.typingTurns.get(bot.slug) === processing) ports.typingTurns.delete(bot.slug);
      if (ports.turnSources.get(bot.slug)?.eventIds === turnSources) {
        ports.turnSources.delete(bot.slug);
        ports.stoppedTurns.delete(bot.slug);
      }
      if (observeMemory) ports.activeMemoryEvents.delete(bot.slug);
      ports.activeSessionModels.delete(orchestrator.sessionId);
      ports.originalAttachments.clear(orchestrator.sessionId);
    }
  }

  async function runOnLiveOrchestrator(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    run: (orchestrator: { sessionId: string; resume: boolean }) => Promise<void>,
  ): Promise<{ sessionId: string; resume: boolean }> {
    try {
      await run(orchestrator);
      return orchestrator;
    } catch (error) {
      if (ports.closed() || ports.turnSideEffectStarted(bot.slug)) throw error;
      if (error instanceof OrchestratorWorkingDirectoryError)
        return replaceMisplacedOrchestrator(bot, orchestrator, error, run);
      if (ports.sessionArchived?.(orchestrator.sessionId) !== true) throw error;
      const replacement = ports.ensureOrchestrator(bot, ports.now().toISOString());
      if (replacement.sessionId === orchestrator.sessionId) throw error;
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'orchestrator-archived-mid-turn',
          botSlug: bot.slug,
          archivedSessionId: orchestrator.sessionId,
          sessionId: replacement.sessionId,
        }),
      );
      await run(replacement);
      return replacement;
    }
  }

  async function replaceMisplacedOrchestrator(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    error: OrchestratorWorkingDirectoryError,
    run: (orchestrator: { sessionId: string; resume: boolean }) => Promise<void>,
  ): Promise<{ sessionId: string; resume: boolean }> {
    if (ports.currentOrchestratorSessionId(bot.slug) !== orchestrator.sessionId) throw error;
    const replaced = await ports.replaceOrchestrator(bot.slug, () => undefined);
    if (replaced.outcome === 'refused') throw error;
    const replacement = ports.ensureOrchestrator(bot, ports.now().toISOString());
    if (replacement.sessionId === orchestrator.sessionId) throw error;
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'orchestrator-working-directory-replaced',
        botSlug: bot.slug,
        replacedSessionId: orchestrator.sessionId,
        sessionId: replacement.sessionId,
        sessionCwd: error.sessionCwd,
        memoryCwd: error.memoryCwd,
      }),
    );
    await run(replacement);
    return replacement;
  }

  return { runHumanDmTurn, runOrchestratorTurn, runOnLiveOrchestrator };
}
