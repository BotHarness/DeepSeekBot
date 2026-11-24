import { computerEnvironmentKey } from '../../host/conversation-environments';

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
  pathname: '/dm/[slug]' | '/dm-tob/[slug]';
  params: { slug: string; hostId: string; compose: '1' };
};

export function tobModeHref(
  hostId: string | undefined,
  computers: readonly TobComputer[],
  os: 'ios' | 'android' | 'web',
): TobModeHref | undefined {
  const slug = computers.find((computer) => computer.hostId === hostId)?.tob;
  if (hostId === undefined || typeof slug !== 'string') return undefined;
  return {
    pathname: os === 'android' ? '/dm-tob/[slug]' : '/dm/[slug]',
    params: { slug, hostId, compose: '1' },
  };
}

export const tobEntranceScreenOptions = {
  headerShown: false,
  presentation: 'transparentModal',
  animation: 'none',
  gestureEnabled: false,
  contentStyle: { backgroundColor: 'transparent' },
} as const;

export type EntranceRect = { x: number; y: number; width: number; height: number };

export function containerTransformFrame(
  origin: EntranceRect | undefined,
  screen: { width: number; height: number },
  progress: number,
): EntranceRect & { radius: number } {
  'worklet';
  const from = origin ?? {
    x: screen.width * 0.05,
    y: screen.height * 0.05,
    width: screen.width * 0.9,
    height: screen.height * 0.9,
  };
  const p = Math.min(1, Math.max(0, progress));
  const mix = (a: number, b: number) => a + (b - a) * p;
  return {
    x: mix(from.x, 0),
    y: mix(from.y, 0),
    width: mix(from.width, screen.width),
    height: mix(from.height, screen.height),
    radius: mix(origin === undefined ? 0 : from.height / 2, 0),
  };
}

export type ContainerTransform = {
  container: { translateX: number; translateY: number; scaleX: number; scaleY: number };
  radius: number;
  content: { translateX: number; translateY: number; scaleX: number; scaleY: number };
};

export function containerTransform(
  origin: EntranceRect | undefined,
  screen: { width: number; height: number },
  progress: number,
): ContainerTransform {
  'worklet';
  const frame = containerTransformFrame(origin, screen, progress);
  const scaleX = frame.width / screen.width;
  const scaleY = frame.height / screen.height;
  return {
    container: {
      translateX: frame.x + frame.width / 2 - screen.width / 2,
      translateY: frame.y + frame.height / 2 - screen.height / 2,
      scaleX,
      scaleY,
    },
    radius: frame.radius / Math.sqrt(scaleX * scaleY),
    content: {
      translateX: (screen.width / 2 - frame.x - frame.width / 2) / scaleX,
      translateY: (frame.height / 2 - screen.height / 2) / scaleY,
      scaleX: 1 / scaleX,
      scaleY: 1 / scaleY,
    },
  };
}

export function containerTransformFade(progress: number): { content: number; origin: number } {
  'worklet';
  const p = Math.min(1, Math.max(0, progress));
  return { content: Math.min(1, Math.max(0, (p - 0.2) / 0.5)), origin: Math.max(0, 1 - p / 0.3) };
}

export const exitRevealStart = 0.15;
export const exitDone = 0.02;

export function containerTransformExit(progress: number, leaving: boolean): number {
  'worklet';
  if (!leaving) return 1;
  return Math.min(1, Math.max(0, (progress - exitDone) / (exitRevealStart - exitDone)));
}
