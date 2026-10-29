import { radius, space } from '../design/tokens';

export type BubbleGroup = { first: boolean; last: boolean; avatar?: boolean; compact?: boolean };

export const AVATAR_CORNER = radius.sm;

export const BUBBLE_MAX = '88%';

const PAD_V = space.x3 + space.x1;

export const BADGE_HEIGHT = space.x6 + space.x2;

export const BADGE_OVERLAP = BADGE_HEIGHT / 2 + space.x2;

export function bubbleCorners(
  human: boolean,
  { first, last, avatar = false, compact = false }: BubbleGroup,
) {
  const open = compact ? radius.round : radius.lg;
  return {
    borderRadius: open,
    ...(human
      ? {
          borderTopRightRadius: first ? open : radius.sm,
          borderBottomRightRadius: last ? open : radius.sm,
        }
      : {
          borderTopLeftRadius: first ? open : radius.sm,
          borderBottomLeftRadius: last ? (avatar ? AVATAR_CORNER : open) : radius.sm,
        }),
  } as const;
}

export function singleLine(height: number, line: number, fontScale: number) {
  return height <= 2 * PAD_V + line * fontScale * 1.5;
}

export function bubbleShape(human: boolean, group: BubbleGroup) {
  return {
    maxWidth: BUBBLE_MAX,
    alignSelf: human ? 'flex-end' : 'flex-start',
    ...bubbleCorners(human, group),
    paddingHorizontal: space.x5,
    paddingVertical: PAD_V,
  } as const;
}

export function bubbleRow(first: boolean) {
  return { paddingHorizontal: space.x4, paddingTop: first ? space.x4 : space.x1 } as const;
}
