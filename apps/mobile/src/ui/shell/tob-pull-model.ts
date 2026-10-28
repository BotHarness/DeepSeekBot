import { tobPull } from '../design/tokens';
import type { TobModeHref } from './tob-mode-model';

export function tobPullProgress(distance: number): number {
  'worklet';
  return Math.min(1, Math.max(0, distance) / tobPull.commit);
}

export function tobPullArmed(distance: number): boolean {
  'worklet';
  return distance >= tobPull.commit;
}

export function tobPullCanStart(offset: number, enabled: boolean): boolean {
  'worklet';
  return enabled && offset <= tobPull.topTolerance;
}

export function tobPullOutcome({
  distance,
  href,
  hostId,
  enabled = true,
}: {
  distance: number;
  href: TobModeHref | undefined;
  hostId: string | undefined;
  enabled?: boolean;
}): 'tob' | 'refresh' | 'none' {
  if (!enabled || !tobPullArmed(distance)) return 'none';
  return href !== undefined && hostId === href.params.hostId ? 'tob' : 'refresh';
}
