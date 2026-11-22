import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelStore } from '../../channels/store.js';
import { PrivateInputRefusal, type PrivateInputOrigin } from '../../credentials/im-origin.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { MemoryAcceptError } from '../../memory/accepted.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import { requireSourceEffects } from '../../purge/fence.js';
import { channelSql } from '../../runtime/attention.js';
import type { BotRuntime, BotRuntimeOptions } from '../../runtime/bot-runtime.js';
import type { InboxUnit } from '../../runtime/inbox-render.js';
import type { createOrchestratorScheduling } from '../../runtime/orchestrator-scheduling.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import type { ToolApprovalOrigin } from '../../workspaces/tool-approval.js';
import type { ActiveDirectTool } from '../sessions/direct-tools.js';

interface RuntimeInputPorts {
  activeDirectTools: ReadonlyMap<string, ActiveDirectTool>;
  bindPrivateInputOrigin: NonNullable<BotRuntime['bindPrivateInputOrigin']>;
  channels: ChannelStore;
  closed: () => boolean;
  database: OperationalDatabaseModulePort;
  enqueue: ReturnType<typeof createOrchestratorScheduling>['enqueue'];
  externalMessaging: OutboundMessaging | undefined;
  markSideEffectStarted: (sourceEventId: string) => void;
  nativeQuestionAvailable: NonNullable<BotRuntime['nativeQuestionAvailable']>;
  ownership: SessionOwnership;
  recoverNativeQuestionInput: NonNullable<BotRuntime['recoverNativeQuestionInput']>;
  registry: PersonaBotRegistry;
  runOrchestratorTurn: (
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    sourceEventId: string,
    channelId: string,
    body: string,
    inboxUnits: InboxUnit[],
    coordinateBranchSwitch: boolean,
    markAttemptSideEffect: () => void,
    reportEventIds: readonly string[],
    wakeEventIds: readonly string[],
    acceptNativeInput: () => boolean,
    nativeSourceIds: readonly string[],
    memoryObservation: 'source-event' | 'recovered-question',
  ) => Promise<void>;
  sessionArchived: (sessionId: string) => boolean | undefined;
  turnSources: ReadonlyMap<
    string,
    {
      sessionId: string;
      acceptedEventIds: ReadonlySet<string>;
      inboundChannelId: string | undefined;
      steeredChannelIds: ReadonlySet<string>;
      memoryObservation: 'source-event' | 'recovered-question';
    }
  >;
  warn: BotRuntimeOptions['warn'];
}

