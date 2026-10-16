import { describe, expect, it } from 'vitest';

import { AVATAR_CORNER, bubbleRow, bubbleShape } from '../src/ui/chat/bubble-shape';
import { radius, space } from '../src/ui/design/tokens';

describe('bubbleShape', () => {
  it('rounds a lone Bot bubble on every corner', () => {
    expect(bubbleShape(false, { first: true, last: true })).toMatchObject({
      alignSelf: 'flex-start',
      maxWidth: '80%',
      borderTopLeftRadius: radius.lg,
      borderBottomLeftRadius: radius.lg,
    });
  });

  it('tightens the joined corners inside a group, on the author side', () => {
    expect(bubbleShape(false, { first: false, last: false })).toMatchObject({
      borderTopLeftRadius: radius.xs,
      borderBottomLeftRadius: radius.xs,
    });
    expect(bubbleShape(true, { first: false, last: true })).toMatchObject({
      alignSelf: 'flex-end',
      borderTopRightRadius: radius.xs,
      borderBottomRightRadius: radius.lg,
    });
  });

  it('matches the last Bot bubble corner to the avatar beside it', () => {
    expect(bubbleShape(false, { first: true, last: true, avatar: true })).toMatchObject({
      borderTopLeftRadius: radius.lg,
      borderBottomLeftRadius: AVATAR_CORNER,
    });
    expect(bubbleShape(false, { first: true, last: false, avatar: true })).toMatchObject({
      borderBottomLeftRadius: radius.xs,
    });
  });

  it('uses the tighter gap inside a group', () => {
    expect(bubbleRow(true).paddingTop).toBe(space.x4);
    expect(bubbleRow(false).paddingTop).toBe(space.x1);
  });
});
