import { describe, expect, it } from 'vitest';

import {
  AVATAR_CORNER,
  BUBBLE_MAX,
  bubbleRow,
  bubbleShape,
  singleLine,
} from '../src/ui/chat/bubble-shape';
import { radius, space } from '../src/ui/design/tokens';

describe('bubbleShape', () => {
  it('rounds a lone Bot bubble on every corner', () => {
    expect(bubbleShape(false, { first: true, last: true })).toMatchObject({
      alignSelf: 'flex-start',
      maxWidth: BUBBLE_MAX,
      borderTopLeftRadius: radius.lg,
      borderBottomLeftRadius: radius.lg,
    });
  });

  it('tightens the joined corners inside a group, on the author side', () => {
    expect(bubbleShape(false, { first: false, last: false })).toMatchObject({
      borderTopLeftRadius: radius.sm,
      borderBottomLeftRadius: radius.sm,
    });
    expect(bubbleShape(true, { first: false, last: true })).toMatchObject({
      alignSelf: 'flex-end',
      borderTopRightRadius: radius.sm,
      borderBottomRightRadius: radius.lg,
    });
  });

  it('matches the last Bot bubble corner to the avatar beside it', () => {
    expect(bubbleShape(false, { first: true, last: true, avatar: true })).toMatchObject({
      borderTopLeftRadius: radius.lg,
      borderBottomLeftRadius: AVATAR_CORNER,
    });
    expect(bubbleShape(false, { first: true, last: false, avatar: true })).toMatchObject({
      borderBottomLeftRadius: radius.sm,
    });
  });

  it('turns a single-line bubble into a full pill but keeps joined corners tight', () => {
    expect(bubbleShape(true, { first: true, last: false, compact: true })).toMatchObject({
      borderRadius: radius.round,
      borderTopRightRadius: radius.round,
      borderBottomRightRadius: radius.sm,
    });
    expect(singleLine(42, 22, 1)).toBe(true);
    expect(singleLine(64, 22, 1)).toBe(false);
    expect(singleLine(64, 22, 1.5)).toBe(true);
  });

  it('uses the tighter gap inside a group', () => {
    expect(bubbleRow(true).paddingTop).toBe(space.x4);
    expect(bubbleRow(false).paddingTop).toBe(space.x1);
  });
});
