import { computerEnvironmentKey } from '../../host/conversation-environments';
import { topEntrance } from '../design/tokens';

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

export function tobModeHostId(
  filter: string,
  computers: readonly TobComputer[],
  recentHostIds: readonly string[],
  currentHostId: string | undefined,
): string | undefined {
  const paired = computers.map((computer) => computer.hostId);
  const selected = paired.find((hostId) => computerEnvironmentKey(hostId) === filter);
  if (selected !== undefined) return selected;
  const order = [
    ...recentHostIds,
    ...(currentHostId === undefined ? [] : [currentHostId]),
    ...paired,
  ];
  return order.find((hostId) => paired.includes(hostId));
}

export type TobModeHref = {
  pathname: '/dm-top/[slug]';
  params: { slug: string; hostId: string };
};

export function tobModeHref(
  hostId: string | undefined,
  computers: readonly TobComputer[],
): TobModeHref | undefined {
  const slug = computers.find((computer) => computer.hostId === hostId)?.tob;
  if (hostId === undefined || typeof slug !== 'string') return undefined;
  return { pathname: '/dm-top/[slug]', params: { slug, hostId } };
}

export const topEntranceScreenOptions = {
  headerShown: false,
  presentation: 'transparentModal',
  animation: 'none',
  gestureEnabled: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

export function topEntranceDrag(translationX: number): number {
  'worklet';
  return Math.max(0, translationX);
}

export function closesTopEntrance(translationX: number, velocityX: number): boolean {
  'worklet';
  if (velocityX < -topEntrance.flick) return false;
  return velocityX > topEntrance.flick || translationX >= topEntrance.commit;
}