export function createRuntimeInputs(ports: RuntimeInputPorts) {
  function askOrigin({
    sessionId,
    callId,
  }: {
    sessionId: string;
    callId?: string;
  }): ToolApprovalOrigin | undefined {
    const owner = ports.ownership.resolve(sessionId);
    if (ports.closed() || owner?.rootRole !== 'orchestrator') return undefined;
    const direct = ports.activeDirectTools.get(callId ?? sessionId);
    if (direct !== undefined) {
      if (direct.botSlug !== owner.botSlug || direct.agentSessionId !== sessionId) return undefined;
      const channel =
        direct.approvalHuman === undefined
          ? undefined
          : ports.channels.getOrCreateDm(
              direct.approvalHuman,
              owner.botSlug,
              ports.registry.get(owner.botSlug)?.displayName,
            );
      return channel?.type === 'dm' && channel.botSlug === owner.botSlug
        ? { kind: 'direct', channelId: channel.id }
        : undefined;
    }
    const turn = ports.turnSources.get(owner.botSlug);
    if (
      turn?.sessionId !== sessionId ||
      turn.inboundChannelId === undefined ||
      turn.steeredChannelIds.size > 0
    )
      return undefined;
    const channel = ports.channels.get(turn.inboundChannelId);
    if (channel === undefined) return undefined;
    if (channel.type === 'group')
      return channel.members.includes(owner.botSlug)
        ? { kind: 'turn', channelId: channel.id }
        : undefined;
    return channel.botSlug === owner.botSlug ? { kind: 'turn', channelId: channel.id } : undefined;
  }

  function canRequestPrivateInput(sessionId: string, selected?: string): boolean {
    const owner = ports.ownership.resolve(sessionId);
    if (
      ports.closed() ||
      owner?.rootRole !== 'orchestrator' ||
      !ports.ownership.contentAvailable(sessionId)
    )
      return false;
    const turn = ports.turnSources.get(owner.botSlug);
    if (turn?.sessionId !== sessionId) return false;
    try {
      if (ports.bindPrivateInputOrigin(sessionId, selected) !== undefined) return true;
    } catch {
      return false;
    }
    return hasLocalPrivateInputSource(owner.botSlug, turn.acceptedEventIds);
  }

  function hasLocalPrivateInputSource(botSlug: string, sourceEventIds: Iterable<string>): boolean {
    return ports.database.read((db) => {
      const human = db.prepare(
        `SELECT e.channel_id FROM source_events e
         JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
         WHERE e.source_event_id = ? AND a.bot_slug = ? AND e.source_kind = 'human-message'
           AND a.reason IN ('human-dm', 'group-mention', 'group-ordinary')`,
      );
      return [...sourceEventIds].some((id) => {
        const source = human.get(id, botSlug);
        if (
          typeof source?.channel_id !== 'string' ||
          ports.channels.get(source.channel_id) === undefined
        )
          return false;
        try {
          requireSourceEffects(db, id, botSlug);
          return true;
        } catch {
          return false;
        }
      });
    });
  }

  function bindPrivateInputOrigin(
    sessionId: string,
    selected?: string,
  ): PrivateInputOrigin | undefined {
    const owner = ports.ownership.resolve(sessionId);
    const turn = owner === undefined ? undefined : ports.turnSources.get(owner.botSlug);
    if (owner?.rootRole !== 'orchestrator' || turn?.sessionId !== sessionId) {
      if (selected !== undefined) throw new PrivateInputRefusal('private-source-invalid');
      return undefined;
    }
    if (selected === undefined && hasLocalPrivateInputSource(owner.botSlug, turn.acceptedEventIds))
      return undefined;
    const ids = ports.database.read((db) => {
      const query = db.prepare('SELECT source_kind FROM source_events WHERE source_event_id = ?');
      return [...turn.acceptedEventIds].filter(
        (id) => query.get(id)?.source_kind === 'bridge-message',
      );
    });
    if (ids.length === 0 && selected === undefined) return undefined;
    const id = selected ?? (ids.length === 1 ? ids[0] : undefined);
    if (id === undefined) throw new PrivateInputRefusal('private-source-required');
    if (!ids.includes(id)) throw new PrivateInputRefusal('private-source-invalid');
    if (ports.externalMessaging === undefined)
      throw new PrivateInputRefusal('private-source-unavailable');
    const messaging = ports.externalMessaging;
    const bot = ports.registry.get(owner.botSlug);
    if (bot === undefined) throw new PrivateInputRefusal('private-source-revoked');
    const signal = messaging.inbound.sourceSignal(owner.botSlug, id);
    const applies = () => ports.turnSources.get(owner.botSlug) === turn;
    const current = () => {
      const currentOwner = ports.ownership.resolve(sessionId);
      const currentBot = ports.registry.get(owner.botSlug);
      if (
        ports.closed() ||
        signal.aborted ||
        currentBot?.createdAt !== bot.createdAt ||
        currentBot.paused === true ||
        currentOwner?.rootRole !== 'orchestrator' ||
        currentOwner.botSlug !== owner.botSlug ||
        !ports.ownership.contentAvailable(sessionId) ||
        !applies() ||
        !turn.acceptedEventIds.has(id) ||
        !messaging.inbound.available(owner.botSlug, id)
      )
        return false;
      try {
        ports.database.read((db) => requireSourceEffects(db, id, owner.botSlug));
        return true;
      } catch {
        return false;
      }
    };
    if (!current()) throw new PrivateInputRefusal('private-source-revoked');
    return { sourceEventId: id, signal, applies, current };
  }

  function bindNativeQuestionInput(
    sessionId: string,
    channelId: string,
    question?: { messageId: string; callId: string },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    const owner = ports.ownership.resolve(sessionId);
    const turn = owner === undefined ? undefined : ports.turnSources.get(owner.botSlug);
    const sources = turn?.sessionId === sessionId ? turn.acceptedEventIds : undefined;
    const sourceEventId = sources?.values().next().value;
    if (owner?.rootRole !== 'orchestrator' || sourceEventId === undefined) return undefined;
    if (turn?.memoryObservation === 'recovered-question') {
      if (question === undefined) return undefined;
      return (deliver) => {
        const request = ports.channels.message(channelId, question.messageId)?.userQuestionRequest;
        if (request?.callId !== question.callId) {
          ports.warn?.(
            'native-question-input-refused phase=binding reason=question-card-unavailable',
          );
          return Promise.resolve(false);
        }
        return (
          ports.recoverNativeQuestionInput(sessionId, channelId, question.messageId)?.(deliver) ??
          Promise.resolve(false)
        );
      };
    }
    return nativeQuestionInput(
      owner.botSlug,
      sessionId,
      channelId,
      sourceEventId,
      [...(sources ?? [])],
      () => ports.markSideEffectStarted(sourceEventId),
    );
  }

  function recoverNativeQuestionInput(
    sessionId: string,
    channelId: string,
    requestMessageId: string,
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    const owner = ports.ownership.resolve(sessionId);
    if (owner?.rootRole !== 'orchestrator') return undefined;
    const request = ports.channels.message(channelId, requestMessageId)?.userQuestionRequest;
    const callId = request?.callId;
    const holdsCard = (): boolean => {
      const card = ports.channels.message(channelId, requestMessageId);
      return (
        callId !== undefined &&
        card?.author.kind === 'bot' &&
        card.author.slug === owner.botSlug &&
        card.userQuestionRequest?.sessionId === sessionId &&
        card.userQuestionRequest.callId === callId
      );
    };
    if (!holdsCard()) {
      ports.warn?.('native-question-input-refused phase=recovery reason=question-card-unavailable');
      return undefined;
    }
    const row = ports.database.read((db) =>
      db
        .prepare(
          `
          SELECT e.source_event_id FROM source_events e
           WHERE e.message_id = ? AND e.bot_slug = ? AND e.source_kind = 'bot-message'
             AND ${channelSql('e')} = ?
        `,
        )
        .get(requestMessageId, owner.botSlug, channelId),
    ) as { source_event_id: string } | undefined;
    if (row === undefined || !ports.nativeQuestionAvailable(sessionId, channelId)) return undefined;
    return nativeQuestionInput(
      owner.botSlug,
      sessionId,
      channelId,
      row.source_event_id,
      [row.source_event_id],
      () => undefined,
      { kind: 'recovered-question', holdsCard },
    );
  }

  function nativeQuestionAvailable(sessionId: string, channelId: string): boolean {
    const owner = ports.ownership.resolve(sessionId);
    const bot = owner === undefined ? undefined : ports.registry.get(owner.botSlug);
    const channel = ports.channels.get(channelId);
    return (
      !ports.closed() &&
      bot !== undefined &&
      owner?.rootRole === 'orchestrator' &&
      ports.ownership.contentAvailable(sessionId) &&
      ports.sessionArchived(sessionId) !== true &&
      (channel?.type === 'group'
        ? channel.members.includes(owner.botSlug)
        : channel?.botSlug === owner.botSlug)
    );
  }

  function nativeQuestionInput(
    botSlug: string,
    sessionId: string,
    channelId: string,
    sourceEventId: string,
    sourceIds: readonly string[],
    markAttemptSideEffect: () => void,
    input: { kind: 'source-event' } | { kind: 'recovered-question'; holdsCard(): boolean } = {
      kind: 'source-event',
    },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    const owner = { botSlug };
    const held = (): boolean => {
      const channel = ports.channels.get(channelId);
      return channel?.type === 'group'
        ? channel.members.includes(owner.botSlug)
        : channel?.botSlug === owner.botSlug;
    };
    if (!held()) return undefined;
    return (deliver) => {
      let phase:
        | 'queue'
        | 'authority'
        | 'resume'
        | 'native-delivery'
        | 'continuation'
        | 'completed' = 'queue';
      const correlation = `bot=${botSlug.slice(0, 120)} session=${sessionId.slice(0, 120)} source=${sourceEventId.slice(0, 120)}`;
      const refused = (
        reason: 'owner-unavailable' | 'native-refused' | 'run-failed',
        kind?: string,
      ): void =>
        ports.warn?.(
          `native-question-input-refused phase=${phase} reason=${reason}${kind === undefined ? '' : ` kind=${kind}`} ${correlation}`,
        );
      let accept!: (value: boolean) => void;
      const accepted = new Promise<boolean>((resolve) => {
        accept = resolve;
      });
      const done = ports.enqueue(owner.botSlug, async () => {
        try {
          phase = 'authority';
          const bot = ports.registry.get(owner.botSlug);
          const current = ports.ownership.resolve(sessionId);
          if (
            ports.closed() ||
            bot === undefined ||
            bot.paused === true ||
            current?.rootRole !== 'orchestrator' ||
            current.botSlug !== owner.botSlug ||
            !ports.ownership.contentAvailable(sessionId) ||
            ports.sessionArchived(sessionId) === true ||
            !held() ||
            (input.kind === 'recovered-question' && !input.holdsCard())
          ) {
            refused('owner-unavailable');
            return;
          }
          ports.database.read((db) => {
            for (const id of sourceIds) requireSourceEffects(db, id, owner.botSlug);
          });
          phase = 'resume';
          await ports.runOrchestratorTurn(
            bot,
            { sessionId, resume: true },
            sourceEventId,
            channelId,
            '',
            [],
            false,
            markAttemptSideEffect,
            [],
            [],
            () => {
              phase = 'native-delivery';
              const currentBot = ports.registry.get(owner.botSlug);
              const currentOwner = ports.ownership.resolve(sessionId);
              if (
                ports.closed() ||
                currentBot === undefined ||
                currentBot.paused === true ||
                currentOwner?.rootRole !== 'orchestrator' ||
                currentOwner.botSlug !== owner.botSlug ||
                !ports.ownership.contentAvailable(sessionId) ||
                ports.sessionArchived(sessionId) === true ||
                !held() ||
                (input.kind === 'recovered-question' && !input.holdsCard())
              ) {
                refused('owner-unavailable');
                accept(false);
                return false;
              }
              ports.database.read((db) => {
                for (const id of sourceIds) requireSourceEffects(db, id, owner.botSlug);
              });
              const result = deliver();
              if (!result) refused('native-refused');
              else phase = 'continuation';
              accept(result);
              return result;
            },
            sourceIds,
            input.kind,
          );
          phase = 'completed';
        } finally {
          accept(false);
        }
      });
      void done.catch((error: unknown) => {
        accept(false);
        const kind =
          error instanceof MemoryAcceptError
            ? 'memory'
            : error instanceof TypeError
              ? 'type'
              : error instanceof RangeError
                ? 'range'
                : error instanceof SyntaxError
                  ? 'syntax'
                  : error instanceof Error
                    ? 'error'
                    : 'non-error';
        refused('run-failed', kind);
      });
      void done.then(
        () => accept(false),
        () => accept(false),
      );
      return accepted;
    };
  }

  return {
    askOrigin,
    canRequestPrivateInput,
    bindPrivateInputOrigin,
    bindNativeQuestionInput,
    recoverNativeQuestionInput,
    nativeQuestionAvailable,
  };
}
