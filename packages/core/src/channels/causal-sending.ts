import type { SessionTurnModelSwitch, TurnTarget } from '@botharness/host-protocol/turn-target';
import {
  assertQuoteTargets as assertChannelQuoteTargets,
  sameQuoteIntent,
  type ChannelQuote,
} from './quotes.js';
import type { TeamService } from '../team/service.js';
import { botOwner } from '../team/bot-access.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';
import { BotHopLimitReached } from './hop-limit.js';
import { SendReviewRequired, type GroupSendReview } from './send-review.js';
import { TobError, type TobService } from '../tob/service.js';
import { requireSourceEffects } from '../purge/fence.js';
import { createHash } from 'node:crypto';
import { isValidSlug } from '../bots/slug.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import {
  isBotDmChannel,
  type BotMessageCausation,
  type ChannelMention,
  type ChannelMessage,
  type ChannelMessagePerf,
  type ChannelRecord,
} from './channel.js';
import { ChannelReplyTargetError, type ChannelStore } from './store.js';
import type { MessagePerfTracker } from '../usage/message-perf.js';
import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { botMentionLabel, resolveBotMentionText } from './bot-mention-text.js';

interface CausalSendingPorts {
  readonly admitBotDmMessage: (channelId: string, messageId: string) => void;
  readonly admitGroupMessage: (channelId: string, messageId: string) => void;
  readonly botHopLimit: () => number;
  readonly botNetwork: import('../runtime/bot-network.js').BotNetworkPort | undefined;
  readonly channels: ChannelStore;
  readonly closed: () => boolean;
  readonly createMessageId: () => string;
  readonly database: OperationalDatabaseModulePort;
  readonly groupSendReview: GroupSendReview;
  readonly isMember: (botSlug: string, channel: ChannelRecord) => boolean;
  readonly messagePerf: MessagePerfTracker | undefined;
  readonly now: () => Date;
  readonly onTobDelegation: () => void;
  readonly ownership: SessionOwnership;
  readonly registry: PersonaBotRegistry;
  readonly requireMembership: (botSlug: string, channelId: string) => ChannelRecord;
  readonly stoppedTurns: ReadonlySet<string>;
  readonly team: TeamService | undefined;
  readonly tob: TobService | undefined;
  readonly turnSources: ReadonlyMap<string, { eventIds: ReadonlySet<string> }>;
  readonly warn: ((message: string) => void) | undefined;
}

