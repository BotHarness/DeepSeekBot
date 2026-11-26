import { describe, expect, it } from 'vitest';

import {
  environmentChipShowsName,
  environmentChipSizes,
  nativeChipRoom,
} from '../src/ui/shell/environment-chip-fit';

const type = { title: { size: 20, line: 25 }, body: { line: 22 } };
const sides = { left: 0, right: 0 };

describe('Chats environment chip', () => {
  it('grows with text only as far as the header buttons do', () => {
    expect(environmentChipSizes(type, 1, true).scale).toBe(1);
    expect(environmentChipSizes(type, 3.1, true).scale).toBe(1.35);
    expect(environmentChipSizes(type, 3.1, true).icon).toBeCloseTo(25 * 1.35);
  });

  it('keeps the name beside Search and Create on a phone at the largest text size', () => {
    const sizes = environmentChipSizes(type, 3.1, true);
    expect(environmentChipShowsName(nativeChipRoom(402, sides), sizes)).toBe(true);
  });

  it('falls back to the icon alone when a short name would not fit', () => {
    const sizes = environmentChipSizes(type, 3.1, true);
    expect(environmentChipShowsName(nativeChipRoom(260, sides), sizes)).toBe(false);
  });

  it('shows the name until the row has been measured', () => {
    expect(environmentChipShowsName(undefined, environmentChipSizes(type, 3.1, false))).toBe(true);
  });
});
