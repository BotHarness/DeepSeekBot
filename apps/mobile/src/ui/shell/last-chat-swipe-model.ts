import { lastChatSwipe } from '../design/tokens';

export function lastChatProgress(translationX: number): number {
  'worklet';
  return Math.min(1, Math.max(0, -translationX / lastChatSwipe.commit));
}

export function opensLastChat(translationX: number, velocityX: number): boolean {
  'worklet';
  if (translationX >= 0 || velocityX > lastChatSwipe.flick) return false;
  return velocityX < -lastChatSwipe.flick || lastChatProgress(translationX) >= 1;
}
