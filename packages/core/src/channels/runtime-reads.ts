import { createHash } from 'node:crypto';
import type { HumanContext } from '../humans/context.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { TeamService } from '../team/service.js';
import { queryCallWindow } from '../features/voice/events.js';
import { boundModelPage, readModelContent } from '../runtime/channel-model-read.js';
import { requireNonBlank } from '../runtime/require-non-blank.js';
import { hasChannelCallWindow } from './call-window.js';
import { isBotDmChannel, type ChannelMessage, type ChannelRecord } from './channel.js';
import { MAX_MESSAGE_PAGE, type ChannelStore } from './store.js';
import { encodeChannelMessageCursor, prepareChannelMessageQuery } from './store-query.js';
import type { GroupSendReview } from './send-review.js';
import type {
  ChannelListEntry,
  ChannelMessageView,
  ChannelQueryInput,
  ChannelQueryPage,
  OrchestratorChannelAccess,
} from './runtime-access-types.js';

interface ChannelReadPorts {
  channels: ChannelStore;
  registry: PersonaBotRegistry;
  team: TeamService | undefined;
  groupSendReview: GroupSendReview;
  isMember: (botSlug: string, channel: ChannelRecord) => boolean;
  observeReadMessages: (
    botSlug: string,
    views: ChannelMessageView[],
    readAdmissions: Set<string>,
  ) => void;
}

type QueryPage = ChannelQueryPage & { cursorAfter(count: number): string | undefined };

