import { swipeReply } from '../design/tokens';

export function replyTravel(translationX: number): number {
  'worklet';
  if (translationX <= 0) return 0;
  if (translationX <= swipeReply.reach) return translationX;
  return swipeReply.reach + (translationX - swipeReply.reach) / 4;
}

export function repliesAt(translationX: number): boolean {
  'worklet';
  return translationX >= swipeReply.commit;
}
