import { computerEnvironmentKey } from '../../host/conversation-environments';
import { tobMode } from '../design/tokens';

export type TobComputer = { hostId: string; tob: string | null | undefined };

type RosterHost = {
  saved: { hostId: string };
  snapshot: {
    roster?: { bots: readonly { slug: string; tob?: boolean | undefined }[] } | undefined;
  };
};

export function tobComputer(host: RosterHost): TobComputer {
  const roster = host.snapshot.roster;
  return {
    hostId: host.saved.hostId,
    tob:
      roster === undefined
        ? undefined
        : (roster.bots.find((bot) => bot.tob === true)?.slug ?? null),
  };
}

function hasTob(computer: TobComputer): boolean {
  return computer.tob !== null;
}

export function tobComputers(computers: readonly TobComputer[]): TobComputer[] {
  return computers.filter(hasTob);
}

export function tobModeHostId(
  filter: string,
  computers: readonly TobComputer[],
  recentHostIds: readonly string[],
  currentHostId: string | undefined,
): string | undefined {
  const eligible = tobComputers(computers);
  if (filter !== 'all')
    return eligible.find((computer) => computerEnvironmentKey(computer.hostId) === filter)?.hostId;
  const order = [
    ...recentHostIds,
    ...(currentHostId === undefined ? [] : [currentHostId]),
    ...eligible.map((computer) => computer.hostId),
  ];
  return order.find((hostId) => eligible.some((computer) => computer.hostId === hostId));
}

export function tobModeOffset(translationY: number): number {
  'worklet';
  return Math.min(0, translationY);
}

export function closesTobMode(translationY: number, velocityY: number): boolean {
  'worklet';
  if (velocityY > tobMode.flick) return false;
  return velocityY < -tobMode.flick || translationY <= -tobMode.commit;
}