export function createChannelReads(
  ports: ChannelReadPorts,
  botSlug: string,
  actorHuman: HumanContext,
  resolve: (requested?: string) => ChannelRecord,
  observeReads: boolean,
  readAdmissions: Set<string>,
  observations: Map<string, string>,
  recordObservation: (views: ChannelMessageView[]) => void,
): Pick<OrchestratorChannelAccess, 'list' | 'read' | 'query' | 'readModel'> & {
  viewOf: (
    channel: ChannelRecord,
    message: ChannelMessage,
    humans?: Record<string, string>,
  ) => ChannelMessageView;
} {
  const humanNames = (channel: ChannelRecord): Record<string, string> =>
    Object.fromEntries(
      ports.channels
        .listHumanMembers(actorHuman, channel.id)
        .map((member) => [member.humanId, member.displayName]),
    );
  const viewOf = (
    channel: ChannelRecord,
    message: ChannelMessage,
    humans = humanNames(channel),
  ): ChannelMessageView => ({
    channelId: channel.id,
    channelName: channel.name,
    message,
    actorNames: {
      humans,
      bots: Object.fromEntries(
        [
          ...new Set([
            ...(message.author.kind === 'bot' ? [message.author.slug] : []),
            ...(message.mentions ?? []).map((mention) => mention.botSlug),
          ]),
        ].flatMap((slug) => {
          const bot = ports.registry.get(slug);
          return bot === undefined ? [] : [[slug, bot.displayName]];
        }),
      ),
    },
  });
  const contentProgress = new Map<string, number>();
  const queryPage = (input: ChannelQueryInput = {}): QueryPage => {
    if (input.scope !== undefined && input.scope !== 'channel' && input.scope !== 'joined') {
      throw new Error('channel_read: invalid scope');
    }
    const call = hasChannelCallWindow(input)
      ? queryCallWindow({ channels: ports.channels, resolve, input })
      : undefined;
    if (call !== undefined || input.scope !== 'joined') {
      const channel = call?.channel ?? resolve(input.channelId);
      const queryOptions = call?.queryOptions ?? input;
      const page = call?.page ?? ports.channels.queryMessages(channel.id, queryOptions);
      const humans = humanNames(channel);
      const messages = page.messages.map((message) => viewOf(channel, message, humans));
      let filter: string | undefined;
      return {
        messages,
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        ...(call === undefined ? {} : { call: call.window }),
        cursorAfter(count) {
          if (count >= messages.length) return page.nextCursor;
          const anchor = messages[count - 1]?.message.id;
          if (anchor === undefined) return undefined;
          filter ??= prepareChannelMessageQuery(channel.id, queryOptions).filter;
          return encodeChannelMessageCursor(filter, anchor);
        },
      };
    }
    if (input.channelId !== undefined) {
      throw new Error('channel_read: channel_id cannot be combined with joined scope');
    }
    const text = requireNonBlank(input.text ?? '', 'Cross-Channel text query');
    const channels = ports.channels
      .list()
      .filter((channel) => ports.isMember(botSlug, channel))
      .sort((left, right) => left.id.localeCompare(right.id));
    const filter = createHash('sha256')
      .update(
        JSON.stringify({
          channelIds: channels.map((channel) => channel.id),
          text: text.toLowerCase(),
          authorBotId: input.authorBotId,
          authorKind: input.authorKind,
          from: input.from,
          to: input.to,
        }),
      )
      .digest('hex')
      .slice(0, 16);
    type SortKey = { at: string; channelId: string; messageId: string };
    const descending = (left: string, right: string): number =>
      right < left ? -1 : right > left ? 1 : 0;
    const compare = (left: SortKey, right: SortKey): number =>
      Date.parse(right.at) - Date.parse(left.at) ||
      descending(left.channelId, right.channelId) ||
      descending(left.messageId, right.messageId);
    let after: SortKey | undefined;
    if (input.cursor !== undefined) {
      try {
        const decoded: unknown = JSON.parse(
          Buffer.from(input.cursor, 'base64url').toString('utf8'),
        );
        if (
          typeof decoded !== 'object' ||
          decoded === null ||
          !('filter' in decoded) ||
          decoded.filter !== filter ||
          !('at' in decoded) ||
          typeof decoded.at !== 'string' ||
          !('channelId' in decoded) ||
          typeof decoded.channelId !== 'string' ||
          !('messageId' in decoded) ||
          typeof decoded.messageId !== 'string'
        )
          throw new Error('invalid');
        after = {
          at: decoded.at,
          channelId: decoded.channelId,
          messageId: decoded.messageId,
        };
      } catch {
        throw new Error('channel_read: invalid cursor');
      }
    }
    const {
      cursor: _cursor,
      scope: _scope,
      channelId: _channelId,
      limit: _limit,
      ...filters
    } = input;
    const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), MAX_MESSAGE_PAGE));
    const afterTo =
      after !== undefined && Number.isFinite(Date.parse(after.at)) ? after.at : undefined;
    if (
      afterTo !== undefined &&
      filters.from !== undefined &&
      Date.parse(filters.from) > Date.parse(afterTo)
    )
      return { messages: [], cursorAfter: () => undefined };
    const found: ChannelMessageView[] = [];
    for (const channel of channels) {
      const humans = humanNames(channel);
      let cursor: string | undefined;
      do {
        const page = ports.channels.queryMessages(channel.id, {
          ...filters,
          text,
          ...(afterTo !== undefined && filters.to === undefined ? { to: afterTo } : {}),
          orderBy: 'time',
          ascending: false,
          ...(cursor === undefined ? {} : { cursor }),
          limit: MAX_MESSAGE_PAGE,
        });
        for (const message of page.messages) {
          const key = {
            at: message.at,
            channelId: channel.id,
            messageId: message.id,
          };
          if (after !== undefined && compare(key, after) <= 0) continue;
          found.push(viewOf(channel, message, humans));
        }
        found.sort((left, right) =>
          compare(
            {
              at: left.message.at,
              channelId: left.channelId,
              messageId: left.message.id,
            },
            {
              at: right.message.at,
              channelId: right.channelId,
              messageId: right.message.id,
            },
          ),
        );
        found.length = Math.min(found.length, limit + 1);
        cursor = page.nextCursor;
        const tail = page.messages.at(-1);
        const worst = found[limit];
        if (
          cursor !== undefined &&
          tail !== undefined &&
          worst !== undefined &&
          compare(
            { at: tail.at, channelId: channel.id, messageId: tail.id },
            {
              at: worst.message.at,
              channelId: worst.channelId,
              messageId: worst.message.id,
            },
          ) >= 0
        )
          break;
      } while (cursor !== undefined);
    }
    const cursorAfter = (count: number): string | undefined => {
      const last = found[count - 1];
      if (found.length <= count || last === undefined) return undefined;
      return Buffer.from(
        JSON.stringify({
          at: last.message.at,
          channelId: last.channelId,
          messageId: last.message.id,
          filter,
        }),
      ).toString('base64url');
    };
    const nextCursor = cursorAfter(limit);
    return {
      messages: found.slice(0, limit),
      ...(nextCursor === undefined ? {} : { nextCursor }),
      cursorAfter,
    };
  };
  return {
    viewOf,
    list: (input = {}) => {
      if (input.type !== undefined && input.type !== 'group' && input.type !== 'dm') {
        throw new Error('channel_list: type must be group or dm');
      }
      const name = input.name?.trim().toLowerCase();
      const memberBotIds = [...new Set(input.memberBotIds ?? [])].sort();
      const filter = createHash('sha256')
        .update(
          JSON.stringify({
            channelId: input.channelId,
            name,
            type: input.type,
            memberBotIds,
          }),
        )
        .digest('hex')
        .slice(0, 16);
      let afterId: string | undefined;
      if (input.cursor !== undefined) {
        try {
          const decoded: unknown = JSON.parse(
            Buffer.from(input.cursor, 'base64url').toString('utf8'),
          );
          if (
            typeof decoded !== 'object' ||
            decoded === null ||
            !('afterId' in decoded) ||
            typeof decoded.afterId !== 'string' ||
            !('filter' in decoded) ||
            decoded.filter !== filter
          )
            throw new Error('invalid');
          afterId = decoded.afterId;
        } catch {
          throw new Error('channel_list: invalid cursor');
        }
      }
      const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 100));
      const matching = ports.channels
        .list()
        .filter((channel) => ports.isMember(botSlug, channel))
        .filter((channel) => input.channelId === undefined || channel.id === input.channelId)
        .filter((channel) => input.type === undefined || channel.type === input.type)
        .filter((channel) => name === undefined || channel.name.toLowerCase().includes(name))
        .filter((channel) => memberBotIds.every((id) => channel.members.includes(id)))
        .filter((channel) => afterId === undefined || channel.id > afterId)
        .sort((left, right) => left.id.localeCompare(right.id));
      const page = matching.slice(0, limit + 1);
      const channels = page.slice(0, limit).map((channel): ChannelListEntry => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        kind: channel.type === 'group' ? 'group' : isBotDmChannel(channel) ? 'bot-dm' : 'human-dm',
        members: channel.members.map((id) => {
          const member = ports.registry.get(id);
          return {
            botId: id,
            displayName: member?.displayName ?? id,
            active: member !== undefined && member.paused !== true,
          };
        }),
        humanMembers: ports.channels.listHumanMembers(actorHuman, channel.id),
        ...(channel.ownerBotSlug === undefined ? {} : { ownerBotId: channel.ownerBotSlug }),
        ...(channel.type === 'group' && channel.ownerBotSlug === botSlug
          ? {
              pendingJoinRequests: (channel.joinRequests ?? [])
                .filter((item) => item.status === 'pending')
                .map((item) => ({
                  requestId: item.id,
                  requesterBotId: item.requesterBotSlug,
                  createdAt: item.createdAt,
                })),
            }
          : {}),
      }));
      const last = channels.at(-1);
      return {
        channels,
        ...(page.length <= limit || last === undefined
          ? {}
          : {
              nextCursor: Buffer.from(JSON.stringify({ afterId: last.id, filter })).toString(
                'base64url',
              ),
            }),
      };
    },
    read: (input = {}) => {
      const channel = resolve(input.channelId);
      const humans = humanNames(channel);
      const messages = ports.channels
        .readMessages(channel.id, {
          ...(input.before === undefined ? {} : { before: input.before }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        })
        .map((message) => viewOf(channel, message, humans));
      if (observeReads && input.observe !== false)
        ports.observeReadMessages(botSlug, messages, readAdmissions);
      return messages;
    },
    query: (input = {}) => {
      const { cursorAfter: _cursorAfter, ...page } = queryPage(input);
      if (observeReads) ports.observeReadMessages(botSlug, page.messages, readAdmissions);
      return page;
    },
    readModel: (input = {}) => {
      if (input.messageId !== undefined) {
        const { channelId, messageId, contentCursor, ...filters } = input;
        if (Object.values(filters).some((value) => value !== undefined))
          throw new Error('channel_read: message_id cannot be combined with query filters');
        const channel = resolve(channelId);
        const message = ports.channels.message(channel.id, messageId);
        if (message === undefined) throw new Error('channel_read: message not found');
        const view = viewOf(channel, message);
        const chunk = readModelContent(
          view,
          contentCursor,
          ports.groupSendReview.enabled(view.channelId) ? 100 : 0,
        );
        const previous = contentProgress.get(chunk.hash) ?? 0;
        const progress = chunk.start <= previous ? Math.max(previous, chunk.end) : previous;
        contentProgress.set(chunk.hash, progress);
        if (observeReads && progress === chunk.total)
          ports.observeReadMessages(botSlug, [view], readAdmissions);
        if (progress === chunk.total) recordObservation([view]);
        const observationId = observations.get(view.channelId);
        return observationId === undefined
          ? chunk.output
          : JSON.stringify({ ...JSON.parse(chunk.output), observationId });
      }
      if (input.contentCursor !== undefined)
        throw new Error('channel_read: content_cursor requires message_id');
      const page = queryPage(input);
      const callMeta = page.call === undefined ? 0 : JSON.stringify({ call: page.call }).length + 1;
      const bounded = boundModelPage(page, page.cursorAfter, (included) => {
        const ids = [...new Set(included.map((view) => view.channelId))].filter((id) =>
          ports.groupSendReview.enabled(id),
        );
        return (
          callMeta +
          (ids.length === 0
            ? 0
            : JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'x'.repeat(36)]))).length + 24)
        );
      });
      if (observeReads) ports.observeReadMessages(botSlug, bounded.included, readAdmissions);
      recordObservation(bounded.included);
      const observationIds = Object.fromEntries(
        [...new Set(bounded.included.map((view) => view.channelId))].flatMap((id) =>
          observations.has(id) ? [[id, observations.get(id)]] : [],
        ),
      );
      return Object.keys(observationIds).length === 0 && page.call === undefined
        ? bounded.output
        : JSON.stringify({
            ...JSON.parse(bounded.output),
            ...(page.call === undefined ? {} : { call: page.call }),
            ...(Object.keys(observationIds).length === 0 ? {} : { observationIds }),
          });
    },
  };
}
