import { isEncryptedRoute, isLanRoute } from '@botharness/host-protocol/route';
import type {
  ChannelListItem,
  PersonaBotSummary,
  WireAuthor,
  WireBotActivity,
} from '@botharness/host-protocol/wire';
import {
  isChannelVoiceCallRecord,
  type ChannelVoiceCallRecord,
} from '../../core/src/channels/voice-call-record';
import type {
  HostClientOptions,
  RosterArrangement,
  RosterBot,
  RosterChannel,
  RosterHuman,
  RosterSection,
  RosterView,
  TopOrderEntry,
} from './client-contract';
import { record } from './client-wire';
import type { RosterSorting } from './roster-sorting';

const HUMAN_AVATAR_VERSION = /^[a-f0-9]{16}$/u;

function rosterHumans(value: unknown): { humanMembers?: RosterHuman[] } {
  if (!Array.isArray(value)) return {};
  return {
    humanMembers: value.flatMap((raw: unknown) => {
      if (typeof raw !== 'object' || raw === null) return [];
      const member = raw as Record<string, unknown>;
      const version = member['avatarVersion'];
      return typeof member['humanId'] === 'string' &&
        member['humanId'].length > 0 &&
        typeof member['displayName'] === 'string'
        ? [
            {
              humanId: member['humanId'],
              displayName: member['displayName'],
              ...(typeof version === 'string' && HUMAN_AVATAR_VERSION.test(version)
                ? { avatarVersion: version }
                : {}),
            },
          ]
        : [];
    }),
  };
}

