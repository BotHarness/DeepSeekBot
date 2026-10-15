import type { HostClient, RosterBot, RosterChannel, RosterView } from './client';

export const GROUP_NAME_MAX = 120;

export interface GroupMember {
  slug: string;
  bot?: RosterBot;
  owner: boolean;
}

export interface GroupPending {
  id: string;
  slug: string;
  bot?: RosterBot;
}

export interface GroupInfo {
  channel: RosterChannel;
  members: GroupMember[];
  invites: GroupPending[];
  joins: GroupPending[];
  candidates: RosterBot[];
}

export function groupInfo(
  roster: RosterView | undefined,
  channelId: string,
): GroupInfo | undefined {
  const channel = roster?.channels.find((entry) => entry.id === channelId);
  if (roster === undefined || channel === undefined) return undefined;
  const bots = new Map(roster.bots.map((bot) => [bot.slug, bot]));
  const pending = (entry: { id: string; botSlug: string }): GroupPending => {
    const bot = bots.get(entry.botSlug);
    return { id: entry.id, slug: entry.botSlug, ...(bot === undefined ? {} : { bot }) };
  };
  const invites = (channel.pendingInvites ?? []).map(pending);
  const invited = new Set(invites.map((invite) => invite.slug));
  return {
    channel,
    members: channel.members.map((slug) => {
      const bot = bots.get(slug);
      return { slug, ...(bot === undefined ? {} : { bot }), owner: channel.ownerBotSlug === slug };
    }),
    invites,
    joins: (channel.pendingJoins ?? []).map(pending),
    candidates: roster.bots.filter(
      (bot) => !bot.paused && !channel.members.includes(bot.slug) && !invited.has(bot.slug),
    ),
  };
}

export function memberName(entry: { slug: string; bot?: RosterBot }): string {
  return entry.bot?.displayName ?? entry.slug;
}

export interface GroupActions {
  invite(botSlug: string): Promise<void>;
  cancelInvite(invitationId: string): Promise<void>;
  decideJoin(requestId: string, accept: boolean): Promise<void>;
  removeMember(botSlug: string): Promise<void>;
  rename(name: string): Promise<void>;
  setAvatar(avatar: string | null): Promise<void>;
  disband(): Promise<void>;
}

export class GroupDisbandRefused extends Error {}

export function groupActions(client: HostClient, channelId: string): GroupActions {
  const change = async (method: string, args: Record<string, unknown>): Promise<void> => {
    await client.call<unknown>(method, { channelId, ...args });
    await client.refresh().catch(() => undefined);
  };
  return {
    invite: (botSlug) => change('channelGroupInvite', { botSlug }),
    cancelInvite: (invitationId) => change('channelGroupInviteCancel', { invitationId }),
    decideJoin: (requestId, accept) => change('channelGroupJoinDecide', { requestId, accept }),
    removeMember: (botSlug) => change('channelGroupMemberRemove', { botSlug }),
    rename: (name) => change('channelRename', { name: name.trim().slice(0, GROUP_NAME_MAX) }),
    setAvatar: (avatar) => change('channelGroupAvatarSet', { avatar }),
    async disband() {
      const answer = await client.call<{ deleted?: unknown }>('channelGroupDelete', { channelId });
      if (answer?.deleted !== true) throw new GroupDisbandRefused('The group was not disbanded.');
      await client.refresh().catch(() => undefined);
    },
  };
}
