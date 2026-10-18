import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { botProfileFingerprint } from '../bots/profile-snapshot.js';
import { isGroupAvatar, type ChannelRecord } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import { ChannelManagementError, type ChannelManagementService } from '../channels/management.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_CHANNEL_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'channels',
    description: 'List bounded Channel metadata without reading conversation content',
    write: false,
  },
  {
    command: 'channel',
    description:
      'Read a Group Channel and its current management fingerprint and invitation policy',
    write: false,
  },
  {
    command: 'group-create',
    description:
      'Create a Human-owned Group; explicitly selected initial Bots join directly, and Tob never joins',
    write: true,
  },
  {
    command: 'group-invite',
    description:
      'Invite one active Bot under the reviewed Group invitation policy; preserve the canonical acceptance outcome',
    write: true,
  },
  {
    command: 'group-invite-cancel',
    description: 'Cancel a reviewed pending invitation without removing any existing member',
    write: true,
  },
  {
    command: 'group-join-decide',
    description: 'Accept or decline a reviewed pending Bot join request',
    write: true,
  },
  {
    command: 'channel-rename',
    description: 'Rename a reviewed Group, preserving other settings',
    write: true,
  },
  { command: 'group-avatar-set', description: 'Set or clear a reviewed Group avatar', write: true },
  {
    command: 'group-wake-policies',
    description: 'Read effective member wake policies and the current Group fingerprint',
    write: false,
  },
  {
    command: 'group-wake-set',
    description: 'Set or inherit a reviewed Group member wake policy',
    write: true,
  },
  {
    command: 'group-member-remove',
    description: 'Remove a reviewed Bot member from a Group, preserving its Bot and history',
    write: true,
  },
];