function previewOf(channel: ChannelListItem | undefined): {
  preview?: string;
  previewCall?: ChannelVoiceCallRecord;
  previewAt?: string;
  latestMessageId?: string;
  previewAuthor?: WireAuthor;
} {
  const message = channel?.latestMessage;
  if (message === undefined) return {};
  const call = record(message).voiceCallRecord;
  return {
    preview: message.body.replace(/\s+/gu, ' ').trim().slice(0, 140),
    ...(message.author?.kind === 'system' && isChannelVoiceCallRecord(call)
      ? { previewCall: call }
      : {}),
    previewAt: message.at,
    latestMessageId: message.id,
    ...(message.author === undefined ? {} : { previewAuthor: message.author }),
  };
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

export function arrangementOf(value: unknown): RosterArrangement | undefined {
  const snapshot = record(value);
  if (!Array.isArray(snapshot['sections'])) return undefined;
  const sections = snapshot['sections'].flatMap((entry): RosterSection[] => {
    const section = record(entry);
    return typeof section['id'] === 'string' && typeof section['name'] === 'string'
      ? [
          {
            id: section['id'],
            name: section['name'],
            channelIds: strings(section['channelIds']),
          },
        ]
      : [];
  });
  const topOrder = Array.isArray(snapshot['topOrder'])
    ? snapshot['topOrder'].flatMap((entry): TopOrderEntry[] => {
        const item = record(entry);
        return (item['kind'] === 'section' || item['kind'] === 'channel') &&
          typeof item['id'] === 'string'
          ? [{ kind: item['kind'], id: item['id'] }]
          : [];
      })
    : undefined;
  return {
    pins: strings(snapshot['pins']),
    hidden: strings(snapshot['hidden']),
    ...(Array.isArray(snapshot['muted']) ? { muted: strings(snapshot['muted']) } : {}),
    sections,
    sectionOrder: strings(snapshot['sectionOrder']),
    ...(topOrder === undefined ? {} : { topOrder }),
  };
}

export function createRosterView(
  options: HostClientOptions,
  avatar: (path: string) => { avatarUrl?: string; avatarHeaders?: Record<string, string> },
  roster: {
    readonly route: string;
    readonly channels: ReadonlyMap<string, ChannelListItem>;
    readonly states: ReadonlyMap<string, WireBotActivity>;
    readonly arrangement: RosterArrangement | undefined;
    readonly sorting: RosterSorting | undefined;
  },
) {
  const view = (list: PersonaBotSummary[]): RosterView => {
    const dms = new Map<string, ChannelListItem>();
    const groups: RosterChannel[] = [];
    const people: RosterChannel[] = [];
    for (const channel of roster.channels.values()) {
      if (channel.deletedAt !== undefined) continue;
      if (channel.type === 'dm' && channel.botSlug !== undefined) dms.set(channel.botSlug, channel);
      else if (channel.type === 'dm' && channel.humanParticipants?.length === 2)
        people.push({
          id: channel.id,
          name: channel.name,
          memberCount: channel.humanParticipants.length,
          members: channel.members,
          ...previewOf(channel),
        });
      else if (channel.type === 'group') {
        const humans = rosterHumans(channel.humanMembers);
        groups.push({
          id: channel.id,
          name: channel.name,
          memberCount: channel.members.length + (humans.humanMembers?.length ?? 0),
          members: channel.members,
          ...humans,
          ...(channel.avatar === undefined ? {} : { avatar: channel.avatar }),
          ...(channel.ownerBotSlug === undefined ? {} : { ownerBotSlug: channel.ownerBotSlug }),
          pendingInvites: (channel.invitations ?? [])
            .filter((invite) => invite.status === 'pending')
            .map((invite) => ({
              id: invite.id,
              botSlug: invite.targetBotSlug,
            })),
          pendingJoins: (channel.joinRequests ?? [])
            .filter((request) => request.status === 'pending')
            .map((request) => ({
              id: request.id,
              botSlug: request.requesterBotSlug,
            })),
          ...previewOf(channel),
        });
      }
    }
    groups.sort((a, b) => (b.previewAt ?? '').localeCompare(a.previewAt ?? ''));
    return {
      bots: list
        .filter((bot) => bot.deleted !== true)
        .map((bot) => {
          const dm = dms.get(bot.slug);
          const live = roster.states.get(bot.slug);
          return {
            slug: bot.slug,
            displayName: bot.displayName,
            tob: bot.tob !== undefined,
            ...(bot.avatar === undefined ? {} : avatar(bot.avatar)),

            ...(bot.appearance === undefined ? {} : { appearance: bot.appearance }),
            ...(bot.avatarSeed === undefined ? {} : { avatarSeed: bot.avatarSeed }),
            ...bannerOf(bot.banner),
            ...(bot.primaryColor === undefined ? {} : { primaryColor: bot.primaryColor }),
            roles: bot.roles ?? [],
            ...(bot.description === undefined ? {} : { description: bot.description }),
            computerAccess:
              bot.computerAccess === true &&
              (!isEncryptedRoute(roster.route, options.encryption) || isLanRoute(roster.route)),
            browserAccess:
              bot.browserAccess === true && !isEncryptedRoute(roster.route, options.encryption),
            hostAccess: {
              computer: bot.computerAccess === true,
              browser: bot.browserAccess === true,
            },
            state: live?.state ?? bot.aggregateState,
            ...(live?.activity === undefined ? {} : { activity: live.activity }),
            ...(live?.sessions === undefined ? {} : { sessions: live.sessions }),
            paused: bot.paused === true,
            ...(dm === undefined ? {} : { dmChannelId: dm.id }),
            ...previewOf(dm),
          };
        }),
      channels: groups,
      ...(people.length === 0 ? {} : { people }),
      activityChannels: [...roster.channels.values()].filter(
        (channel) => channel.deletedAt === undefined,
      ),
      ...(roster.arrangement === undefined ? {} : { arrangement: roster.arrangement }),
      ...(roster.sorting === undefined ? {} : { sorting: roster.sorting }),
    };
  };

  const bannerOf = (
    banner: PersonaBotSummary['banner'],
  ): Pick<RosterBot, 'bannerRecipe' | 'bannerUrl' | 'bannerHeaders'> => {
    if (banner === undefined) return {};
    if ('recipe' in banner) return { bannerRecipe: banner.recipe };
    const image = avatar(banner.image);
    return image.avatarUrl === undefined
      ? {}
      : {
          bannerUrl: image.avatarUrl,
          bannerHeaders: image.avatarHeaders ?? {},
        };
  };

  return view;
}
