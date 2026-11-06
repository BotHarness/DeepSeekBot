import type { RosterBot, RosterChannel } from '../../host/client';
import { useMinuteClock } from '../minute-clock';
import { useStrings } from '../strings';
import { headerStatus } from './header-status';

export function useHeaderStatus(
  bot: RosterBot | undefined,
  channel: RosterChannel | undefined,
  members: readonly RosterBot[] = [],
) {
  const t = useStrings();
  const now = useMinuteClock();
  const status = headerStatus(bot, channel, members);
  const at = status.at === undefined ? NaN : Date.parse(status.at);
  const label =
    status.state === 'paused'
      ? t.paused
      : status.state !== 'idle'
        ? t.state[status.state]
        : Number.isFinite(at)
          ? t.lastChatActivity(t.ago(Math.max(0, Math.floor((now.getTime() - at) / 60_000))))
          : bot === undefined
            ? t.members(status.count)
            : t.state.idle;
  const states = ['blocked', 'waiting', 'working', 'thinking'] as const;
  const aggregate =
    status.bots.length > 1
      ? states
          .flatMap((state) => {
            const count = status.bots.filter((member) => member.state === state).length;
            return count === 0 ? [] : [`${count} ${t.state[state]}`];
          })
          .join(' · ')
      : label;
  return { label: aggregate, bots: status.bots };
}
