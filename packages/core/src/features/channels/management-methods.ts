import {
  asNonBlank,
  asObject,
  invalidInput,
  unavailable,
  unknownBot,
  unknownChannel,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { ChannelManagementError, type ChannelManagementResult } from '../../channels/management.js';
import { type GroupDisbandResult } from '../../purge/contracts.js';
import type { GroupMemberWakePolicy } from '../../channels/channel.js';
import { externalMemberWake, messagingDefaultsPlatform } from '../../messaging/defaults.js';
import { z } from 'zod';
import { isGroupAvatar, type ChannelRecord } from '../../channels/channel.js';
import { isValidSlug } from '../../bots/slug.js';
import type { BridgeMethodsDeps, PersonaBotDetail, ChannelListItem } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import { purgeFailure } from '../profile-storage/methods.js';

export interface ChannelsManagementAdapterMethods {
  channelCreate(
    payload: unknown,
  ): BridgeResult<{ channel: ChannelRecord } | ChannelManagementResult>;
  channelRename(payload: unknown): BridgeResult<{ channel: ChannelRecord; bot?: PersonaBotDetail }>;
  channelGroupAvatarSet(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupInvite(
    payload: unknown,
  ): BridgeResult<{ channel: ChannelRecord } | ChannelManagementResult>;
  channelGroupInviteCancel(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupJoinDecide(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupMemberRemove(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupSendReview(payload: unknown): BridgeResult<{ enabled: boolean }>;
  channelGroupWakePolicies(payload: unknown): BridgeResult<{ members: GroupMemberWakePolicy[] }>;
  channelGroupWakeSet(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupDelete(payload: unknown): BridgeResult<{ deleted: boolean } & GroupDisbandResult>;
}

export function createChannelsManagementAdapterMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  globalRegistry: BridgeMethodsDeps['registry'],
  channelView: (channel: ChannelRecord) => ChannelListItem,
  detailOf: (record: PersonaBotRecord) => { bot: PersonaBotDetail },
): ChannelsManagementAdapterMethods {
  return {
    channelCreate(payload) {
      const source = asObject(payload);
      const name = asNonBlank(source, 'name');
      if (name === undefined) return invalidInput('name is required');
      const members = source['members'];
      if (
        !Array.isArray(members) ||
        !members.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
      ) {
        return invalidInput('members must be an array of PersonaBot IDs');
      }
      const operationKey = source['operationKey'];
      if (operationKey !== undefined && (typeof operationKey !== 'string' || !operationKey.trim()))
        return invalidInput('operationKey must be a nonempty string');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.create(
            human,
            { name, members: [...members] },
            operationKey,
          );
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (operationKey !== undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel management is unavailable',
          },
        };
      if (members.some((slug) => deps.tob?.isTob(slug)))
        return {
          ok: false,
          error: {
            code: 'protected-bot',
            message: 'Tob cannot join group Channels',
          },
        };
      const channel = deps.channels.createGroup(human, {
        name,
        members: [...members],
      });
      return { ok: true, value: { channel: channelView(channel) } };
    },
    channelRename(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const name = asNonBlank(source, 'name')?.trim();
      if (channelId === undefined) return invalidInput('channelId is required');
      if (name === undefined) return invalidInput('name is required');
      const existing = deps.channels.get(channelId);
      if (existing === undefined) return unknownChannel(channelId);
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (expectedChannel !== undefined && existing.type !== 'group')
        return {
          ok: false,
          error: {
            code: 'not-group-channel',
            message: 'Group Channel required for reviewed rename',
          },
        };
      if (existing.type === 'group' && deps.channelManagement) {
        try {
          const result = deps.channelManagement.rename(human, {
            channelId,
            name,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      if (existing.type === 'dm' && existing.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');

      let bot: PersonaBotDetail | undefined;
      if (existing.type === 'dm' && existing.botSlug !== undefined) {
        if (deps.registry.get(existing.botSlug) === undefined) return unknownBot(existing.botSlug);
        const result = deps.registry.update(existing.botSlug, {
          displayName: name,
        });
        if (!result.ok) return unknownBot(existing.botSlug);
        bot = detailOf(result.record).bot;
      }
      const channel = deps.channels.rename(human, channelId, name);
      if (channel === undefined) return unknownChannel(channelId);
      return {
        ok: true,
        value: {
          channel: channelView(channel),
          ...(bot === undefined ? {} : { bot }),
        },
      };
    },
    channelGroupAvatarSet(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const avatar = source['avatar'];
      if (channelId === undefined || (avatar !== null && !isGroupAvatar(avatar)))
        return invalidInput('valid channelId and Group avatar are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.setAvatar(human, {
            channelId,
            avatar,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      try {
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.setGroupAvatar(human, channelId, avatar)),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupInvite(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (channelId === undefined || botSlug === undefined || !isValidSlug(botSlug))
        return invalidInput('valid channelId and botSlug are required');
      const operationKey = source['operationKey'];
      const expectedChannel = source['expectedChannel'];
      if (operationKey !== undefined && (typeof operationKey !== 'string' || !operationKey.trim()))
        return invalidInput('operationKey must be a nonempty string');
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !expectedChannel.trim())
      )
        return invalidInput('expectedChannel must be a nonempty string');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.invite(
            human,
            {
              channelId,
              botSlug,
              ...(expectedChannel === undefined ? {} : { expectedChannel }),
            },
            operationKey,
          );
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (operationKey !== undefined || expectedChannel !== undefined)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Channel management is unavailable',
          },
        };
      if (deps.tob?.isTob(botSlug))
        return {
          ok: false,
          error: {
            code: 'protected-bot',
            message: 'Tob cannot join group Channels',
          },
        };
      const bot = globalRegistry.get(botSlug);
      const channel = deps.channels.get(channelId);
      if (bot === undefined || bot.paused === true) return unknownBot(botSlug);
      if (channel?.type !== 'group') return unknownChannel(channelId);
      const dm = deps.channels.getOrCreateDm(human, bot.slug, bot.displayName);
      if (dm === undefined) return invalidInput('Invitee DM is unavailable');
      try {
        const invitation = deps.channels.inviteGroupBot({
          channelId,
          inviterHuman: true,
          targetBotSlug: bot.slug,
          targetBotCreatedAt: bot.createdAt,
          targetDmChannelId: dm.id,
        });
        deps.runtime?.admitGroupInvitation(dm.id, invitation.id);
        return {
          ok: true,
          value: { channel: channelView(deps.channels.get(channelId)!) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupInviteCancel(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const invitationId = asNonBlank(source, 'invitationId');
      if (channelId === undefined || invitationId === undefined)
        return invalidInput('channelId and invitationId are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.cancelInvite(human, {
            channelId,
            invitationId,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      try {
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.cancelGroupInvite(channelId, invitationId)),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupJoinDecide(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const requestId = asNonBlank(source, 'requestId');
      const accept = source['accept'];
      if (channelId === undefined || requestId === undefined || typeof accept !== 'boolean')
        return invalidInput('channelId, requestId and accept are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.decideJoin(human, {
            channelId,
            requestId,
            accept,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      const channel = deps.channels.get(channelId);
      const request = channel?.joinRequests?.find((item) => item.id === requestId);
      if (channel?.type !== 'group' || request === undefined)
        return invalidInput('Pending Group join request not found');
      if (accept && deps.tob?.isTob(request.requesterBotSlug))
        return {
          ok: false,
          error: {
            code: 'protected-bot',
            message: 'Tob cannot join group Channels',
          },
        };
      if (request.status !== 'pending')
        return request.status === (accept ? 'accepted' : 'declined')
          ? { ok: true, value: { channel: channelView(channel) } }
          : invalidInput('Group join request is no longer pending');
      const requester = deps.registry.get(request.requesterBotSlug);
      if (
        requester === undefined ||
        requester.paused === true ||
        requester.createdAt !== request.requesterBotCreatedAt
      )
        return invalidInput('Requesting PersonaBot is no longer active');
      const dm = deps.channels.getOrCreateDm(human, requester.slug, requester.displayName);
      if (dm === undefined) return invalidInput('Requester DM is unavailable');
      try {
        const decided = deps.channels.decideGroupJoin({
          channelId,
          requestId,
          accept,
          decidedBy: 'human',
          requesterBotCreatedAt: requester.createdAt,
          requesterDmChannelId: dm.id,
        });
        if (decided.notified) deps.runtime?.admitGroupJoinDecision?.(dm.id, request.id);
        return { ok: true, value: { channel: channelView(decided.channel) } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupMemberRemove(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (channelId === undefined || botSlug === undefined || !isValidSlug(botSlug))
        return invalidInput('valid channelId and botSlug are required');
      const expectedChannel = source['expectedChannel'];
      if (
        expectedChannel !== undefined &&
        (typeof expectedChannel !== 'string' || !/^[a-f0-9]{64}$/u.test(expectedChannel))
      )
        return invalidInput('expectedChannel must be an observed Channel fingerprint');
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.removeMember(human, {
            channelId,
            botSlug,
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      try {
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.removeGroupMember(channelId, botSlug)),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupSendReview(payload) {
      const parsed = z
        .object({
          channelId: z.string().min(1),
          enabled: z.boolean().optional(),
        })
        .strict()
        .safeParse(payload);
      if (!parsed.success) return invalidInput('Invalid send review configuration');
      const { channelId, enabled } = parsed.data;
      const channel = deps.channels.get(channelId);
      if (
        channel?.type !== 'group' ||
        channel.deletedAt ||
        !deps.channels
          .listHumanMembers(human, channelId)
          .some((member) => member.humanId === human.humanId)
      )
        return invalidInput('A local Group with the current Human is required');
      const review = deps.runtime?.groupSendReview;
      if (!review)
        return {
          ok: false,
          error: {
            code: 'unavailable',
            message: 'Group send review is unavailable on this Host',
          },
        };
      if (enabled !== undefined) review.configure(channelId, enabled);
      return { ok: true, value: { enabled: review.enabled(channelId) } };
    },
    channelGroupWakePolicies(payload) {
      const parsed = z.object({ channelId: z.string().min(1) }).safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group channel');
      try {
        const channel = deps.channels.get(parsed.data.channelId);
        if (
          channel?.type !== 'group' ||
          channel.deletedAt ||
          !deps.channels
            .listHumanMembers(human, channel.id)
            .some((member) => member.humanId === human.humanId)
        )
          return invalidInput('Group channel unavailable');
        return {
          ok: true,
          value: {
            members: channel.members.map((botSlug) => ({
              botSlug,
              inherited: channel.wakePolicies?.[botSlug] === undefined,
              policy: deps.channels.getGroupWakePolicy(channel.id, botSlug),
              ...(deps.externalMessaging
                ? {
                    externals: messagingDefaultsPlatform.options
                      .filter((platform) => platform !== 'weixin' && platform !== 'qq')
                      .map((platform) => ({
                        platform,
                        ...externalMemberWake(
                          channel,
                          botSlug,
                          deps.sourcePolicy
                            ?.list(botSlug)
                            .find((p) => p.sourceClass === 'group-ordinary'),
                          deps.externalMessaging!.defaults(platform),
                        ),
                      })),
                    external: {
                      platform: 'feishu' as const,
                      ...externalMemberWake(
                        channel,
                        botSlug,
                        deps.sourcePolicy
                          ?.list(botSlug)
                          .find((p) => p.sourceClass === 'group-ordinary'),
                        deps.externalMessaging.defaults(),
                      ),
                    },
                  }
                : {}),
            })),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupWakeSet(payload) {
      const parsed = z
        .object({
          channelId: z.string().min(1),
          botSlug: z.string().min(1),
          mode: z.enum(['all', 'mentions', 'digest', 'silent']),
          count: z.number().int().min(1).max(100),
          intervalSeconds: z.number().int().min(1).max(3600),
          inherit: z.boolean().optional(),
          expectedChannel: z
            .string()
            .regex(/^[a-f0-9]{64}$/u)
            .optional(),
        })
        .safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group wake policy');
      const { channelId, botSlug, mode, count, intervalSeconds, inherit, expectedChannel } =
        parsed.data;
      if (deps.channelManagement) {
        try {
          const result = deps.channelManagement.setWake(human, {
            channelId,
            botSlug,
            mode,
            count,
            intervalSeconds,
            ...(inherit === undefined ? {} : { inherit }),
            ...(expectedChannel === undefined ? {} : { expectedChannel }),
          });
          return {
            ok: true,
            value: { ...result, channel: channelView(result.channel) },
          };
        } catch (error) {
          if (error instanceof ChannelManagementError)
            return {
              ok: false,
              error: { code: error.code, message: error.message },
            };
          throw error;
        }
      }
      if (expectedChannel !== undefined) return unavailable();
      const bot = deps.registry.get(botSlug);
      if (bot === undefined || bot.paused === true) return unknownBot(botSlug);
      try {
        const group = deps.channels.get(channelId);
        if (
          group?.type !== 'group' ||
          group.deletedAt ||
          !deps.channels
            .listHumanMembers(human, channelId)
            .some((member) => member.humanId === human.humanId)
        )
          return invalidInput('Group channel unavailable');
        return {
          ok: true,
          value: {
            channel: channelView(
              deps.channels.setGroupWakePolicy(
                channelId,
                botSlug,
                {
                  mode,
                  count,
                  intervalSeconds,
                  ...(inherit === undefined ? {} : { inherit }),
                },
                { kind: 'human' },
              ),
            ),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupDelete(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const purge = deps.contentPurge;
      if (!purge) return unavailable();
      let ended: boolean;
      try {
        ended = purge.history(human).some((channel) => channel.id === channelId);
      } catch (error) {
        return purgeFailure(error, 'Channel history is unavailable');
      }
      if (!ended)
        try {
          deps.channels.deleteGroup(channelId);
          deps.externalMessaging?.inbound.endChannel(channelId);
          void deps.runtime
            ?.endGroup?.(channelId)
            .catch((error: unknown) =>
              deps.warn?.(`botharness.group_disband.stop_turns_failed error=${String(error)}`),
            );
          deps.toolApproval?.cancelChannel(channelId);
          deps.userQuestions?.cancelChannel(channelId);
        } catch (error) {
          return invalidInput(String(error));
        }
      void deps.roster
        .channelForget(channelId)
        .catch((error: unknown) =>
          deps.warn?.(`botharness.group_disband.roster_failed error=${String(error)}`),
        );
      try {
        return {
          ok: true,
          value: { deleted: true, ...purge.disband(human, channelId) },
        };
      } catch (error) {
        return purgeFailure(error, 'The group was disbanded, but its messages were not deleted');
      }
    },
  };
}