export function createCausalSending(ports: CausalSendingPorts) {
  function requireSendReviewOwner(botSlug: string, sessionId: string): void {
    if (sessionId.startsWith('direct-')) return;
    const owner = ports.ownership?.resolve(sessionId);
    if (
      owner?.botSlug !== botSlug ||
      owner.rootRole !== 'orchestrator' ||
      !ports.ownership?.contentAvailable(sessionId)
    )
      throw new Error('Group sender Session ownership changed');
  }

  async function sendBotGroup(input: {
    reviewOwner?: string | undefined;
    observationId?: string | undefined;
    draftId?: string | undefined;
    freshnessOverride?: import('./send-review.js').FreshnessOverride | undefined;
    recover?: boolean | undefined;
    botSlug: string;
    channel: ChannelRecord;
    sourceEventId: string | undefined;
    replySourceEventId?: string;
    readSourceEventIds?: ReadonlySet<string>;
    sessionId: string;
    beforeSend: () => void;
    afterSend?: () => void;
    body: string;
    turnTargets?: TurnTarget[];
    turnModelSwitch?: SessionTurnModelSwitch;
    replyTo?: string | undefined;
    quotes?: ChannelQuote[] | undefined;
    attachments?: ChannelAttachmentRef[] | undefined;
    mentionBotIds?: string[] | undefined;
    mentionHumanIds?: string[] | undefined;
    deliveryKey?: string | undefined;
  }): Promise<ChannelMessage> {
    const { botSlug, channel } = input;
    if (channel.type !== 'group' || !ports.isMember(botSlug, channel))
      throw new Error('Bot Group sender must be a current member');
    const sender = ports.registry.get(botSlug);
    if (sender === undefined || sender.paused === true)
      throw new Error('Bot Group sender is no longer active');
    const explicitIds = input.mentionBotIds ?? [];
    if (explicitIds.length > 20 || explicitIds.some((id) => !isValidSlug(id)))
      throw new Error('Bot Group mentions require at most 20 valid Bot IDs');
    const typed = resolveBotMentionText(
      input.body,
      channel.members.flatMap((id) => {
        const bot = ports.registry.get(id);
        return bot
          ? [
              {
                botSlug: bot.slug,
                displayName: bot.displayName,
                eligible: bot.slug !== botSlug && bot.paused !== true,
              },
            ]
          : [];
      }),
    );
    const ids = [...new Set([...explicitIds, ...typed.botSlugs])];
    if (ids.length > 20) throw new Error('Bot Group mentions require at most 20 valid Bot IDs');
    const mentions: ChannelMention[] = [];
    let prefix = '';
    for (const id of ids) {
      const target = ports.registry.get(id);

      if (
        id === botSlug ||
        target === undefined ||
        target.paused === true ||
        !channel.members.includes(id)
      )
        throw new Error('Mentioned PersonaBot must be another active Group member');
      const label = botMentionLabel(target.displayName);
      const token = '@' + label;
      mentions.push({
        botSlug: id,
        label,
        start: prefix.length,
        end: prefix.length + token.length,
      });
      prefix += token + ' ';
    }
    const humanIds = input.mentionHumanIds === undefined ? [] : input.mentionHumanIds;
    if (
      !Array.isArray(humanIds) ||
      humanIds.length > 20 ||
      humanIds.some((id) => typeof id !== 'string' || !id.trim())
    )
      throw new Error('Human mentions require at most 20 valid Human IDs');
    const humanMembers = ports.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, channel.id);
    const humanMentions: NonNullable<ChannelMessage['humanMentions']> = [];
    for (const humanId of new Set(humanIds)) {
      const target = humanMembers.find((member) => member.humanId === humanId);
      if (target === undefined) throw new Error('Mentioned Human must be a current Group member');
      const label = target.displayName.replace(/\s+/gu, ' ').trim().slice(0, 80);
      const token = '@' + label;
      humanMentions.push({
        humanId,
        label,
        start: prefix.length,
        end: prefix.length + token.length,
      });
      prefix += token + ' ';
    }
    const body = prefix + typed.body;
    if (!body.trim() && !input.attachments?.length)
      throw new Error('Group message requires a body or attachment');
    ports.channels.assertAttachmentRefs(input.attachments ?? []);
    if (input.replyTo !== undefined && !ports.channels.hasMessage(channel.id, input.replyTo))
      throw new ChannelReplyTargetError();
    const messageId = deliveryMessageId(input.sessionId, input.deliveryKey);
    const message: ChannelMessage = {
      id: messageId,
      at: ports.now().toISOString(),
      author: { kind: 'bot', slug: botSlug },
      ...(input.turnTargets === undefined ? {} : { turnTargets: input.turnTargets }),
      ...(input.turnModelSwitch === undefined ? {} : { turnModelSwitch: input.turnModelSwitch }),
      body,
      botCausation: botCausation(
        input.replySourceEventId ??
          turnSourceIn(botSlug, channel.id, input.readSourceEventIds) ??
          input.sourceEventId,
      ),
      ...(mentions.length === 0 ? {} : { mentions }),
      ...(humanMentions.length === 0 ? {} : { humanMentions }),
      ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
      ...(input.quotes?.length ? { quotes: input.quotes } : {}),
      ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
      ...perf(input.sessionId, body),
    };
    if (mentions.length > 0) requireBotHop(message.botCausation!);
    input.beforeSend();
    if (ports.groupSendReview.enabled(channel.id) || input.draftId !== undefined)
      requireSendReviewOwner(botSlug, input.sessionId);
    if (input.sourceEventId !== undefined)
      ports.database.read((db) => requireSourceEffects(db, input.sourceEventId!, botSlug));
    if (
      input.reviewOwner !== undefined &&
      (ports.groupSendReview.enabled(channel.id) || input.draftId !== undefined)
    ) {
      const replayId = ports.groupSendReview.replay(
        input.reviewOwner,
        channel.id,
        input.draftId ?? message.id,
        message,
      );
      if (replayId !== undefined) {
        const committed = ports.channels.message(channel.id, replayId);
        if (!committed) throw new Error('Committed Group message is unavailable');
        input.afterSend?.();
        return committed;
      }
    }
    assertQuoteTargets(channel.id, messageId, input.quotes);
    let reviewOutcome: import('./send-review.js').SendReviewOutcome | undefined;
    const originId = input.sourceEventId ?? message.botCausation!.parentSourceEventId;
    const result = await ports.channels.appendMessageOnce(
      OWNER_HUMAN_CONTEXT,
      channel.id,
      message,
      undefined,
      {
        sessionId: input.sessionId,
        sourceEventId: originId,
      },
      (db) => {
        ports.requireMembership(botSlug, channel.id);
        const current = ports.registry.get(botSlug);
        if (ports.closed() || !current || current.paused || ports.stoppedTurns.has(botSlug))
          throw new Error('Bot Group sender is unavailable');
        if (
          !input.sessionId.startsWith('direct-') &&
          (ports.groupSendReview.enabled(channel.id) || input.draftId !== undefined)
        ) {
          requireSendReviewOwner(botSlug, input.sessionId);
        }
        ports.database.read((database) => requireSourceEffects(database, originId, botSlug));
        if (ports.groupSendReview.enabled(channel.id) || input.draftId !== undefined) {
          if (!db || !input.reviewOwner)
            throw new Error('Group send review requires the owning transaction');
          reviewOutcome = ports.groupSendReview.check(db, {
            owner: input.reviewOwner,
            channelId: channel.id,
            sourceEventId: originId,
            message,
            ...(input.observationId === undefined ? {} : { observationId: input.observationId }),
            ...(input.draftId === undefined ? {} : { draftId: input.draftId }),
            ...(input.freshnessOverride === undefined
              ? {}
              : { freshnessOverride: input.freshnessOverride }),
            ...(input.recover === undefined ? {} : { recover: input.recover }),
          });
          if (reviewOutcome) return false;
        }
        return true;
      },
    );
    if (reviewOutcome) {
      ports.warn?.(
        `group-send-review phase=${reviewOutcome.status} channel=${channel.id} draft=${reviewOutcome.draftId} reason=${reviewOutcome.reason}`,
      );
      throw new SendReviewRequired(reviewOutcome);
    }
    if (result.status === 'missing') throw new Error(`Group Channel disappeared: ${channel.id}`);
    if (result.status === 'conflict') throw new Error('Group delivery key has different content');
    input.afterSend?.();
    ports.admitGroupMessage(channel.id, result.message.id);
    return result.message;
  }

  function perf(sessionId: string, body: string): { perf?: ChannelMessagePerf } {
    const perf = ports.messagePerf?.forSession(sessionId, body);
    return perf === undefined ? {} : { perf };
  }

  function turnSourceIn(
    botSlug: string,
    channelId: string,
    read: Iterable<string> = [],
    turnSources: Iterable<string> = ports.turnSources.get(botSlug)?.eventIds ?? [],
  ): string | undefined {
    const sources = [...new Set([...turnSources, ...read])];
    if (sources.length === 0) return undefined;
    const row = ports.database.read(
      (database) =>
        database
          .prepare(
            `SELECT source_event_id FROM source_events
              WHERE channel_id = ? AND source_event_id IN (${sources.map(() => '?').join(', ')})
              ORDER BY rowid DESC LIMIT 1`,
          )
          .get(channelId, ...sources) as { source_event_id: string } | undefined,
    );
    return row?.source_event_id;
  }

  function requireBotHop(causation: BotMessageCausation): void {
    const limit = ports.botHopLimit();
    if (causation.hop > limit) throw new BotHopLimitReached(causation.hop, limit);
  }

  function botCausation(sourceEventId: string | undefined): BotMessageCausation {
    if (sourceEventId === undefined)
      throw new Error('Bot send has no trusted Source Event; read or reference its source first');
    const parent = ports.database.read((database) =>
      database
        .prepare(
          `
          SELECT channel_id, message_id,
                 json_extract(payload_json, '$.botCausation.rootSourceEventId') AS root_id,
                 json_extract(payload_json, '$.botCausation.hop') AS prior_hop
            FROM source_events WHERE source_event_id = ?
        `,
        )
        .get(sourceEventId),
    ) as
      | {
          channel_id: string | null;
          message_id: string | null;
          root_id: string | null;
          prior_hop: number | null;
        }
      | undefined;
    if (parent === undefined) throw new Error('Bot send has no trusted Source Event');
    const parentMessage =
      parent.channel_id !== null && parent.message_id !== null
        ? ports.channels.message(parent.channel_id, parent.message_id)
        : undefined;
    const prior = parentMessage?.botCausation;
    const inheritedRoot =
      prior?.rootSourceEventId ??
      (typeof parent.root_id === 'string' ? parent.root_id : sourceEventId);
    const inheritedHop =
      prior?.hop ??
      (typeof parent.prior_hop === 'number' &&
      Number.isInteger(parent.prior_hop) &&
      parent.prior_hop >= 0
        ? parent.prior_hop
        : 0);
    return {
      rootSourceEventId: inheritedRoot,
      parentSourceEventId: sourceEventId,
      hop: inheritedHop + 1,
    };
  }

  function assertQuoteTargets(
    channelId: string,
    messageId: string,
    quotes: readonly ChannelQuote[] | undefined,
  ): void {
    if (
      quotes?.length &&
      sameQuoteIntent(ports.channels.storedQuotes(channelId, messageId), quotes)
    )
      return;
    assertChannelQuoteTargets(quotes, (id) => ports.channels.message(channelId, id));
  }

  function deliveryMessageId(sessionId: string, deliveryKey?: string): string {
    return deliveryKey === undefined
      ? ports.createMessageId()
      : 'bot-' +
          createHash('sha256')
            .update(sessionId)
            .update(Uint8Array.of(0))
            .update(deliveryKey)
            .digest('hex');
  }

  async function sendNetworkBotDm(input: {
    botSlug: string;
    channel: ChannelRecord;
    sessionId: string;
    sourceEventId: string | undefined;
    body: string;
    turnTargets?: TurnTarget[];
    turnModelSwitch?: SessionTurnModelSwitch;
    beforeSend: () => void;
    deliveryKey?: string;
  }): Promise<{ channelId: string; message: ChannelMessage }> {
    const { channel, botSlug } = input;
    const peer = channel.remoteBot;
    const sender = ports.registry.get(botSlug);
    if (
      ports.botNetwork === undefined ||
      peer === undefined ||
      !ports.isMember(botSlug, channel) ||
      sender === undefined ||
      sender.paused === true
    )
      throw new Error('Remote Bot DM is unavailable');
    if (!input.body.trim()) throw new Error('Bot DM message requires a body');
    const causation = botCausation(input.sourceEventId);
    const message: ChannelMessage = {
      id: deliveryMessageId(input.sessionId, input.deliveryKey),
      at: ports.now().toISOString(),
      author: { kind: 'bot', slug: botSlug },
      ...(input.turnTargets === undefined ? {} : { turnTargets: input.turnTargets }),
      ...(input.turnModelSwitch === undefined ? {} : { turnModelSwitch: input.turnModelSwitch }),
      body: input.body,
      botCausation: causation,
    };
    const accepted = ports.channels.message(channel.id, message.id);
    if (accepted !== undefined) {
      if (
        accepted.author.kind !== 'bot' ||
        accepted.author.slug !== botSlug ||
        accepted.body !== message.body ||
        JSON.stringify(accepted.botCausation) !== JSON.stringify(causation)
      )
        throw new Error('Bot DM delivery key has different content');
      return { channelId: channel.id, message: accepted };
    }
    requireBotHop(causation);
    input.beforeSend();
    await ports.botNetwork.send(peer.hostId, {
      id: message.id,
      at: message.at,
      senderBotSlug: botSlug,
      recipientBotSlug: peer.botSlug,
      body: input.body,
      causation,
    });
    try {
      if (
        ports.channels.getOrCreateDm(
          humanContext(botOwner(ports.registry.get(botSlug)!)),
          botSlug,
          sender.displayName,
        ) === undefined
      )
        throw new Error('Sender Human DM is unavailable');
      const result = await ports.channels.appendMessageOnce(
        OWNER_HUMAN_CONTEXT,
        channel.id,
        message,
        undefined,
        {
          sessionId: input.sessionId,
          ...(input.sourceEventId === undefined ? {} : { sourceEventId: input.sourceEventId }),
        },
      );
      if (result.status === 'missing' || result.status === 'conflict')
        throw new Error(result.status);
      return { channelId: channel.id, message: result.message };
    } catch {
      throw new BotNetworkDeliveryError('delivery-unknown');
    }
  }

  async function sendBotDm(input: {
    botSlug: string;
    recipientBotSlug: string;
    channel: ChannelRecord;
    sourceEventId: string | undefined;
    replySourceEventId?: string;
    readSourceEventIds?: ReadonlySet<string>;
    sessionId: string;
    beforeSend: () => void;
    afterSend?: () => void;
    body: string;
    turnTargets?: TurnTarget[];
    turnModelSwitch?: SessionTurnModelSwitch;
    replyTo?: string | undefined;
    quotes?: ChannelQuote[] | undefined;
    attachments?: ChannelAttachmentRef[] | undefined;
    deliveryKey?: string | undefined;
  }): Promise<{ channelId: string; message: ChannelMessage }> {
    const { botSlug, recipientBotSlug, channel } = input;
    if (
      !isBotDmChannel(channel) ||
      !ports.isMember(botSlug, channel) ||
      !channel.members.includes(recipientBotSlug) ||
      recipientBotSlug === botSlug
    )
      throw new Error('Bot DM sender and recipient must be current members');
    const recipient = ports.registry.get(recipientBotSlug);
    if (recipient === undefined || recipient.paused === true)
      throw new Error('Bot DM recipient is no longer active');
    if (!input.body.trim() && !input.attachments?.length)
      throw new Error('Bot DM message requires a body or attachment');
    ports.channels.assertAttachmentRefs(input.attachments ?? []);
    if (input.replyTo !== undefined && !ports.channels.hasMessage(channel.id, input.replyTo))
      throw new ChannelReplyTargetError();
    const messageId = deliveryMessageId(input.sessionId, input.deliveryKey);
    assertQuoteTargets(channel.id, messageId, input.quotes);
    const sender = ports.registry.get(botSlug);
    if (ports.team) ports.team.bots.requireChannel(botSlug, channel, true);
    else if (sender && botOwner(sender) !== botOwner(recipient))
      throw new TobError('bot-not-found');
    if (sender === undefined || sender.paused === true)
      throw new Error('Bot DM sender is no longer active');
    if (
      ports.channels.getOrCreateDm(
        humanContext(botOwner(ports.registry.get(botSlug)!)),
        botSlug,
        sender.displayName,
      ) === undefined
    )
      throw new Error('Sender Human DM is unavailable');
    const causation = botCausation(
      input.replySourceEventId ??
        turnSourceIn(botSlug, channel.id, input.readSourceEventIds) ??
        input.sourceEventId,
    );
    requireBotHop(causation);
    const message: ChannelMessage = {
      id: messageId,
      at: ports.now().toISOString(),
      author: { kind: 'bot', slug: botSlug },
      ...(input.turnTargets === undefined ? {} : { turnTargets: input.turnTargets }),
      ...(input.turnModelSwitch === undefined ? {} : { turnModelSwitch: input.turnModelSwitch }),
      body: input.body,
      botCausation: causation,
      ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
      ...(input.quotes?.length ? { quotes: input.quotes } : {}),
      ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
      ...perf(input.sessionId, input.body),
    };
    input.beforeSend();
    const result = await ports.channels.appendMessageOnce(
      OWNER_HUMAN_CONTEXT,
      channel.id,
      message,
      undefined,
      {
        sessionId: input.sessionId,
        ...(input.sourceEventId === undefined ? {} : { sourceEventId: input.sourceEventId }),
      },
    );
    if (result.status === 'missing') throw new Error(`Bot DM disappeared: ${channel.id}`);
    if (result.status === 'conflict') throw new Error('Bot DM delivery key has different content');
    input.afterSend?.();
    ports.admitBotDmMessage(channel.id, result.message.id);
    if (result.status === 'appended' && ports.tob?.isTob(botSlug)) ports.onTobDelegation();
    return { channelId: channel.id, message: result.message };
  }

  return {
    requireSendReviewOwner,
    sendBotGroup,
    perf,
    turnSourceIn,
    requireBotHop,
    botCausation,
    assertQuoteTargets,
    deliveryMessageId,
    sendNetworkBotDm,
    sendBotDm,
  };
}
