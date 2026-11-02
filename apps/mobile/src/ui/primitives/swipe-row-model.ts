import { swipeRow } from '../design/tokens';

export type SwipeSettle = 'full' | 'open' | 'closed';

export function settleSwipe(
  offset: number,
  velocity: number,
  reveal: number,
  width: number,
): SwipeSettle {
  'worklet';
  const travel = -offset;
  if (width > 0 && travel >= width * swipeRow.fullRatio) return 'full';
  if (velocity <= -swipeRow.flick && travel > reveal) return 'full';
  if (velocity >= swipeRow.flick) return 'closed';
  return travel > reveal / 2 ? 'open' : 'closed';
}

export function swipeArmed(offset: number, width: number): boolean {
  'worklet';
  return width > 0 && -offset >= width * swipeRow.fullRatio;
}
