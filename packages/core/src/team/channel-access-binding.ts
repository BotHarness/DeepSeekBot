import type { ChannelStore } from '../channels/store.js';
import { TeamError } from '../team-policy/error.js';
import { channelBotReception } from './channel-bots.js';
import type { TeamService } from './service.js';

export function bindTeamChannelAccess(
  channels: ChannelStore,
  team: Pick<TeamService, 'enabled' | 'channelAccess' | 'bots' | 'approvals'>,
): void {
  channels.bindHumanAccess?.({
    botReception: channelBotReception,
    addInitialMembers: (db, human, channelId, humanIds, joinedAt) => {
      if (!team.enabled()) throw new TeamError('team-mode-off');
      return team.channelAccess.addInitialMembers(db, human, channelId, humanIds, joinedAt);
    },
    searchText: (human, channelId, messageId, text) =>
      team.approvals.searchText(human, channelId, messageId, text),
    canRead: (human, id) => team.channelAccess.canRead(human, id),
    requirePolicy: (human, id, key) => team.channelAccess.requirePolicy(human, id, key),
    requireBotPost: (slug, channel) =>
      team.bots.available && team.bots.requireChannel(slug, channel, true),
    requireBotJoin: (slug, id) => {
      if (team.bots.available) team.bots.requireJoin(slug, id);
    },
    requireDm: (human, slug) => team.bots.available && team.bots.requireReach(human, slug),
    requirePost: (human, id, all, message) => {
      const decision =
        message?.toolApprovalDecision ??
        message?.userQuestionResolution ??
        message?.privateInputResolution;
      if (
        !all &&
        decision?.decidedBy?.humanId === human.humanId &&
        message?.replyTo === decision.requestMessageId
      ) {
        team.approvals.requireRequest(human, id, decision.requestMessageId);
        return;
      }
      const channel = channels.get(id);
      if (channel?.botSlug && team.bots.available) team.bots.requireDmPost(human, channel);
      if (channel?.type !== 'group' && !channel?.humanParticipants) return;
      team.channelAccess.requirePolicy(human, id, 'post');
      if (all) team.channelAccess.requirePolicy(human, id, 'mentionAll');
    },
  });
}
