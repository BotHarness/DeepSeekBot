import { radius, space } from '../design/tokens';

export type BubbleGroup = { first: boolean; last: boolean; avatar?: boolean };

export const AVATAR_CORNER = radius.sm;

export const BUBBLE_MAX = '88%';

export const BADGE_HEIGHT = space.x6 + space.x2;

export const BADGE_OVERLAP = BADGE_HEIGHT / 2;

export function bubbleCorners(human: boolean, { first, last, avatar = false }: BubbleGroup) {
  return {
    borderRadius: radius.lg,
    ...(human
      ? {
          borderTopRightRadius: first ? radius.lg : radius.sm,
          borderBottomRightRadius: last ? radius.lg : radius.sm,
        }
      : {
          borderTopLeftRadius: first ? radius.lg : radius.sm,
          borderBottomLeftRadius: last ? (avatar ? AVATAR_CORNER : radius.lg) : radius.sm,
        }),
  } as const;
}

export function bubbleShape(human: boolean, group: BubbleGroup) {
  return {
    maxWidth: BUBBLE_MAX,
    alignSelf: human ? 'flex-end' : 'flex-start',
    ...bubbleCorners(human, group),
    paddingHorizontal: space.x5,
    paddingVertical: space.x3 + space.x1,
  } as const;
}

export function bubbleRow(first: boolean) {
  return { paddingHorizontal: space.x4, paddingTop: first ? space.x4 : space.x1 } as const;
}
