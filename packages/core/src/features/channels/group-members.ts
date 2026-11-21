import { z } from 'zod';
import type {
  GroupBotCandidate,
  GroupMemberOutcome,
  GroupMemberPickerResult,
  GroupMembersAddResult,
} from '@botharness/host-protocol/group-members';
import { invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import { isValidSlug } from '../../bots/slug.js';
import { TeamError } from '../../team/error.js';
import type { ChannelsManagementAdapterMethods } from './management-methods.js';

const id = z.string().trim().min(1).max(200);
const pickerInput = z.object({
  channelId: id.optional(),
  query: z.string().trim().max(200).default(''),
});
const targetsInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('human'), id }),
  z.object({
    kind: z.literal('bot'),
    id: id.refine(isValidSlug),
    operationKey: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u),
  }),
]);
const addInput = z.object({ channelId: id, targets: z.array(targetsInput).min(1).max(100) });
const missingGroup = (): BridgeResult<never> => ({
  ok: false,
  error: { code: 'channel-not-found', message: 'Group Channel unavailable' },
});

export interface GroupMemberMethods {
  channelGroupMemberPicker(payload: unknown): BridgeResult<GroupMemberPickerResult>;
  channelGroupMembersAdd(payload: unknown): BridgeResult<GroupMembersAddResult>;
}

export function createGroupMemberMethods(
  human: HumanContext,
  { channels, registry, team, tob }: BridgeMethodsDeps,
  invite: ChannelsManagementAdapterMethods['channelGroupInvite'],
): GroupMemberMethods {
  const group = (id: string) => {
    const channel = channels.get(id);
    if (
      channel?.type !== 'group' ||
      channel.deletedAt ||
      (team && !team.channelAccess.canRead(human, id, true))
    )
      return undefined;
    return channel;
  };
  const can = (channelId: string, policy: 'addBots' | 'addMembers') => {
    try {
      team?.channelAccess.requirePolicy(human, channelId, policy);
      return true;
    } catch (error) {
      if (error instanceof TeamError) return false;
      throw error;
    }
  };

  return {
    channelGroupMemberPicker(payload) {
      const parsed = pickerInput.safeParse(payload);
      if (!parsed.success) return invalidInput('Invalid Group member search');
      const { channelId, query } = parsed.data;
      const channel = channelId === undefined ? undefined : group(channelId);
      if (channelId !== undefined && !channel) return missingGroup();
      if (channelId === undefined) team?.roles.require(human, 'channels.create');
      const canAddBots = channelId === undefined || can(channelId, 'addBots');
      const canAddPeople =
        team?.enabled() === true && (channelId === undefined || can(channelId, 'addMembers'));
      const people =
        canAddPeople && team
          ? (channelId === undefined
              ? team.channelAccess.createMemberCandidates(human, query)
              : team.channelAccess.memberCandidates(human, channelId, query)
            ).map(({ humanId, displayName, username }) => ({
              id: humanId,
              displayName,
              ...(username === null ? {} : { username }),
            }))
          : [];
      const bots: GroupBotCandidate[] = [];
      const match = query.toLowerCase();
      if (canAddBots) {
        const pending = new Set(
          channel?.invitations
            ?.filter((invite) => invite.status === 'pending')
            .map((invite) => invite.targetBotSlug),
        );
        const members = new Set(channel?.members);
        for (const bot of registry.list()) {
          if (
            bot.paused ||
            tob?.isTob(bot.slug) ||
            members.has(bot.slug) ||
            pending.has(bot.slug) ||
            (!bot.displayName.toLowerCase().includes(match) && !bot.slug.includes(match))
          )
            continue;
          const access = team?.bots.groupInvitationCandidate(human, bot.slug, channelId);
          if (team && !access) continue;
          const candidate = { id: bot.slug, displayName: bot.displayName };
          bots.push(
            access?.requiredHumanId === undefined
              ? candidate
              : {
                  ...candidate,
                  requiresOwner: true,
                  ...(canAddPeople ? { requiredHumanId: access.requiredHumanId } : {}),
                },
          );
          if (bots.length === 100) break;
        }
      }
      return { ok: true, value: { canAddPeople, canAddBots, people, bots } };
    },
    channelGroupMembersAdd(payload) {
      const parsed = addInput.safeParse(payload);
      if (!parsed.success) return invalidInput('Choose between 1 and 100 Group member targets');
      const { channelId, targets } = parsed.data;
      if (new Set(targets.map(({ kind, id }) => kind + ':' + id)).size !== targets.length)
        return invalidInput('Each Group member target must be unique');
      if (!group(channelId)) return missingGroup();
      const results: GroupMemberOutcome[] = [];
      for (const target of targets) {
        if (target.kind !== 'human') continue;
        const identity = { kind: target.kind, id: target.id };
        try {
          if (!team?.enabled()) throw new TeamError('team-mode-off');
          team.channelAccess.addMember(human, channelId, { humanId: target.id });
          results.push({ ...identity, status: 'joined' });
        } catch (error) {
          if (!(error instanceof TeamError)) throw error;
          results.push({ ...identity, status: 'failed', code: error.code });
        }
      }
      for (const target of targets) {
        if (target.kind !== 'bot') continue;
        const identity = { kind: target.kind, id: target.id };
        try {
          const invited = invite({
            channelId,
            botSlug: target.id,
            operationKey: target.operationKey,
          });
          if (!invited.ok) {
            results.push({ ...identity, status: 'failed', code: invited.error.code });
            continue;
          }
          const channel = invited.value.channel;
          if (channel.members.includes(target.id)) results.push({ ...identity, status: 'joined' });
          else if (
            channel.invitations?.some(
              (entry) => entry.targetBotSlug === target.id && entry.status === 'pending',
            )
          )
            results.push({ ...identity, status: 'pending' });
          else results.push({ ...identity, status: 'failed', code: 'group-invite-unavailable' });
        } catch (error) {
          if (!(error instanceof TeamError)) throw error;
          results.push({ ...identity, status: 'failed', code: error.code });
        }
      }
      return { ok: true, value: { results } };
    },
  };
}
