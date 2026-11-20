import { describe, expect, it } from 'vitest';

import { createSendFlights, flyOffset, textFrame } from '../src/ui/chat/send-fly';

const composer = { x: 60, y: 760, width: 240, height: 22 };
const bubble = { x: 200, y: 900, width: 120, height: 22 };

describe('send fly geometry', () => {
  it('starts the bubble text on the composer text in a top-to-bottom list', () => {
    expect(flyOffset(composer, bubble, false)).toEqual({ x: -140, y: -140 });
  });

  it('mirrors both axes inside the Android latest-first list', () => {
    expect(flyOffset(composer, bubble, true)).toEqual({ x: 140, y: 140 });
  });

  it('lines up the last text lines when the bubble is taller than the composer', () => {
    expect(flyOffset(composer, { ...bubble, y: 860, height: 62 }, false)).toEqual({
      x: -140,
      y: -140,
    });
  });
});

describe('send flights', () => {
  it('hands a launched flight to its bubble until it lands', () => {
    const flights = createSendFlights(false);
    const flight = { from: composer };
    flights.launch('m1', flight);
    expect(flights.flight('m2')).toBeUndefined();
    expect(flights.flight('m1')).toBe(flight);
    expect(flights.flight('m1')).toBe(flight);
    flights.land('m1');
    expect(flights.flight('m1')).toBeUndefined();
  });

  it('keeps only the latest send in flight', () => {
    const flights = createSendFlights(false);
    flights.launch('m1', { from: composer });
    flights.launch('m2', { from: composer });
    expect(flights.flight('m1')).toBeUndefined();
  });

  it('measures text inside a padded frame', () => {
    expect(textFrame({ x: 10, y: 20, width: 100, height: 40 }, 12, 8)).toEqual({
      x: 22,
      y: 28,
      width: 76,
      height: 24,
    });
  });
});
