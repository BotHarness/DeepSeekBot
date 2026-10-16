import { radius, space } from '../design/tokens';

export type BubbleGroup = { first: boolean; last: boolean; avatar?: boolean };

export const AVATAR_CORNER = radius.sm;

export function bubbleCorners(human: boolean, { first, last, avatar = false }: BubbleGroup) {
  return {
    borderRadius: radius.lg,
    ...(human
      ? {
          borderTopRightRadius: first ? radius.lg : radius.xs,
          borderBottomRightRadius: last ? radius.lg : radius.xs,
        }
      : {
          borderTopLeftRadius: first ? radius.lg : radius.xs,
          borderBottomLeftRadius: last ? (avatar ? AVATAR_CORNER : radius.lg) : radius.xs,
        }),
  } as const;
}

export function bubbleShape(human: boolean, group: BubbleGroup) {
  return {
    maxWidth: '80%',
    alignSelf: human ? 'flex-end' : 'flex-start',
    ...bubbleCorners(human, group),
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  } as const;
}

export function bubbleRow(first: boolean) {
  return { paddingHorizontal: space.x4, paddingTop: first ? space.x4 : space.x1 } as const;
}
