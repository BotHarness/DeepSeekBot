import type { RosterBot, RosterChannel } from '../../host/client';

export function headerStatus(
  bot: RosterBot | undefined,
  channel: RosterChannel | undefined,
  members: readonly RosterBot[],
) {
  if (bot !== undefined) {
    return {
      bots: [] as readonly RosterBot[],
      state: bot.paused ? ('paused' as const) : bot.state,
      at: bot.previewAt,
      count: 0,
    };
  }
  const active = members.filter((member) => !member.paused && member.state !== 'idle');
  const priority = ['blocked', 'waiting', 'working', 'thinking'] as const;
  return {
    bots: active,
    state:
      priority.find((state) => active.some((member) => member.state === state)) ??
      ('idle' as const),
    at: channel?.previewAt,
    count: channel?.memberCount ?? 0,
  };
}
