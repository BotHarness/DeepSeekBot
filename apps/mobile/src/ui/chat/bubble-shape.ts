import { radius, space } from '../design/tokens';

export type BubbleGroup = { first: boolean; last: boolean };

export function bubbleShape(human: boolean, { first, last }: BubbleGroup) {
  return {
    maxWidth: '80%',
    alignSelf: human ? 'flex-end' : 'flex-start',
    borderRadius: radius.lg,
    ...(human
      ? {
          borderTopRightRadius: first ? radius.lg : radius.xs,
          borderBottomRightRadius: last ? radius.lg : radius.xs,
        }
      : {
          borderTopLeftRadius: first ? radius.lg : radius.xs,
          borderBottomLeftRadius: last ? radius.lg : radius.xs,
        }),
    paddingHorizontal: space.x4,
    paddingVertical: space.x3,
  } as const;
}

export function bubbleRow(first: boolean) {
  return { paddingHorizontal: space.x4, paddingTop: first ? space.x3 : space.x1 } as const;
}
