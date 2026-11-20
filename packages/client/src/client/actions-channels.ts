import {
  createGroupChannel,
  inviteGroupBot,
  setGroupAvatar as setGroupAvatarViaBridge,
  setChannelHumanName,
  cancelGroupInvitation,
  decideGroupJoin,
  removeGroupMember,
  setGroupWakePolicy,
  loadGroupWakePolicies,
  deleteGroupChannel,
  renameChannel as renameChannelViaBridge,
  type BridgeCall,
} from './bridge.js';
import type { ChannelSummary, ClientStore } from './store.js';
import { reportFailure } from './diagnostic-log.js';
import type { BridgeActions } from './actions.js';
import type { createRosterActions } from './actions-roster.js';
import type { createConversationActions } from './actions-conversation.js';

export interface ChannelActions {
  createGroup(
    name: string,
    sectionId?: string,
    operationKey?: string,
  ): Promise<ChannelSummary | undefined>;
  renameChannel(channelId: string, name: string): Promise<boolean>;
  setHumanNickname(channelId: string, nickname: string | null): Promise<boolean>;
  setGroupAvatar(channelId: string, avatar: string | null): Promise<boolean>;
  inviteGroupBot(channelId: string, botSlug: string): Promise<boolean>;
  cancelGroupInvitation(channelId: string, invitationId: string): Promise<boolean>;
  decideGroupJoin(channelId: string, requestId: string, accept: boolean): Promise<boolean>;
  removeGroupMember(channelId: string, botSlug: string): Promise<boolean>;
  setGroupWakePolicy(
    channelId: string,
    botSlug: string,
    policy: {
      mode: 'all' | 'mentions' | 'digest' | 'silent';
      count: number;
      intervalSeconds: number;
      inherit?: boolean;
    },
  ): Promise<boolean>;
  deleteGroupChannel(channelId: string): Promise<boolean>;
}

export function createChannelActions(
  call: BridgeCall,
  clientStore: ClientStore,
  getActions: () => Pick<BridgeActions, 'load'>,
  placeCreatedChannelFirst: ReturnType<typeof createRosterActions>['placeCreatedChannelFirst'],
  openChannelById: ReturnType<typeof createConversationActions>['openChannelById'],
) {
  return {
    async createGroup(name, sectionId, operationKey) {
      const channel = await createGroupChannel(call, name, undefined, operationKey);
      clientStore.upsertChannel(channel);
      await placeCreatedChannelFirst(channel.id, sectionId);
      await openChannelById(channel.id);
      return channel;
    },
    async setHumanNickname(channelId, nickname) {
      try {
        const channel = await setChannelHumanName(call, channelId, nickname);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch {
        return false;
      }
    },
    async renameChannel(channelId, name) {
      try {
        const result = await renameChannelViaBridge(call, channelId, name);
        clientStore.upsertChannel(result.channel);
        if (result.bot !== undefined) clientStore.upsertBot(result.bot);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId) {
          clientStore.setConversation({ channel: result.channel });
        }
        return true;
      } catch (error) {
        reportFailure('channel-rename-failed', 'channel rename failed', error);
        return false;
      }
    },
    async setGroupAvatar(channelId, avatar) {
      try {
        const channel = await setGroupAvatarViaBridge(call, channelId, avatar);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        reportFailure('group-avatar-update-failed', 'Group avatar update failed', error);
        return false;
      }
    },
    async inviteGroupBot(channelId, botSlug) {
      try {
        const channel = await inviteGroupBot(call, channelId, botSlug);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        reportFailure('group-invitation-failed', 'Group invitation failed', error);
        return false;
      }
    },
    async cancelGroupInvitation(channelId, invitationId) {
      try {
        const channel = await cancelGroupInvitation(call, channelId, invitationId);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        reportFailure(
          'group-invitation-cancellation-failed',
          'Group invitation cancellation failed',
          error,
        );
        return false;
      }
    },
    async decideGroupJoin(channelId, requestId, accept) {
      try {
        const channel = await decideGroupJoin(call, channelId, requestId, accept);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        reportFailure('group-join-decision-failed', 'Group join decision failed', error);
        return false;
      }
    },
    async removeGroupMember(channelId, botSlug) {
      try {
        const channel = await removeGroupMember(call, channelId, botSlug);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        reportFailure('group-member-removal-failed', 'Group member removal failed', error);
        return false;
      }
    },
    groupWakePolicies(channelId) {
      return loadGroupWakePolicies(call, channelId);
    },
    async setGroupWakePolicy(channelId, botSlug, policy) {
      try {
        const channel = await setGroupWakePolicy(call, channelId, botSlug, policy);
        clientStore.upsertChannel(channel);
        if (clientStore.getSnapshot().conversation.channel?.id === channelId)
          clientStore.setConversation({ channel });
        return true;
      } catch (error) {
        reportFailure('group-wake-policy-update-failed', 'Group wake policy update failed', error);
        return false;
      }
    },
    async deleteGroupChannel(channelId) {
      try {
        await deleteGroupChannel(call, channelId);
      } catch (error) {
        reportFailure('group-deletion-failed', 'Group deletion failed', error);
        return false;
      }
      const snapshot = clientStore.getSnapshot();
      if (snapshot.conversation.channel?.id === channelId) clientStore.select(undefined);
      clientStore.setRoster(
        snapshot.bots,
        snapshot.channels.filter((channel) => channel.id !== channelId),
      );
      try {
        await getActions().load();
      } catch (error) {
        reportFailure('group-deletion-refresh-failed', 'Group deletion refresh failed', error);
      }
      return true;
    },
  } satisfies ChannelActions & Pick<BridgeActions, 'groupWakePolicies'>;
}
