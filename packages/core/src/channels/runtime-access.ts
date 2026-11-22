import type { ChannelAttachmentRef } from '../attachments/ref.js';
import type { OriginalAttachmentAccess } from '../attachments/original-access.js';
import type { AttachmentStore } from '../attachments/store.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { createChannelFileAccess } from '../features/channel-files/events.js';
import { createVoiceAccess } from '../features/voice/events.js';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../humans/context.js';
import { requireSourceEffects } from '../purge/fence.js';
import { BotNetworkDeliveryError } from '../runtime/bot-network.js';
import type {
  BotCreateInput,
  BotCreateOutcome,
  BotRuntime,
  BotRuntimeOptions,
} from '../runtime/bot-runtime.js';
import { boundModelPage, CHANNEL_READ_OUTPUT_LIMIT } from '../runtime/channel-model-read.js';
import { MAX_MIXED_GROUP_ATTEMPTS } from '../runtime/orchestrator-continuation.js';
import { requireNonBlank } from '../runtime/require-non-blank.js';
import { SESSION_DIRECT_MESSAGE_PREFIX } from '../runtime/session-direct-message.js';
import { sessionMentionText } from '../runtime/session-mentions.js';
import { readTurnModelSwitch, type TurnTargetSegment } from '../runtime/turn-targets.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import { botOwner } from '../team/bot-access.js';
import { TeamError } from '../team/error.js';
import type { TeamService } from '../team/service.js';
import { TobError, type TobService } from '../tob/service.js';
import { authorizedPathRoot } from '../workspaces/grant-native-tools.js';
import type { WorkspaceGrantStore } from '../workspaces/grants.js';
import type { createCausalSending } from './causal-sending.js';
import { isBotDmChannel, type ChannelMessage, type ChannelRecord } from './channel.js';
import { ChannelQuoteError } from './quotes.js';
import type {
  BotReactionInput,
  BotReactionResult,
  ChannelMessageView,
  OrchestratorChannelAccess,
} from './runtime-access-types.js';
import { createChannelReads } from './runtime-reads.js';
import {
  GroupReplySourceRevoked,
  SendReviewRequired,
  type GroupSendReview,
} from './send-review.js';
import { ChannelReplyTargetError, type ChannelStore } from './store.js';

interface ChannelAccessPorts {
  admitGroupInvitation: BotRuntime['admitGroupInvitation'];
  admitGroupJoinDecision: NonNullable<BotRuntime['admitGroupJoinDecision']>;
  admitGroupJoinRequest: NonNullable<BotRuntime['admitGroupJoinRequest']>;
  attachments: AttachmentStore | undefined;
  botContacts: NonNullable<BotRuntime['botContacts']>;
  callFrames: BotRuntimeOptions['callFrames'];
  causalSending: ReturnType<typeof createCausalSending>;
  channels: ChannelStore;
  closed: () => boolean;
  createBot: (
    botSlug: string,
    sourceEventId: string | undefined,
    beforeSend: () => void,
    input: BotCreateInput,
  ) => BotCreateOutcome;
  createMessageId: () => string;
  database: OperationalDatabaseModulePort;
  grants: WorkspaceGrantStore | undefined;
  groupSendReview: GroupSendReview;
  ignoreAdmission: (
    botSlug: string,
    sessionId: string,
    channelId: string,
    messageId: string,
  ) => ReturnType<OrchestratorChannelAccess['ignore']>;
  isMember: (botSlug: string, channel: ChannelRecord) => boolean;
  now: () => Date;
  observeReadMessages: (
    botSlug: string,
    views: ChannelMessageView[],
    readAdmissions: Set<string>,
  ) => void;
  originalAttachments: OriginalAttachmentAccess;
  ownership: SessionOwnership;
  refreshBotContacts: NonNullable<BotRuntime['refreshBotContacts']>;
  registry: PersonaBotRegistry;
  requireMembership: (botSlug: string, channelId: string) => ChannelRecord;
  requireTurnAccess: (botSlug: string, ids: Iterable<string>) => void;
  team: TeamService | undefined;
  tob: TobService | undefined;
  turnSources: ReadonlyMap<
    string,
    {
      sessionId: string;
      inboundChannelId: string | undefined;
      steeredChannelIds: ReadonlySet<string>;
    }
  >;
  voiceMessages: BotRuntimeOptions['voiceMessages'];
}

