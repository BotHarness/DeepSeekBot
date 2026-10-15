import { describe, expect, it } from 'vitest';

import { placeMenu } from '../src/ui/chat/menu-placement';

const frame = { top: 50, bottom: 800, bar: 60, menu: 140, gap: 8 };

describe('placeMenu', () => {
  it('keeps the bubble in place when the island and menu fit around it', () => {
    expect(placeMenu({ ...frame, anchor: { x: 16, y: 300, width: 200, height: 80 } })).toEqual({
      barTop: 232,
      bubbleTop: 300,
      bubbleHeight: 80,
      menuTop: 388,
    });
  });

  it('slides the group down under the top edge', () => {
    const place = placeMenu({ ...frame, anchor: { x: 16, y: 60, width: 200, height: 80 } });
    expect(place.barTop).toBe(50);
    expect(place.bubbleTop).toBe(118);
  });

  it('slides the group up above the bottom edge', () => {
    const place = placeMenu({ ...frame, anchor: { x: 16, y: 700, width: 200, height: 80 } });
    expect(place.menuTop + frame.menu).toBe(frame.bottom);
    expect(place.bubbleHeight).toBe(80);
  });

  it('clips a bubble taller than the room left', () => {
    const place = placeMenu({ ...frame, anchor: { x: 16, y: 0, width: 200, height: 2000 } });
    expect(place.barTop).toBe(50);
    expect(place.bubbleHeight).toBe(800 - 50 - 68 - 148);
    expect(place.menuTop + frame.menu).toBe(frame.bottom);
  });

  it('gives the bubble the island room when there is no island', () => {
    const place = placeMenu({
      ...frame,
      bar: 0,
      anchor: { x: 16, y: 300, width: 200, height: 80 },
    });
    expect(place).toMatchObject({ barTop: 300, bubbleTop: 300 });
  });
});
