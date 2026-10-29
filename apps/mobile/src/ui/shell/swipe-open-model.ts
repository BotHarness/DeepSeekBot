import { swipeOpen } from '../design/tokens';

export function swipeOpenProgress(translationX: number): number {
  'worklet';
  return Math.min(1, Math.max(0, -translationX / swipeOpen.commit));
}

export function swipeOpens(translationX: number, velocityX: number): boolean {
  'worklet';
  if (translationX >= 0 || velocityX > swipeOpen.flick) return false;
  return velocityX < -swipeOpen.flick || swipeOpenProgress(translationX) >= 1;
}

export function swipeOpenTravel(translationX: number, width: number): number {
  'worklet';
  return Math.min(width, Math.max(0, -translationX));
}
