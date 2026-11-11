import { expect, it } from 'vitest';

import { islandHighlight, islandRim, islandShadow } from '../src/ui/design/island';
import { island } from '../src/ui/design/tokens';

it('derives the island rim, highlight and shadow from one token set', () => {
  expect(islandRim('dark')).toEqual({
    borderWidth: island.rim.width,
    borderColor: `rgba(255, 255, 255, ${island.rim.dark})`,
  });
  expect(islandRim('light').borderColor).toBe(`rgba(0, 0, 0, ${island.rim.light})`);
  expect(islandHighlight('light')).toBe(
    `inset 0 1px 1px rgba(255, 255, 255, ${island.highlight.light})`,
  );
  expect(islandShadow('dark')).toBe(`0 0.85px 2.7px rgba(0, 0, 0, ${island.shadow.dark})`);
});
