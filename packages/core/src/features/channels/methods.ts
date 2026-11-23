import type { BridgeMethods } from '../../bridge/methods.js';
import { botOwner } from '../../team/bot-access.js';
import { TeamError } from '../../team/error.js';
import { MEMBER_CHANNEL_METHODS } from '../../team/member-methods.js';
import { remoteChannelAvailability, remoteChannelContact } from '../environments/methods.js';
import { channelPreviewMessage } from '../../channels/channel-notice.js';
import {
  asNonBlank,
  asObject,
  parseOptional,
  invalidInput,
  unavailable,
  unknownChannel,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { MAX_CHANNEL_QUOTES, quoteTextMatches } from '../../channels/quotes.js';
import type { TeamChannels } from '../../team/channels.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { SessionRecoveryError } from '../../runtime/session-recovery.js';
import { ChannelManagementError, type ChannelManagementResult } from '../../channels/management.js';
import {
  ContentPurgeError,
  type ChannelHistoryItem,
  type PurgeSource,
} from '../../purge/contracts.js';
import { type AllBotPreview } from '../../channels/all-bot-mention.js';
import { markAllHumanMessagesRead } from '../../channels/mark-all-read.js';
import { z } from 'zod';
import {
  isValidChannelId,
  isReactionEmoji,
  type ChannelMessage,
  type ChannelReaction,
  type ChannelRecord,
} from '../../channels/channel.js';
import { ChannelReactionLimitError } from '../../channels/store.js';
import { ChannelAttachmentError } from '../../attachments/store.js';
import { isChannelAttachmentRef } from '../../attachments/ref.js';
import type { ChannelAttachmentRef } from '../../attachments/ref.js';
import type {
  ChannelReadPosition,
  ChannelSendStatus,
  HumanMessageSearchPage,
} from '../../channels/store.js';
import type { ChannelTimelinePage } from '../../channels/timeline.js';
import { isValidSlug } from '../../bots/slug.js';
import { RosterUnavailableError } from '../../roster/store.js';
import type {
  BridgeMethodsDeps,
  ChannelListItem,
  ChannelListChanges,
} from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';

export function botInChannel(channel: ChannelRecord, botSlug: string): boolean {
  return channel.type === 'group' ? channel.members.includes(botSlug) : channel.botSlug === botSlug;
}

export interface ChannelsAdapterMethods {
  channelRetry(payload: unknown): Promise<BridgeResult<{ accepted: true }>>;
  composerValidate(payload: unknown): BridgeResult<{
    reply?: ChannelMessage;
    attachments: Array<ChannelAttachmentRef | null>;
    quotes?: Array<ChannelMessage | null>;
  }>;
  channels(payload: unknown): Promise<BridgeResult<{ channels: ChannelListItem[] }>>;
  channelListChanges(payload: unknown): Promise<BridgeResult<ChannelListChanges>>;
  channelDm(payload: unknown): BridgeResult<{ channel: ChannelRecord & { readOnly?: boolean } }>;
  channelGet(
    payload: unknown,
  ): BridgeResult<
    | ChannelManagementResult
    | { channel: ChannelRecord; channelFingerprint?: never }
    | ({ channel: ChannelRecord; channelFingerprint?: never } & ReturnType<TeamChannels['view']>)
  >;
  channelHistory(payload: unknown): BridgeResult<{ channels: ChannelHistoryItem[] }>;
  channelHistorySources(
    payload: unknown,
  ): BridgeResult<{ sources: PurgeSource[]; before?: string }>;
  channelTimeline(payload: unknown): BridgeResult<{ page: ChannelTimelinePage; revision: number }>;
  channelReadPosition(payload: unknown): BridgeResult<{ position?: ChannelReadPosition }>;
  channelMarkAllRead(payload: unknown): Promise<BridgeResult<{ channels: number }>>;
  channelMarkRead(payload: unknown): Promise<BridgeResult<{ position: ChannelReadPosition }>>;
  channelReact(payload: unknown): BridgeResult<{ reactions: ChannelReaction[] }>;
  channelSearch(
    payload: unknown,
  ): BridgeResult<{ messages: ChannelMessage[]; nextCursor?: string }>;
  messageSearch(payload: unknown): BridgeResult<HumanMessageSearchPage>;
  channelMessages(payload: unknown): BridgeResult<{ messages: ChannelMessage[]; revision: number }>;
  channelAllBotPreview(payload: unknown): BridgeResult<AllBotPreview>;
  channelSendStatus(payload: unknown): BridgeResult<ChannelSendStatus>;
}

export function createChannelsAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
  channelView: (channel: ChannelRecord) => ChannelListItem,
  listedChannels: () => Promise<ChannelRecord[]>,
  listItem: (channel: ChannelRecord) => ChannelListItem,
): ChannelsAdapterMethods {
  return {
    async channelRetry(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const recovery = source['recovery'];
      const failureMessageId = asNonBlank(source, 'failureMessageId');
      if (
        recovery !== undefined &&
        recovery !== 'continue' &&
        recovery !== 'compact' &&
        recovery !== 'new-session'
      )
        return invalidInput('recovery must be continue, compact or new-session');
      if (!channelId || !messageId || !deps.runtime?.retryDmMessage)
        return invalidInput('Original message is required');
      try {
        if (recovery !== undefined) {
          if (!failureMessageId || !deps.runtime.recoverDmMessage)
            return invalidInput('Original failure message is required');
          const failure = deps.channels.message(channelId, failureMessageId)?.sessionFailure;
          if (failure?.requestMessageId !== messageId)
            return invalidInput('Failure does not belong to this message');
          await deps.runtime.recoverDmMessage(
            {
              channelId,
              failureMessageId,
              action: recovery,
              compact: async (sessionId) => {
                const result = await deps.idleCompaction?.compactReservedSession?.(sessionId);
                return result?.outcome === 'compacted';
              },
            },
            human,
          );
        } else await deps.runtime.retryDmMessage(channelId, messageId, human);
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        if (error instanceof SessionRecoveryError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        return invalidInput(error instanceof Error ? error.message : 'Retry unavailable');
      }
    },
    composerValidate(payload) {
      const input = z
        .object({
          channelId: z.string(),
          replyTo: z.string().optional(),
          attachments: z.array(z.unknown()).max(10),
          quotes: z
            .array(z.object({ messageId: z.string(), text: z.string().optional() }).strict())
            .max(MAX_CHANNEL_QUOTES)
            .optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success || !input.data.attachments.every(isChannelAttachmentRef))
        return invalidInput('invalid composer references');
      const channel = deps.channels.get(input.data.channelId);
      if (
        channel === undefined ||
        (channel.type === 'dm'
          ? channel.botSlug === undefined && !channel.humanParticipants?.includes(human.humanId)
          : !deps.channels
              .listHumanMembers(human, channel.id)
              .some((member) => member.humanId === deps.channels.humanIdentity(human).humanId))
      )
        return invalidInput('Channel is unavailable');
      const visible = (messageId: string) =>
        deps.channels
          .readHumanTimeline(human, channel.id, {
            direction: 'around',
            around: messageId,
            olderLimit: 0,
            newerLimit: 0,
          })
          ?.entries.find((message) => message.id === messageId);
      const reply = input.data.replyTo === undefined ? undefined : visible(input.data.replyTo);
      const quotes = input.data.quotes?.map((quote) => {
        const target = visible(quote.messageId);
        return target === undefined ||
          (target as { contentPurge?: unknown }).contentPurge !== undefined ||
          (quote.text !== undefined && !quoteTextMatches(target.body, quote.text))
          ? null
          : target;
      });
      const attachments = input.data.attachments.map((ref) => {
        try {
          return deps.attachments?.current(ref) ?? null;
        } catch (error) {
          if (
            error instanceof ChannelAttachmentError &&
            ['not-found', 'invalid-ref'].includes(error.code)
          )
            return null;
          throw error;
        }
      });
      return {
        ok: true,
        value: {
          ...(reply === undefined ? {} : { reply }),
          attachments,
          ...(quotes === undefined ? {} : { quotes }),
        },
      };
    },
    async channels() {
      return {
        ok: true,
        value: { channels: (await listedChannels()).map(listItem) },
      };
    },
    async channelListChanges(payload) {
      const source = asObject(payload);
      const sinceSeq = source['sinceSeq'];
      const epoch = source['epoch'];
      if (!Number.isSafeInteger(sinceSeq) || (sinceSeq as number) < 0)
        return invalidInput('sinceSeq must be a nonnegative integer');
      if (epoch !== undefined && typeof epoch !== 'string')
        return invalidInput('epoch must be a string');
      if (deps.channels.readChangedChannels === undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel list changes are unavailable',
          },
        };
      const changed = deps.channels.readChangedChannels({
        sinceSeq: sinceSeq as number,
        ...(epoch === undefined ? {} : { epoch }),
      });
      const listed = await listedChannels();
      if (changed.reset === true) return { ok: true, value: changed };
      const ids = new Set(changed.channelIds);
      const present = new Set(listed.map((channel) => channel.id));
      if (
        deps.team &&
        (changed.all ||
          changed.channelIds.some(
            (id) => !present.has(id) && !deps.team!.channelAccess.canKnow(human, id),
          ))
      )
        return { ok: true, value: { reset: true, cursor: changed.cursor } };
      if (
        !isHostOwner() &&
        changed.channelIds.some(
          (id) =>
            !present.has(id) &&
            !deps.channels.get(id) &&
            !deps.channels.hasHumanMembership?.(human, id),
        )
      )
        return { ok: true, value: { reset: true, cursor: changed.cursor } };
      if (
        !isHostOwner() &&
        !deps.channels.hasHumanMembership &&
        changed.channelIds.some((id) => !present.has(id))
      )
        return { ok: true, value: { reset: true, cursor: changed.cursor } };
      return {
        ok: true,
        value: {
          channels: listed
            .filter(
              (channel) => changed.all || ids.has(channel.id) || channel.remoteBot !== undefined,
            )
            .map(listItem),
          removed: changed.channelIds.filter(
            (id) =>
              !present.has(id) &&
              (deps.team
                ? deps.team.channelAccess.canKnow(human, id)
                : human.humanId === OWNER_HUMAN_CONTEXT.humanId ||
                  deps.channels.hasHumanMembership?.(human, id) === true),
          ),
          cursor: changed.cursor,
        },
      };
    },
    channelDm(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      if (slug === undefined) return invalidInput('slug is required');
      if (!isValidSlug(slug)) return invalidInput(`invalid slug: ${slug}`);
      const displayName = parseOptional(source, 'displayName');
      if (!displayName.ok) return invalidInput('invalid channelDm payload');
      const channel = deps.channels.getOrCreateDm(human, slug, displayName.value ?? slug);
      if (channel === undefined) return invalidInput(`invalid slug: ${slug}`);
      return {
        ok: true,
        value: {
          channel: channelView(channel),
        },
      };
    },
    channelGet(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const participantDm = deps.channels.get(channelId);
      if (participantDm?.type === 'dm' && participantDm.humanParticipants?.includes(human.humanId))
        return { ok: true, value: { channel: channelView(participantDm) } };
      if (!isHostOwner()) {
        const channel = deps.channels.get(channelId);
        if (channel === undefined || channel.deletedAt !== undefined)
          return unknownChannel(channelId);
        return {
          ok: true,
          value: {
            channel: channelView(channel),
            ...(channel.type === 'group' && deps.team
              ? deps.team.channelAccess.view(human, channelId)
              : {}),
          },
        };
      }
      if (!deps.channelManagement)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel management is unavailable',
          },
        };
      try {
        if (deps.team && deps.channels.get(channelId)?.type === 'group') {
          const view = deps.team.channelAccess.view(human, channelId);
          const result = deps.channelManagement.snapshot(channelId);
          const channel = channelView(result.channel);
          if (view.role === 'member') {
            const {
              invitations: _invitations,
              joinRequests: _requests,
              wakePolicies: _policies,
              ...visible
            } = channel;
            return { ok: true, value: { channel: visible, ...view } };
          }
          const members = new Set(channel.members);
          return {
            ok: true,
            value: {
              ...result,
              channel,
              ...view,
              wakePolicies: result.wakePolicies.filter(({ botSlug }) => members.has(botSlug)),
            },
          };
        }
        const result = deps.channelManagement.snapshot(channelId);
        const channel = channelView(result.channel);
        const members = new Set(channel.members);
        return {
          ok: true,
          value: {
            ...result,
            channel,
            wakePolicies: result.wakePolicies.filter(({ botSlug }) => members.has(botSlug)),
          },
        };
      } catch (error) {
        if (error instanceof ChannelManagementError)
          return {
            ok: false,
            error: { code: error.code, message: error.message },
          };
        throw error;
      }
    },
    channelHistory() {
      try {
        if (!deps.contentPurge) return unavailable();
        return { ok: true, value: { channels: deps.contentPurge.history(human) } };
      } catch {
        return unavailable();
      }
    },
    channelHistorySources(payload) {
      const input = z
        .object({
          channelId: z.string().min(1).max(200),
          before: z.string().regex(/^\d+$/u).optional(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('Invalid history scope');
      try {
        if (!deps.contentPurge) return unavailable();
        return {
          ok: true,
          value: deps.contentPurge.sources(human, input.data.channelId, input.data.before),
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof ContentPurgeError ? error.code : 'purge-unavailable',
            message:
              error instanceof ContentPurgeError ? error.message : 'Channel history is unavailable',
          },
        };
      }
    },
    channelMessages(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const before = parseOptional(source, 'before');
      if (!before.ok) return invalidInput('invalid channelMessages payload');
      const limitValue = source['limit'];
      let limit: number | undefined;
      if (limitValue !== undefined) {
        if (typeof limitValue !== 'number' || !Number.isInteger(limitValue) || limitValue < 1) {
          return invalidInput('limit must be a positive integer');
        }
        limit = limitValue;
      }
      const cursor = before.value?.trim();
      const messages = deps.channels.readMessages(channelId, {
        ...(cursor === undefined || cursor.length === 0 ? {} : { before: cursor }),
        ...(limit === undefined ? {} : { limit }),
      });
      return {
        ok: true,
        value: { messages, revision: deps.channels.revision(channelId) },
      };
    },
    channelTimeline(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const parsed = z
        .object({
          direction: z.enum(['older', 'newer', 'around']).optional(),
          cursor: z.string().min(1).max(2048).optional(),
          around: z.string().min(1).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          olderLimit: z.number().int().min(0).max(200).optional(),
          newerLimit: z.number().int().min(0).max(200).optional(),
        })
        .safeParse(source);
      if (!parsed.success) return invalidInput('invalid channelTimeline payload');
      const page = deps.channels.readHumanTimeline(human, channelId, parsed.data);
      if (page === undefined) return invalidInput('invalid or expired timeline anchor');
      return {
        ok: true,
        value: { page, revision: deps.channels.revision(channelId) },
      };
    },
    channelReadPosition(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const position = deps.channels.readPosition(human, channelId);
      return { ok: true, value: position === undefined ? {} : { position } };
    },
    async channelMarkRead(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const position = await deps.channels.markRead(human, channelId, messageId);
      if (position === undefined) return invalidInput('message does not belong to channel');
      return { ok: true, value: { position } };
    },
    channelReact(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const emoji = source['emoji'];
      const active = source['active'] ?? true;
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      if (!isReactionEmoji(emoji)) return invalidInput('emoji must be a single emoji');
      if (typeof active !== 'boolean') return invalidInput('active must be a boolean');
      const reacted = deps.channels.get(channelId);
      if (reacted === undefined) return unknownChannel(channelId);
      if (
        reacted.type === 'dm' &&
        reacted.botSlug !== undefined &&
        deps.team?.bots.canReach(human, reacted.botSlug) === false
      )
        return invalidInput('message cannot take reactions in this Channel');
      if (deps.channels.setHumanReaction === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'reactions are unavailable',
          },
        };
      try {
        const reactions = deps.channels.setHumanReaction(
          human,
          channelId,
          messageId,
          emoji,
          active,
        );
        if (reactions === undefined)
          return invalidInput('message cannot take reactions in this Channel');
        return { ok: true, value: { reactions } };
      } catch (error) {
        if (error instanceof ChannelReactionLimitError) return invalidInput(error.message);
        throw error;
      }
    },
    channelSearch(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const text = source['text'];
      const cursor = source['cursor'];
      const limit = source['limit'];
      if (channelId === undefined) return invalidInput('channelId is required');
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 200)
        return invalidInput('text must be 1 to 200 characters');
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 512))
        return invalidInput('cursor must be the nextCursor of the previous page');
      if (
        limit !== undefined &&
        (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      )
        return invalidInput('limit must be an integer from 1 to 50');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      if (deps.channels.searchHumanMessages === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'search is unavailable',
          },
        };
      try {
        const page = deps.channels.searchHumanMessages(human, channelId, {
          text,
          limit: limit ?? 20,
          ...(cursor === undefined ? {} : { cursor }),
        });
        if (page === undefined) return unknownChannel(channelId);
        return { ok: true, value: page };
      } catch (error) {
        return invalidInput((error as Error).message.replace(/^channel_read: /u, ''));
      }
    },
    messageSearch(payload) {
      const source = asObject(payload);
      const text = source['text'];
      const cursor = source['cursor'];
      const limit = source['limit'];
      if (typeof text !== 'string' || text.trim().length === 0 || text.length > 200)
        return invalidInput('text must be 1 to 200 characters');
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 1024))
        return invalidInput('cursor must be the nextCursor of the previous page');
      if (
        limit !== undefined &&
        (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
      )
        return invalidInput('limit must be an integer from 1 to 50');
      if (deps.channels.searchAllHumanMessages === undefined)
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'search is unavailable',
          },
        };
      let hidden: string[];
      try {
        hidden = deps.roster.snapshot().hidden;
      } catch (error) {
        if (error instanceof RosterUnavailableError) return unavailable();
        throw error;
      }
      try {
        return {
          ok: true,
          value: deps.channels.searchAllHumanMessages(human, {
            text,
            limit: limit ?? 20,
            excludeChannelIds: hidden,
            ...(cursor === undefined ? {} : { cursor }),
          }),
        };
      } catch (error) {
        return invalidInput((error as Error).message.replace(/^message_search: /u, ''));
      }
    },
    async channelMarkAllRead(payload) {
      const source = asObject(payload);
      const channelId = source['channelId'];
      const botSlug = source['botSlug'];
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (channelId !== undefined && deps.channels.get(channelId as string) === undefined)
        return unknownChannel(channelId as string);
      try {
        return {
          ok: true,
          value: await markAllHumanMessagesRead(human, deps.channels, {
            ...(channelId === undefined ? {} : { channelId: channelId as string }),
            ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
          }),
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelAllBotPreview(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      try {
        return {
          ok: true,
          value: deps.channels.previewAllBotMention(channelId),
        };
      } catch (error) {
        return invalidInput((error as Error).message);
      }
    },
    channelSendStatus(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (!channelId || !messageId) return invalidInput('channelId and messageId are required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const value = deps.channels.humanSendStatus?.(channelId, messageId);
      return value === undefined ? invalidInput('Unknown Human DM request') : { ok: true, value };
    },
  };
}

export function createChannelViews(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry: BridgeMethodsDeps['registry'],
  isHostOwner: () => boolean,
) {
  const channelView = (channel: ChannelRecord): ChannelListItem => {
    if (!isHostOwner()) {
      const {
        invitations: _invitations,
        joinRequests: _requests,
        wakePolicies: _policies,
        ...visible
      } = channel;
      channel = visible;
    }
    const memberBots =
      channel.type === 'group'
        ? channel.members.flatMap((slug) => {
            const bot = globalRegistry.get(slug);
            return bot
              ? [
                  {
                    slug,
                    displayName: bot.displayName,
                    ...(bot.avatar ? { avatar: bot.avatar } : {}),
                  },
                ]
              : [];
          })
        : undefined;
    if (channel.type === 'group') {
      const members = memberBots?.map((bot) => bot.slug) ?? [];
      const memberSlugs = new Set(members);
      channel = { ...channel, members };
      if (channel.ownerBotSlug !== undefined && !memberSlugs.has(channel.ownerBotSlug))
        delete channel.ownerBotSlug;
      if (channel.wakePolicies !== undefined)
        channel.wakePolicies = Object.fromEntries(
          Object.entries(channel.wakePolicies).filter(([slug]) => memberSlugs.has(slug)),
        );
    }
    if (channel.humanParticipants && deps.team) {
      const other = channel.humanParticipants.find((id) => id !== human.humanId);
      channel = { ...channel, name: other ? (deps.team.member(other)?.displayName ?? '') : '' };
    }
    const humanNickname = deps.channels.humanNickname(human, channel.id);
    const remoteContact = remoteChannelContact(deps.runtime, channel);
    return {
      ...channel,
      ...(memberBots ? { memberBots } : {}),
      ...(channel.botSlug && deps.team
        ? {
            readOnly: !deps.team.bots.canReach(human, channel.botSlug),
            proactiveOptOut: deps.team.bots.proactiveOptOut(human, channel.botSlug),
          }
        : {}),
      humanMembers: deps.channels.listHumanMembers(human, channel.id),
      ...(channel.remoteBot === undefined
        ? {}
        : {
            remoteAvailability: remoteChannelAvailability(deps.runtime, channel.remoteBot),
          }),
      ...(remoteContact === undefined ? {} : { remoteContact }),
      ...(humanNickname === undefined ? {} : { humanNickname }),
    };
  };
  const listedChannels = async (): Promise<ChannelRecord[]> => {
    if (isHostOwner() && deps.channels.list().some((channel) => channel.remoteBot !== undefined))
      await deps.runtime?.refreshBotContacts?.();
    for (const bot of deps.registry.list())
      deps.channels.getOrCreateDm(human, bot.slug, bot.displayName);
    if (deps.team) {
      const visible = deps.team.channelAccess.visibleIds(human);
      return deps.channels
        .list()
        .filter(
          (channel) =>
            visible.has(channel.id) &&
            (channel.humanParticipants === undefined ||
              deps.channels.latestMessage(channel.id) !== undefined),
        );
    }
    return deps.channels
      .list()
      .filter((channel) =>
        channel.type === 'dm'
          ? (isHostOwner() && channel.remoteBot !== undefined) ||
            channel.members.every((slug) => deps.registry.get(slug) !== undefined)
          : isHostOwner(),
      );
  };
  const listItem = (channel: ChannelRecord): ChannelListItem => {
    const latest = deps.channels.latestMessage(channel.id);
    const latestMessage = latest === undefined ? undefined : channelPreviewMessage(latest);
    return {
      ...channelView(channel),
      ...(latestMessage === undefined ? {} : { latestMessage }),
    };
  };
  return { channelView, listedChannels, listItem };
}

export function authorizeChannelBridgeMethods(
  methods: BridgeMethods,
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry: BridgeMethodsDeps['registry'],
  isHostOwner: () => boolean,
): BridgeMethods {
  const scoped = new Set<string>(MEMBER_CHANNEL_METHODS);
  return new Proxy(methods, {
    get(target, key, receiver) {
      const method: unknown = Reflect.get(target, key, receiver);
      if (typeof method !== 'function' || typeof key !== 'string' || !deps.team) return method;
      return (payload: unknown, ...args: unknown[]) => {
        try {
          const input = asObject(payload);
          const id = asNonBlank(input, 'channelId');
          if (
            scoped.has(key) &&
            id &&
            (!isHostOwner() || deps.channels.get(id)) &&
            !deps.team!.channelAccess.canRead(human, id, key === 'channelSendStatus')
          )
            throw new TeamError('channel-not-found');
          if (key === 'channelCreate') {
            deps.team!.roles.require(human, 'channels.create');
            if (Array.isArray(input['members']))
              for (const slug of input['members'])
                if (typeof slug === 'string') {
                  deps.team!.bots.requireReach(human, slug);
                  const bot = globalRegistry.get(slug);
                  if (bot && botOwner(bot) !== human.humanId)
                    throw new TeamError('bot-principal-channel-denied', undefined, { slug });
                  if (bot && !deps.team!.bots.view(human, slug).switches.joinPrincipalChannels)
                    throw new TeamError('bot-channel-join-disabled', undefined, { slug });
                }
          }
          if (
            id &&
            deps.channels.get(id)?.type === 'group' &&
            ['channelRename', 'channelGroupAvatarSet'].includes(key)
          )
            deps.team!.channelAccess.requirePolicy(human, id, 'editDetails');
          if (id && deps.channels.get(id) && key === 'channelSend') {
            deps.team!.channelAccess.requirePolicy(human, id, 'post');
            if (input['allBotMention'] !== undefined)
              deps.team!.channelAccess.requirePolicy(human, id, 'mentionAll');
            if (Array.isArray(input['channelRefs']))
              for (const ref of input['channelRefs']) {
                const refId = asNonBlank(asObject(ref), 'channelId');
                if (refId && !deps.team!.channelAccess.canRead(human, refId))
                  throw new TeamError('channel-not-found');
              }
          }
          const result: unknown = Reflect.apply(method, target, [payload, ...args]);
          if (result instanceof Promise)
            return result.catch((error: unknown) => {
              if (error instanceof TeamError)
                return {
                  ok: false,
                  error: {
                    code: error.code,
                    message: error.code,
                    ...(error.details ? { details: error.details } : {}),
                  },
                };
              throw error;
            });
          return result;
        } catch (error) {
          if (error instanceof TeamError)
            return {
              ok: false,
              error: {
                code: error.code,
                message: error.code,
                ...(error.details ? { details: error.details } : {}),
              },
            };
          throw error;
        }
      };
    },
  });
}
