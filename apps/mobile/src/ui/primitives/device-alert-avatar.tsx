import type { LocalApprovalAlert } from '../../host/device-alerts';
import { useHostSessions } from '../../host/host-session';
import { BotAvatar } from '../bot-avatar';
import { CONVERSATION_AVATAR } from '../chat/avatar-slot';
import { GroupMark } from '../chat/group-mark';
import { radius } from '../design/tokens';

export function DeviceAlertAvatar({ alert }: { alert: LocalApprovalAlert }) {
  const hosts = useHostSessions();
  if (alert.members || !alert.data.channelId) return null;
  const roster = hosts.find((host) => host.saved.hostId === alert.data.hostId)?.snapshot.roster;
  const bot = roster?.bots.find((entry) => entry.dmChannelId === alert.data.channelId);
  if (bot)
    return <BotAvatar bot={bot} size={CONVERSATION_AVATAR} ring={false} corner={radius.md} />;
  const channel = roster?.channels.find((entry) => entry.id === alert.data.channelId);
  return (
    <GroupMark
      avatar={channel?.avatar}
      size={CONVERSATION_AVATAR}
      corner={radius.md}
      variant="title"
      strong={false}
    />
  );
}