function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function text(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > 512 ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    throw new TobError('invalid-input');
  return value;
}
function key(value: unknown): string {
  const result = text(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(result))
    throw new TobError('invalid-operation-key');
  return result;
}
function owner<T>(call: () => T): T {
  try {
    return call();
  } catch (error) {
    if (error instanceof ChannelManagementError) throw new TobError(error.code);
    throw error;
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function imageView(value: string) {
  return {
    present: true,
    sha256: createHash('sha256').update(value).digest('hex'),
    bytes: Buffer.byteLength(value),
    type: value.split(';')[0],
  };
}
function channelView(channel: ChannelRecord) {
  const invitations = channel.invitations ?? [];
  const joinRequests = channel.joinRequests ?? [];
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    ...(channel.avatar ? { avatar: imageView(channel.avatar) } : {}),
    members: channel.members.slice(0, 100),
    memberCount: channel.members.length,
    ...(channel.members.length > 100 ? { membersOmitted: channel.members.length - 100 } : {}),
    ...(channel.botSlug === undefined ? {} : { botSlug: channel.botSlug }),
    ...(channel.ownerBotSlug === undefined ? {} : { ownerBotSlug: channel.ownerBotSlug }),
    invitations: invitations.slice(-100).map((invitation) => ({ ...invitation })),
    ...(invitations.length > 100 ? { invitationsOmitted: invitations.length - 100 } : {}),
    joinRequests: joinRequests.slice(-100).map((request) => ({ ...request })),
    ...(joinRequests.length > 100 ? { joinRequestsOmitted: joinRequests.length - 100 } : {}),
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}
function view(value: ReturnType<ChannelManagementService['snapshot']>) {
  return { ...value, channel: channelView(value.channel) };
}

export function createTobChannelOperations(deps: {
  management: ChannelManagementService;
  channels: Pick<ChannelStore, 'list'>;
  registry: Pick<PersonaBotRegistry, 'get'>;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const bot = (slug: string) => {
    if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
    const record = deps.registry.get(slug);
    if (!record) throw new TobError('unknown-bot');
    if (record.paused) throw new TobError('archived-bot');
    return {
      slug,
      displayName: record.displayName,
      createdAt: record.createdAt,
      profileFingerprint: botProfileFingerprint(record),
    };
  };
  return (command, raw) => {
    if (!TOB_CHANNEL_CAPABILITIES.some((item) => item.command === command)) return undefined;
    const args = structuredClone(raw);
    if (command === 'channels') {
      keys(args, ['limit', 'cursor']);
      const limit = args.limit === undefined ? 50 : args.limit;
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new TobError('invalid-input');
      const cursor = args.cursor === undefined ? undefined : text(args.cursor);
      return {
        run(guard) {
          guard();
          const channels = deps.channels
            .list()
            .filter(
              (channel) =>
                !channel.deletedAt && (channel.type === 'group' || channel.botSlug !== undefined),
            )
            .sort((a, b) => a.id.localeCompare(b.id));
          const after =
            cursor === undefined
              ? channels
              : channels.filter((channel) => channel.id.localeCompare(cursor) > 0);
          const page = after.slice(0, limit);
          return {
            channels: page.map(channelView),
            ...(after.length > limit ? { nextCursor: page.at(-1)!.id } : {}),
          };
        },
      };
    }
    if (command === 'channel') {
      keys(args, ['channelId']);
      const channelId = text(args.channelId);
      return {
        run(guard) {
          guard();
          return view(owner(() => deps.management.snapshot(channelId)));
        },
      };
    }
    if (command === 'group-invite-cancel' || command === 'group-join-decide') {
      keys(args, [
        'channelId',
        'expectedChannel',
        ...(command === 'group-invite-cancel' ? ['invitationId'] : ['requestId', 'accept']),
      ]);
      const channelId = text(args.channelId);
      const expectedChannel = text(args.expectedChannel);
      if (!/^[a-f0-9]{64}$/u.test(expectedChannel)) throw new TobError('invalid-input');
      const previous = structuredClone(owner(() => deps.management.wakePolicies(channelId)));
      if (previous.channelFingerprint !== expectedChannel) throw new TobError('stale-channel');
      const target = (slug: string, createdAt: string) => {
        if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
        const record = deps.registry.get(slug);
        if (!record) throw new TobError('unknown-bot');
        if (record.createdAt !== createdAt) throw new TobError('stale-profile');
        if (command === 'group-join-decide' && record.paused) throw new TobError('archived-bot');
        return {
          slug,
          displayName: record.displayName,
          createdAt: record.createdAt,
          profileFingerprint: botProfileFingerprint(record),
        };
      };
      let targetBot: ReturnType<typeof target>;
      let changes: unknown;
      let apply: () => ReturnType<ChannelManagementService['snapshot']>;
      if (command === 'group-invite-cancel') {
        const invitationId = text(args.invitationId);
        const invitation = previous.channel.invitations?.find((item) => item.id === invitationId);
        if (!invitation) throw new TobError('unknown-invitation');
        if (invitation.status !== 'pending') throw new TobError('invitation-not-pending');
        targetBot = target(invitation.targetBotSlug, invitation.targetBotCreatedAt);
        changes = { cancelInvitation: { ...invitation, targetBot }, preservesMembers: true };
        apply = () => deps.management.cancelInvite({ channelId, invitationId, expectedChannel });
      } else {
        const requestId = text(args.requestId);
        const { accept } = args;
        if (typeof accept !== 'boolean') throw new TobError('invalid-input');
        const request = previous.channel.joinRequests?.find((item) => item.id === requestId);
        if (!request) throw new TobError('unknown-join-request');
        if (
          request.status !== 'pending' ||
          previous.channel.members.includes(request.requesterBotSlug)
        )
          throw new TobError('join-request-not-pending');
        targetBot = target(request.requesterBotSlug, request.requesterBotCreatedAt);
        changes = { joinDecision: { ...request, accept, requester: targetBot } };
        apply = () => deps.management.decideJoin({ channelId, requestId, accept, expectedChannel });
      }
      return {
        proposal: freeze({
          command,
          target: channelId,
          previousValue: view(previous),
          patch: { expectedChannel, changes },
        }),
        run(guard, beforeEffect) {
          guard();
          if (
            owner(() => deps.management.wakePolicies(channelId)).channelFingerprint !==
            expectedChannel
          )
            throw new TobError('stale-channel');
          if (!isDeepStrictEqual(target(targetBot.slug, targetBot.createdAt), targetBot))
            throw new TobError('stale-profile');
          beforeEffect?.();
          return view(owner(apply));
        },
      };
    }
    if (
      [
        'channel-rename',
        'group-avatar-set',
        'group-wake-policies',
        'group-wake-set',
        'group-member-remove',
      ].includes(command)
    ) {
      const fields: Record<string, string[]> = {
        'channel-rename': ['name'],
        'group-avatar-set': ['avatar'],
        'group-wake-policies': [],
        'group-wake-set': ['botSlug', 'mode', 'count', 'intervalSeconds', 'inherit'],
        'group-member-remove': ['botSlug'],
      };
      keys(args, [
        'channelId',
        ...(command === 'group-wake-policies' ? [] : ['expectedChannel']),
        ...fields[command]!,
      ]);
      const channelId = text(args.channelId);
      if (command === 'group-wake-policies')
        return {
          run(guard) {
            guard();
            return view(owner(() => deps.management.wakePolicies(channelId)));
          },
        };
      const expectedChannel = text(args.expectedChannel);
      if (!/^[a-f0-9]{64}$/u.test(expectedChannel)) throw new TobError('invalid-input');
      const previous = structuredClone(owner(() => deps.management.wakePolicies(channelId)));
      if (previous.channelFingerprint !== expectedChannel) throw new TobError('stale-channel');
      const member = (slug: string, allowPaused: boolean) => {
        if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
        if (!previous.channel.members.includes(slug)) throw new TobError('not-group-member');
        const record = deps.registry.get(slug);
        if (!record) throw new TobError('unknown-bot');
        if (!allowPaused && record.paused) throw new TobError('archived-bot');
        return {
          slug,
          displayName: record.displayName,
          createdAt: record.createdAt,
          profileFingerprint: botProfileFingerprint(record),
        };
      };
      let targetBot: ReturnType<typeof member> | undefined;
      let changes: unknown;
      let apply: () => ReturnType<ChannelManagementService['snapshot']>;
      switch (command) {
        case 'channel-rename': {
          const name = text(args.name);
          if (name.length > 120) throw new TobError('invalid-input');
          changes = { name };
          apply = () => deps.management.rename({ channelId, name, expectedChannel });
          break;
        }
        case 'group-avatar-set': {
          const avatar = args.avatar;
          if (avatar !== null && !isGroupAvatar(avatar)) throw new TobError('invalid-input');
          changes = { avatar: avatar === null ? null : imageView(avatar) };
          apply = () => deps.management.setAvatar({ channelId, avatar, expectedChannel });
          break;
        }
        case 'group-member-remove': {
          const botSlug = text(args.botSlug);
          targetBot = member(botSlug, true);
          changes = {
            removeMember: {
              ...targetBot,
              clearsGroupOwner: previous.channel.ownerBotSlug === botSlug,
            },
            preservesBotAndHistory: true,
          };
          apply = () => deps.management.removeMember({ channelId, botSlug, expectedChannel });
          break;
        }
        case 'group-wake-set': {
          const botSlug = text(args.botSlug);
          targetBot = member(botSlug, false);
          const { mode, count, intervalSeconds, inherit } = args;
          if (
            typeof mode !== 'string' ||
            !['all', 'mentions', 'digest', 'silent'].includes(mode) ||
            typeof count !== 'number' ||
            !Number.isInteger(count) ||
            count < 1 ||
            count > 100 ||
            typeof intervalSeconds !== 'number' ||
            !Number.isInteger(intervalSeconds) ||
            intervalSeconds < 1 ||
            intervalSeconds > 3600 ||
            (inherit !== undefined && typeof inherit !== 'boolean')
          )
            throw new TobError('invalid-input');
          const wake = {
            botSlug,
            mode: mode as 'all' | 'mentions' | 'digest' | 'silent',
            count,
            intervalSeconds,
            ...(inherit === undefined ? {} : { inherit }),
          };
          changes = { wake, member: targetBot };
          apply = () => deps.management.setWake({ channelId, ...wake, expectedChannel });
          break;
        }
        default:
          throw new TobError('unsupported-command');
      }
      return {
        proposal: freeze({
          command,
          target: channelId,
          previousValue: view(previous),
          patch: { expectedChannel, changes },
        }),
        run(guard, beforeEffect) {
          guard();
          if (
            owner(() => deps.management.wakePolicies(channelId)).channelFingerprint !==
            expectedChannel
          )
            throw new TobError('stale-channel');
          if (
            targetBot &&
            !isDeepStrictEqual(member(targetBot.slug, command === 'group-member-remove'), targetBot)
          )
            throw new TobError('stale-profile');
          beforeEffect?.();
          return view(owner(apply));
        },
      };
    }
    keys(
      args,
      command === 'group-create'
        ? ['name', 'members', 'operationKey']
        : ['channelId', 'botSlug', 'expectedChannel', 'operationKey'],
    );
    const operationKey = key(args.operationKey);
    if (command === 'group-create') {
      const name = text(args.name);
      if (!Array.isArray(args.members) || args.members.length > 100)
        throw new TobError('invalid-input');
      const members = args.members.map(text);
      if (new Set(members).size !== members.length) throw new TobError('invalid-input');
      const input = { name, members };
      const lookup = () => owner(() => deps.management.lookupCreate(operationKey, input));
      if (lookup())
        return {
          run(guard) {
            guard();
            const replay = lookup();
            if (!replay) throw new TobError('channel-outcome-uncertain');
            return view(replay);
          },
        };
      const targets = members.map(bot);
      return {
        proposal: freeze({
          command,
          target: operationKey,
          previousValue: null,
          patch: { name, initialMembership: 'join-directly', members: targets },
        }),
        run(guard, beforeEffect) {
          guard();
          if (!isDeepStrictEqual(members.map(bot), targets)) throw new TobError('stale-profile');
          const replay = lookup();
          if (replay) return view(replay);
          beforeEffect?.();
          return view(owner(() => deps.management.create(input, operationKey)));
        },
      };
    }
    const channelId = text(args.channelId),
      botSlug = text(args.botSlug),
      expectedChannel = text(args.expectedChannel);
    if (!/^[a-f0-9]{64}$/u.test(expectedChannel)) throw new TobError('invalid-input');
    const input = { channelId, botSlug, expectedChannel };
    const lookup = () => owner(() => deps.management.lookupInvite(operationKey, input));
    if (lookup())
      return {
        run(guard) {
          guard();
          const replay = lookup();
          if (!replay) throw new TobError('channel-outcome-uncertain');
          return view(replay);
        },
      };
    const previous = structuredClone(owner(() => deps.management.snapshot(channelId)));
    if (previous.channelFingerprint !== expectedChannel) throw new TobError('stale-channel');
    const targetBot = bot(botSlug);
    return {
      proposal: freeze({
        command,
        target: channelId,
        previousValue: view(previous),
        patch: {
          operationKey,
          expectedChannel,
          invite: targetBot,
          invitationPolicy: previous.invitationPolicy,
        },
      }),
      run(guard, beforeEffect) {
        guard();
        const replay = lookup();
        if (replay) return view(replay);
        if (!isDeepStrictEqual(bot(botSlug), targetBot)) throw new TobError('stale-profile');
        if (owner(() => deps.management.snapshot(channelId)).channelFingerprint !== expectedChannel)
          throw new TobError('stale-channel');
        beforeEffect?.();
        return view(owner(() => deps.management.invite(input, operationKey)));
      },
    };
  };
}