export function createChannelAccess(ports: ChannelAccessPorts) {
  function react(
    botSlug: string,
    channel: ChannelRecord,
    input: BotReactionInput,
  ): BotReactionResult {
    const bot = ports.registry.get(botSlug);
    if (ports.closed() || bot === undefined || bot.paused === true)
      throw new Error('channel_action: Bot is unavailable');
    if (ports.channels.setBotReaction === undefined)
      throw new Error('channel_action: reactions are unavailable');
    const reactions = ports.channels.setBotReaction(
      channel.id,
      botSlug,
      input.messageId,
      input.emoji,
      input.active,
    );
    if (reactions === undefined)
      throw new Error(
        `channel_action: message ${input.messageId} cannot take this reaction in Channel ${channel.id}`,
      );
    return { channelId: channel.id, messageId: input.messageId, reactions };
  }

  function channelAccess(
    botSlug: string,
    defaultChannelId: string | undefined,
    sourceEventId: string | undefined,
    sessionId: string,
    beforeSend: () => void,
    readAdmissions: Set<string>,
    onImport?: (ref: ChannelAttachmentRef) => void,
    observeReads = true,
    modelContent?: string,
    replyTargets?: () => readonly TurnTargetSegment[],
  ): OrchestratorChannelAccess {
    const actorHuman = humanContext(botOwner(ports.registry.get(botSlug)!));
    const reviewOwner = sessionId.startsWith('direct-')
      ? `direct:${botSlug}`
      : `${botSlug}:${sessionId}`;
    const turnAttribution = () => {
      const segments = replyTargets?.().slice(-MAX_MIXED_GROUP_ATTEMPTS);
      const last = segments?.at(-1);
      const turnModelSwitch =
        last === undefined ? undefined : readTurnModelSwitch(ports.database, sessionId, last);
      return {
        ...(segments?.length ? { turnTargets: segments.map((segment) => segment.target) } : {}),
        ...(turnModelSwitch === undefined ? {} : { turnModelSwitch }),
      };
    };
    const observations = new Map<string, string>();
    const exhaustedDrops = new Map<string, string>();
    const recordObservation = (views: ChannelMessageView[]): void => {
      for (const id of new Set(views.map((view) => view.channelId))) {
        if (!ports.groupSendReview.enabled(id)) continue;
        observations.set(
          id,
          ports.groupSendReview.observe(
            reviewOwner,
            id,
            views.filter((view) => view.channelId === id).map((view) => view.message),
            observations.get(id),
          ),
        );
      }
    };
    const initial = ports.database.read((db) =>
      db
        .prepare('SELECT channel_id, message_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId ?? null),
    );
    if (initial?.channel_id && initial.message_id && !sessionId.startsWith('direct-')) {
      const id = String(initial.channel_id);
      const message = ports.channels.message(id, String(initial.message_id));
      if (
        message &&
        message.body.length > 0 &&
        modelContent?.includes(sessionMentionText(message.body, message.mentions ?? [])) &&
        ports.groupSendReview.enabled(id)
      )
        observations.set(id, ports.groupSendReview.observe(reviewOwner, id, [message]));
    }
    const initialObservations = new Map(observations);
    const reviewSourceChannelId =
      initial?.channel_id && ports.groupSendReview.enabled(String(initial.channel_id))
        ? String(initial.channel_id)
        : undefined;
    const requireReplySource = () => {
      if (reviewSourceChannelId === undefined) return;
      const source = ports.channels.get(reviewSourceChannelId);
      if (!source || !ports.isMember(botSlug, source))
        throw new GroupReplySourceRevoked(reviewSourceChannelId);
    };
    const authorize = beforeSend;
    beforeSend = () => {
      ports.requireTurnAccess(botSlug, sourceEventId ? [sourceEventId] : []);
      requireReplySource();
      if (sourceEventId !== undefined)
        ports.database.read((db) => requireSourceEffects(db, sourceEventId, botSlug));
      authorize();
    };
    const requireOrdinaryGroupActor = () => {
      if (ports.tob?.isTob(botSlug)) throw new TobError('tob-cli-required');
    };
    const resolve = (requested?: string): ChannelRecord => {
      const id = requested ?? defaultChannelId;
      if (id === undefined)
        throw new Error(
          'No inbound local Channel; select an explicit joined Channel or use bot_send_message with source_event_id for an external source',
        );
      const channel = ports.channels.get(id);
      if (ports.team && channel) {
        ports.team.bots.requireChannel(botSlug, channel);
        return channel;
      }
      return ports.requireMembership(botSlug, id);
    };
    const { viewOf, list, read, query, readModel } = createChannelReads(
      ports,
      botSlug,
      actorHuman,
      resolve,
      observeReads,
      readAdmissions,
      observations,
      recordObservation,
    );
    const replySource = (id: string) => {
      const source = ports.database.read((db) => {
        requireSourceEffects(db, id, botSlug);
        return db
          .prepare(
            `SELECT e.channel_id, e.message_id FROM source_events e
            JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
            WHERE e.source_event_id = ? AND a.bot_slug = ?
              AND (
                e.source_kind IN ('human-message', 'bot-message')
                OR (
                  e.source_kind = 'system-message'
                  AND json_extract(e.payload_json, '$.takeoverResolution') IS NOT NULL
                )
              )`,
          )
          .get(id, botSlug);
      });
      if (typeof source?.channel_id !== 'string' || typeof source.message_id !== 'string')
        throw new Error('Trusted local reply source is unavailable');
      const channel = resolve(source.channel_id);
      if (
        (channel.type === 'dm' && !isBotDmChannel(channel) && channel.botSlug !== botSlug) ||
        (!ports.channels.hasMessage(channel.id, source.message_id) &&
          !source.message_id.startsWith(SESSION_DIRECT_MESSAGE_PREFIX))
      )
        throw new Error('Trusted local reply source is unavailable');
      return { channelId: channel.id, messageId: source.message_id };
    };
    return {
      replySource,
      list,
      startHumanDm: (humanId) => {
        if (!ports.team) throw new TeamError('unavailable');
        ports.team.bots.requireProactive(botSlug, humanId);
        return ports.team.bots.dm(humanContext(humanId), botSlug)!;
      },
      contacts: async (input) => {
        const actor = ports.registry.get(botSlug);
        if (actor && botOwner(actor) === 'local-human') await ports.refreshBotContacts();
        return ports.botContacts(botSlug, input);
      },
      createGroup: (name) => {
        requireOrdinaryGroupActor();
        const sender = ports.registry.get(botSlug);
        if (sender === undefined || sender.paused === true)
          throw new Error('Bot Group creator is no longer active');
        ports.team?.roles.require(actorHuman, 'channels.create');
        const clean = requireNonBlank(name, 'Group name').slice(0, 120);
        beforeSend();
        return ports.channels.createGroup(humanContext(botOwner(sender)), {
          name: clean,
          members: [botSlug],
          ownerBotSlug: botSlug,
        });
      },
      inviteGroup: (input) => {
        requireOrdinaryGroupActor();
        const channel = ports.channels.get(input.channelId);
        const target = ports.registry.get(input.targetBotSlug);
        if (ports.team)
          ports.team.bots.recordAdder(actorHuman, input.targetBotSlug, input.channelId);
        else if (
          (!target && botOwner(ports.registry.get(botSlug)!) !== 'local-human') ||
          (target && botOwner(target) !== botOwner(ports.registry.get(botSlug)!))
        )
          throw new TobError('bot-not-found');
        if (ports.tob?.isTob(input.targetBotSlug)) throw new TobError('protected-bot');
        if (
          channel?.type !== 'group' ||
          channel.ownerBotSlug !== botSlug ||
          !ports.isMember(botSlug, channel)
        )
          throw new Error('Only the Bot Group owner may invite');
        if (target === undefined || target.paused === true || target.slug === botSlug)
          throw new Error('Invitee must be another active nonmember PersonaBot');
        const botCausation = ports.causalSending.botCausation(sourceEventId);
        ports.causalSending.requireBotHop(botCausation);
        const dm = ports.channels.getOrCreateDm(
          humanContext(botOwner(ports.registry.get(target.slug)!)),
          target.slug,
          target.displayName,
        );
        if (dm === undefined) throw new Error('Invitee DM is unavailable');
        beforeSend();
        const invitation = ports.channels.inviteGroupBot({
          channelId: channel.id,
          inviterBotSlug: botSlug,
          targetBotSlug: target.slug,
          targetBotCreatedAt: target.createdAt,
          targetDmChannelId: dm.id,
          botCausation,
        });
        ports.admitGroupInvitation(dm.id, invitation.id);
        return invitation;
      },
      requestGroupJoin: (input) => {
        requireOrdinaryGroupActor();
        const target = ports.channels.get(input.channelId);
        const requester = ports.registry.get(botSlug);
        const source = ports.database.read((database) =>
          database
            .prepare(
              'SELECT channel_id, message_id, source_kind FROM source_events WHERE source_event_id = ?',
            )
            .get(sourceEventId ?? null),
        ) as
          | {
              channel_id: string | null;
              message_id: string | null;
              source_kind: string;
            }
          | undefined;
        const sourceChannel =
          source?.channel_id == null ? undefined : ports.channels.get(source.channel_id);
        const selected =
          source?.source_kind === 'human-message' &&
          source.channel_id !== null &&
          sourceChannel?.type === 'dm' &&
          sourceChannel.botSlug === botSlug &&
          source.message_id !== null
            ? ports.channels.message(source.channel_id, source.message_id)?.channelRefs
            : undefined;
        if (
          requester === undefined ||
          requester.paused === true ||
          target?.type !== 'group' ||
          target.members.includes(botSlug) ||
          !selected?.some((ref) => ref.channelId === input.channelId)
        )
          throw new Error('group_join_request requires a selected #Group in this Human DM turn');
        if (
          botOwner(requester) !== 'local-human' &&
          !ports.channels
            .listHumanMembers(actorHuman, target.id)
            .some((member) => member.humanId === actorHuman.humanId)
        )
          throw new TobError('channel-not-found');
        const owner =
          target.ownerBotSlug === undefined ? undefined : ports.registry.get(target.ownerBotSlug);
        const botCausation = ports.causalSending.botCausation(sourceEventId);
        ports.causalSending.requireBotHop(botCausation);
        beforeSend();
        const ownerDm =
          owner === undefined || botOwner(owner) !== botOwner(requester)
            ? undefined
            : ports.channels.getOrCreateDm(
                humanContext(botOwner(ports.registry.get(owner.slug)!)),
                owner.slug,
                owner.displayName,
              );
        const request = ports.channels.requestGroupJoin({
          channelId: target.id,
          requesterBotSlug: botSlug,
          requesterBotCreatedAt: requester.createdAt,
          ...(ownerDm === undefined ? {} : { ownerDmChannelId: ownerDm.id }),
          botCausation,
        });
        if (ownerDm !== undefined) ports.admitGroupJoinRequest(ownerDm.id, request.id);
        return request;
      },
      decideGroupJoin: (input) => {
        requireOrdinaryGroupActor();
        const target = ports.channels.get(input.channelId);
        const request = target?.joinRequests?.find((item) => item.id === input.requestId);
        const requester =
          request === undefined ? undefined : ports.registry.get(request.requesterBotSlug);
        if (requester && botOwner(requester) !== botOwner(ports.registry.get(botSlug)!))
          throw new TobError('bot-not-found');
        if (request !== undefined && ports.tob?.isTob(request.requesterBotSlug))
          throw new TobError('protected-bot');
        if (
          target?.type !== 'group' ||
          target.ownerBotSlug !== botSlug ||
          !target.members.includes(botSlug) ||
          request === undefined ||
          requester === undefined ||
          requester.paused === true ||
          requester.createdAt !== request.requesterBotCreatedAt
        )
          throw new Error('Only the current Bot Group owner can decide this join request');
        const botCausation = ports.causalSending.botCausation(sourceEventId);
        ports.causalSending.requireBotHop(botCausation);
        beforeSend();
        const dm = ports.channels.getOrCreateDm(
          humanContext(botOwner(ports.registry.get(requester.slug)!)),
          requester.slug,
          requester.displayName,
        );
        if (dm === undefined) throw new Error('Requester DM is unavailable');
        const decided = ports.channels.decideGroupJoin({
          channelId: target.id,
          requestId: request.id,
          accept: input.accept,
          decidedBy: botSlug,
          requesterBotCreatedAt: requester.createdAt,
          requesterDmChannelId: dm.id,
          botCausation,
        });
        if (decided.notified) ports.admitGroupJoinDecision(dm.id, request.id);
        return { channel: decided.channel, request: decided.request };
      },
      respondToGroupInvite: (input) => {
        requireOrdinaryGroupActor();
        const target = ports.registry.get(botSlug);
        if (target === undefined || target.paused === true)
          throw new Error('Archived PersonaBot cannot answer a Group invitation');
        beforeSend();
        return ports.channels.respondToGroupInvite({
          invitationId: input.invitationId,
          targetBotSlug: botSlug,
          targetBotCreatedAt: target.createdAt,
          accept: input.accept,
        });
      },
      renameGroup: (input) => {
        requireOrdinaryGroupActor();
        const channel = ports.channels.get(input.channelId);
        if (
          channel?.type !== 'group' ||
          channel.ownerBotSlug !== botSlug ||
          !channel.members.includes(botSlug)
        )
          throw new Error('Only the Bot Group owner may rename');
        const name = requireNonBlank(input.name, 'Group name').slice(0, 120);
        beforeSend();
        const renamed = ports.channels.rename(OWNER_HUMAN_CONTEXT, channel.id, name);
        if (renamed === undefined) throw new Error('Group rename did not return a Channel');
        return renamed;
      },
      removeGroupMember: (input) => {
        requireOrdinaryGroupActor();
        const channel = ports.channels.get(input.channelId);
        if (
          channel?.type !== 'group' ||
          channel.ownerBotSlug !== botSlug ||
          !channel.members.includes(botSlug) ||
          input.botSlug === botSlug
        )
          throw new Error('Only the Bot Group owner may remove another member');
        beforeSend();
        return ports.channels.removeGroupMember(channel.id, input.botSlug);
      },
      readGroupWakePolicy: (channelId) => {
        const channel = resolve(channelId);
        if (channel.type !== 'group') throw new Error('Group Channel is required');
        return ports.channels.getGroupWakePolicy(channel.id, botSlug);
      },
      setGroupWakePolicy: (input) => {
        const bot = ports.registry.get(botSlug);
        if (bot === undefined || bot.paused === true)
          throw new Error('PersonaBot is no longer active');
        const channel = resolve(input.channelId);
        if (channel.type !== 'group') throw new Error('Group Channel is required');
        ports.channels.setGroupWakePolicy(
          channel.id,
          botSlug,
          {
            mode: input.mode,
            count: input.count,
            intervalSeconds: input.intervalSeconds,
          },
          { kind: 'bot', botSlug },
        );
        return ports.channels.getGroupWakePolicy(channel.id, botSlug);
      },
      react: (input) => {
        const channel = resolve(input.channelId);
        ports.team?.bots.requireChannel(botSlug, channel, true);
        return react(botSlug, channel, input);
      },
      ...createVoiceAccess({
        botSlug,
        channels: ports.channels,
        resolve,
        voiceMessages: ports.voiceMessages,
        callFrames: ports.callFrames,
      }),
      leaveGroup: (input) => {
        requireOrdinaryGroupActor();
        const channel = ports.channels.get(input.channelId);
        if (channel === undefined) throw new Error('group_leave: channel-unavailable');
        if (channel.type !== 'group') throw new Error('group_leave: group-required');
        if (!channel.members.includes(botSlug)) return { channelId: input.channelId, left: false };
        beforeSend();
        ports.channels.removeGroupMember(channel.id, botSlug, 'left');
        return { channelId: channel.id, left: true };
      },
      createBot: (input) => ports.createBot(botSlug, sourceEventId, beforeSend, input),
      sendToBot: async (input) => {
        if (input.botSlug.startsWith('remote:')) {
          if (input.replyTo !== undefined)
            throw new Error('Remote Bot DMs currently support text without quoted replies');
          let contact = ports.botContacts(botSlug, { botId: input.botSlug }).contacts[0];
          if (contact === undefined) {
            await ports.refreshBotContacts();
            contact = ports.botContacts(botSlug, { botId: input.botSlug }).contacts[0];
          }
          if (contact?.hostId === undefined || contact.botSlug === undefined)
            throw new BotNetworkDeliveryError('unable-to-deliver');
          const channel = ports.channels.getOrCreateRemoteBotDm(botSlug, {
            hostId: contact.hostId,
            botSlug: contact.botSlug,
            displayName: contact.displayName,
          });
          return ports.causalSending.sendNetworkBotDm({
            botSlug,
            channel,
            sessionId,
            sourceEventId,
            body: input.body,
            beforeSend,
            ...(input.deliveryKey === undefined ? {} : { deliveryKey: input.deliveryKey }),
          });
        }
        const sender = ports.registry.get(botSlug);
        const target = ports.registry.get(input.botSlug);
        if (ports.team) ports.team.bots.requireBotTarget(botSlug, input.botSlug);
        else if (
          sender &&
          ((!target && botOwner(sender) !== 'local-human') ||
            (target && botOwner(sender) !== botOwner(target)))
        )
          throw new TobError('bot-not-found');
        if (
          sender === undefined ||
          sender.paused === true ||
          target === undefined ||
          target.paused === true ||
          target.slug === botSlug
        )
          throw new Error('Bot DM recipient must be another active PersonaBot');
        if (!input.body.trim()) throw new Error('Bot DM message requires a body');
        const dm = ports.channels.getOrCreateBotDm(
          OWNER_HUMAN_CONTEXT,
          botSlug,
          target.slug,
          `${sender.displayName} · ${target.displayName}`,
        );
        if (dm === undefined) throw new Error('Bot DM is unavailable');
        const sent = await ports.causalSending.sendBotDm({
          botSlug,
          recipientBotSlug: target.slug,
          channel: dm,
          sourceEventId,
          readSourceEventIds: readAdmissions,
          sessionId,
          beforeSend: input.deliveryKey === undefined ? beforeSend : () => undefined,
          ...(input.deliveryKey === undefined ? {} : { afterSend: beforeSend }),
          body: input.body,
          replyTo: input.replyTo,
          deliveryKey: input.deliveryKey,
          ...turnAttribution(),
        });
        return sent;
      },
      ignore: ({ channelId, messageId }) => {
        const channel = resolve(channelId);
        if (ports.channels.message(channel.id, messageId) === undefined)
          throw new Error('inbox_ignore: message is unavailable in this Channel');
        return ports.ignoreAdmission(botSlug, sessionId, channel.id, messageId);
      },
      read,
      query,
      readModel,
      ...createChannelFileAccess({
        botSlug,
        sessionId,
        defaultChannelId,
        channels: ports.channels,
        attachments: ports.attachments,
        grants: ports.grants,
        ownership: ports.ownership,
        registry: ports.registry,
        originalAttachments: ports.originalAttachments,
        isClosed: () => ports.closed(),
        authorizedPathRoot,
        resolve,
        beforeSend,
        onImport,
      }),
      requestGrant: async (reason, channelId) => {
        const channel = resolve(channelId);
        if (
          channel.type === 'group'
            ? !channel.members.includes(botSlug)
            : channel.botSlug !== botSlug
        ) {
          throw new Error(
            'Workspace Grant requests must be sent in a Group this PersonaBot belongs to or in its Human DM',
          );
        }
        const body = requireNonBlank(reason, 'Workspace Grant request reason');
        beforeSend();
        const message: ChannelMessage = {
          id: ports.createMessageId(),
          at: ports.now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
          grantRequest: true,
          grantRequestOwner: ports.registry.get(botSlug)!.createdAt,
        };
        const appended = await ports.channels.appendMessage(
          OWNER_HUMAN_CONTEXT,
          channel.id,
          message,
          {
            sessionId,
            ...(sourceEventId === undefined ? {} : { sourceEventId }),
          },
        );
        if (appended === undefined) throw new Error(`Channel disappeared: ${channel.id}`);
        return appended;
      },
      linkSessions: (input) => {
        if (ports.channels.addMessageSessionLinks === undefined)
          throw new Error('Session links are unavailable');
        const channel = ports.channels
          .list()
          .find(
            (candidate) =>
              candidate.type === 'dm' &&
              candidate.botSlug === botSlug &&
              !isBotDmChannel(candidate) &&
              ports.channels.message(candidate.id, input.messageId)?.author.kind === 'bot',
          );
        const message =
          channel === undefined ? undefined : ports.channels.message(channel.id, input.messageId);
        if (
          channel === undefined ||
          message === undefined ||
          message.author.kind !== 'bot' ||
          message.author.slug !== botSlug
        )
          throw new Error(`Message ${input.messageId} is not one of your messages in a Human DM`);
        const linked = ports.channels.addMessageSessionLinks(
          channel.id,
          message.id,
          input.links.map(({ sessionId, kind, title, createdAt }) => ({
            sessionId,
            title,
            kind:
              kind === 'sent' &&
              createdAt !== undefined &&
              Date.parse(createdAt) >= Date.parse(message.at)
                ? 'created'
                : kind,
          })),
        );
        if (linked === undefined) throw new Error(`Message ${input.messageId} disappeared`);
        return linked;
      },
      inspectDrafts: (input) => {
        const channel = ports.channels.get(input.channelId);
        const bot = ports.registry.get(botSlug);
        if (
          !channel ||
          channel.type !== 'group' ||
          !ports.isMember(botSlug, channel) ||
          !bot ||
          bot.paused ||
          ports.closed()
        )
          return {
            status: 'refused',
            channelId: input.channelId,
            draftId: input.draftId ?? '',
            reason: 'draft-access-unavailable',
          };
        requireReplySource();
        ports.causalSending.requireSendReviewOwner(botSlug, sessionId);
        return ports.groupSendReview.inspectRecords(reviewOwner, channel.id, input.draftId);
      },
      dropDraft: (input) => {
        resolve(input.channelId);
        const result = ports.groupSendReview.drop(
          reviewOwner,
          input.channelId,
          input.draftId,
          input.yieldToMessageIds === undefined
            ? undefined
            : {
                observationId: input.observationId ?? '',
                messageIds: input.yieldToMessageIds,
              },
        );
        if (result.status === 'dropped' && result.budget?.exhausted)
          exhaustedDrops.set(input.channelId, input.draftId);
        return result;
      },
      send: async (input) => {
        const attribution = turnAttribution();
        if (input.replySourceEventId !== undefined) {
          const reply = replySource(input.replySourceEventId);
          if (
            input.channelId !== reply.channelId ||
            input.replyTo !==
              (reply.messageId.startsWith(SESSION_DIRECT_MESSAGE_PREFIX)
                ? undefined
                : reply.messageId)
          )
            throw new Error('Reply destination does not match the trusted source');
        }
        requireReplySource();
        const steered = ports.turnSources.get(botSlug);
        const turnChannelIds =
          steered?.sessionId === sessionId && steered.steeredChannelIds.size > 0
            ? [
                ...(steered.inboundChannelId === undefined ? [] : [steered.inboundChannelId]),
                ...steered.steeredChannelIds,
              ]
            : [];
        const repliedChannelIds =
          input.channelId === undefined && input.replyTo !== undefined
            ? turnChannelIds.filter(
                (id) => ports.channels.message(id, input.replyTo!) !== undefined,
              )
            : [];
        if (input.channelId === undefined && repliedChannelIds.length === 1)
          input = { ...input, channelId: repliedChannelIds[0]! };
        if (input.channelId === undefined && turnChannelIds.length > 0)
          throw new Error(
            `This turn carries messages from several Channels: ${turnChannelIds
              .map((id) => {
                const candidate = ports.channels.get(id);
                const kind =
                  candidate === undefined
                    ? 'Channel'
                    : candidate.type === 'group'
                      ? `Group ${JSON.stringify(candidate.name)}`
                      : isBotDmChannel(candidate)
                        ? 'Bot DM'
                        : 'Human DM';
                return `${kind} (channel_id ${JSON.stringify(id)})`;
              })
              .join(
                '; ',
              )}. Call bot_send_message with the trusted source_event_id you are answering, or an explicit channel_id for a proactive message.`,
          );
        const channel = resolve(input.channelId);
        ports.team?.bots.requireChannel(botSlug, channel, true);
        if (ports.team && channel.botSlug === botSlug) {
          const source = ports.database.read((db) =>
            db
              .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
              .get(
                input.replySourceEventId ??
                  (steered?.sessionId === sessionId
                    ? ports.causalSending.turnSourceIn(botSlug, channel.id, readAdmissions)
                    : undefined) ??
                  (sessionId.startsWith('direct-') ? undefined : sourceEventId) ??
                  null,
              ),
          );
          if (source?.['channel_id'] !== channel.id)
            ports.team.bots.requireProactive(
              botSlug,
              channel.dmHumanId ?? botOwner(ports.registry.get(botSlug)!),
            );
        }
        const exhaustedDraftId = exhaustedDrops.get(channel.id);
        if (input.genui !== undefined && (channel.type !== 'dm' || channel.botSlug !== botSlug))
          throw new Error('GenUI reports require the Bot Human DM');
        if (
          input.sessionLinks !== undefined &&
          (channel.type !== 'dm' || channel.botSlug !== botSlug)
        )
          throw new Error('Session links require the Bot Human DM');
        if (exhaustedDraftId)
          throw new SendReviewRequired({
            status: 'requires-review',
            channelId: channel.id,
            draftId: exhaustedDraftId,
            reason: 'dropped-exhausted-draft-defer-turn',
            choices: ['snooze-inbox'],
          });
        if (input.freshnessOverride && channel.type !== 'group')
          throw new Error('Freshness override requires the original Group draft');
        if (input.mentionBotIds?.length && channel.type !== 'group')
          throw new Error('Bot mentions require a Group Channel');
        if (input.mentionHumanIds?.length && channel.type !== 'group')
          throw new Error('Human mentions require a Group Channel');
        if (isBotDmChannel(channel)) {
          if (channel.remoteBot !== undefined) {
            if (input.quotes?.length)
              throw new ChannelQuoteError(
                'unsupported-quotes',
                'Quotes are not supported in remote Bot DMs',
              );
            if (
              input.attachments?.length ||
              (input.replyTo !== undefined && input.replySourceEventId === undefined)
            )
              throw new Error('Remote Bot DMs currently support text without quoted replies');
            return (
              await ports.causalSending.sendNetworkBotDm({
                botSlug,
                channel,
                sessionId,
                sourceEventId:
                  input.replySourceEventId ??
                  ports.causalSending.turnSourceIn(botSlug, channel.id, readAdmissions) ??
                  sourceEventId,
                body: input.body,
                beforeSend,
                ...attribution,
                ...(input.deliveryKey === undefined ? {} : { deliveryKey: input.deliveryKey }),
              })
            ).message;
          }
          const recipientBotSlug = channel.members.find((slug) => slug !== botSlug);
          if (recipientBotSlug === undefined) throw new Error('Bot DM has no recipient');
          const sent = await ports.causalSending.sendBotDm({
            botSlug,
            recipientBotSlug,
            channel,
            sourceEventId: input.replySourceEventId ?? sourceEventId,
            ...(input.replySourceEventId === undefined
              ? {}
              : { replySourceEventId: input.replySourceEventId }),
            readSourceEventIds: readAdmissions,
            sessionId,
            beforeSend: input.deliveryKey === undefined ? beforeSend : () => undefined,
            ...(input.deliveryKey === undefined ? {} : { afterSend: beforeSend }),
            body: input.body,
            ...attribution,
            replyTo: input.replyTo,
            quotes: input.quotes,
            attachments: input.attachments,
            deliveryKey: input.deliveryKey,
          });
          return sent.message;
        }
        if (channel.type === 'group') {
          const sent = await ports.causalSending
            .sendBotGroup({
              reviewOwner,
              observationId: input.observationId ?? initialObservations.get(channel.id),
              draftId: input.draftId,
              freshnessOverride: input.freshnessOverride,
              recover: input.recover,
              botSlug,
              channel,
              sourceEventId: input.replySourceEventId ?? sourceEventId,
              ...(input.replySourceEventId === undefined
                ? {}
                : { replySourceEventId: input.replySourceEventId }),
              readSourceEventIds: readAdmissions,
              sessionId,
              beforeSend: input.deliveryKey === undefined ? beforeSend : () => undefined,
              ...(input.deliveryKey === undefined ? {} : { afterSend: beforeSend }),
              body: input.body,
              ...attribution,
              replyTo: input.replyTo,
              quotes: input.quotes,
              attachments: input.attachments,
              mentionBotIds: input.mentionBotIds,
              mentionHumanIds: input.mentionHumanIds,
              deliveryKey: input.deliveryKey,
            })
            .catch((error: unknown) => {
              if (
                !(error instanceof SendReviewRequired) ||
                (error.outcome.status !== 'held' && error.outcome.status !== 'requires-review')
              )
                throw error;
              const changed = error.outcome.changedMessageIds;
              if (!changed?.length) throw error;
              const current = resolve(channel.id);
              const views = changed.flatMap((id) => {
                const message = ports.channels.message(current.id, id);
                return message === undefined ? [] : [viewOf(current, message)];
              });
              const bounded = boundModelPage(
                { messages: views },
                () => undefined,
                () => 2_000,
              );
              if (!bounded.included.length) throw error;
              const review = {
                observationId: 'x'.repeat(36),
                content: bounded.output,
                complete: bounded.included.length === error.outcome.changedMessageCount,
                observedMessageIds: bounded.included.map((view) => view.message.id),
                peerMessageIds: bounded.included
                  .filter(
                    ({ message }) =>
                      message.author.kind === 'bot' &&
                      message.author.slug !== botSlug &&
                      !message.sessionFailure &&
                      !!message.body.trim(),
                  )
                  .map(({ message }) => message.id),
                responsibility:
                  'These messages join this turn. Internally compare committed peer replies with your remaining responsibility; do not include this protocol or task-ownership explanation in the Channel reply. If they fully answer it, drop silently with yield_to_message_ids and observation_id; no agreement message is needed. Otherwise send the missing fact, independent evidence or requested second opinion. A new Human question is separate work even with the same words. Peer IDs identify observed messages, not proof of semantic completion. Explicitly resolve_inbox_ids only for work you judge complete after send/drop. Held/refused never resolve work. Unrelated FYI needs no reply. Cancelled work should be dropped silently. Keep unfinished work open.',
              };
              if (JSON.stringify({ ...error.outcome, review }).length > CHANNEL_READ_OUTPUT_LIMIT)
                throw error;
              const observationId = ports.groupSendReview.observe(
                reviewOwner,
                current.id,
                bounded.included.map((view) => view.message),
                input.observationId ?? initialObservations.get(current.id),
              );
              observations.set(current.id, observationId);
              if (observeReads)
                ports.observeReadMessages(botSlug, bounded.included, readAdmissions);
              throw new SendReviewRequired({
                ...error.outcome,
                review: { ...review, observationId },
              });
            });
          return sent;
        }
        const body = input.body;
        if (!body.trim() && !input.attachments?.length)
          throw new Error('Channel message requires a body or attachment');
        ports.channels.assertAttachmentRefs(input.attachments ?? []);
        if (input.replyTo !== undefined && !ports.channels.hasMessage(channel.id, input.replyTo)) {
          throw new ChannelReplyTargetError();
        }
        const messageId = ports.causalSending.deliveryMessageId(sessionId, input.deliveryKey);
        ports.causalSending.assertQuoteTargets(channel.id, messageId, input.quotes);
        beforeSend();
        const message: ChannelMessage = {
          id: messageId,
          at: ports.now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
          ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
          ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
          ...(input.quotes?.length ? { quotes: input.quotes } : {}),
          ...ports.causalSending.perf(sessionId, body),
          ...attribution,
          ...(input.genui === undefined ? {} : { genui: input.genui }),
          ...(input.sessionLinks === undefined ? {} : { sessionLinks: input.sessionLinks }),
        };
        const originId = input.replySourceEventId ?? sourceEventId;
        const origin = {
          sessionId,
          ...(originId === undefined ? {} : { sourceEventId: originId }),
        };
        if (input.deliveryKey === undefined) {
          const appended = await ports.channels.appendMessage(
            OWNER_HUMAN_CONTEXT,
            channel.id,
            message,
            origin,
          );
          if (appended === undefined) throw new Error(`Channel disappeared: ${channel.id}`);
          return appended;
        }
        const result = await ports.channels.appendMessageOnce(
          OWNER_HUMAN_CONTEXT,
          channel.id,
          message,
          undefined,
          origin,
        );
        if (result.status === 'missing') throw new Error(`Channel disappeared: ${channel.id}`);
        if (result.status === 'conflict')
          throw new Error('Human DM delivery key has different content');
        return result.message;
      },
    };
  }

  return channelAccess;
}
