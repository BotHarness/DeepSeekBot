import type {
  RemoteAccessBinding,
  RemoteAccessCondition,
  RemoteAccessPolicy,
} from '@deepseek-ai/dsh-api-remote-access';
import { humanContext } from '../humans/context.js';
import type { MemberPrincipal, TeamService } from './service.js';

export const MEMBER_GLOBAL_METHODS = [
  'teamMode',
  'memberPasswordChange',
  'publicChannels',
  'publicChannelJoin',
  'channels',
  'channelListChanges',
  'channelUnreadCounts',
  'list',
  'rosterGet',
  'followRoster',
  'humanIdentity',
  'ping',
] as const;
export const MEMBER_CHANNEL_METHODS = [
  'channelGet',
  'channelMessages',
  'channelTimeline',
  'channelReadPosition',
  'channelMarkRead',
  'channelSend',
  'channelSendStatus',
  'channelReact',
  'channelSearch',
  'followChannel',
  'channelJournalPage',
  'channelFilesPage',
  'channelChanges',
] as const;
const channelMethods = new Set<string>(MEMBER_CHANNEL_METHODS);
const allowed = new Set<string>([...MEMBER_GLOBAL_METHODS, ...MEMBER_CHANNEL_METHODS]);

export function memberPolicy(team: TeamService): RemoteAccessPolicy<MemberPrincipal> {
  return {
    bindings(principal): readonly RemoteAccessBinding[] {
      if (!team.resolve(principal)) return [];
      const condition: RemoteAccessCondition<'global'> = (request) => {
        const method = request.action.slice('botharness/'.length);
        const member = team.member(principal.humanId);
        if (member?.mustChangePassword && !['teamMode', 'memberPasswordChange'].includes(method))
          return { kind: 'deny', reason: 'password-change-required' };
        if (channelMethods.has(method) && request.args !== undefined) {
          const id = request.args['channelId'];
          if (typeof id !== 'string' || !team.belongs(humanContext(principal.humanId), id))
            return { kind: 'deny', reason: 'channel-not-found' };
        }
        return { kind: 'allow' };
      };
      return [
        {
          resource: { kind: 'global' },
          role: {
            name: 'botharness-member',
            resource: 'global',
            actions: [...allowed].map((method) => `botharness/${method}` as const),
          },
          condition,
        },
      ];
    },
  };
}
