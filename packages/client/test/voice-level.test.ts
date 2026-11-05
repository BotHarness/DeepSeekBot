import { describe, expect, it } from 'vitest';

import { levelDbfs, meterFraction, smoothLevel } from '../src/client/voice-level.js';

describe('voice input level', () => {
  it('measures RMS level in dBFS without the DC offset', () => {
    expect(levelDbfs(new Float32Array(480))).toBe(-120);
    expect(levelDbfs(new Float32Array(480).fill(0.5))).toBe(-120);
    const square = Float32Array.from({ length: 480 }, (_, index) => (index % 2 === 0 ? 0.1 : -0.1));
    expect(levelDbfs(square)).toBeCloseTo(-20, 1);
    expect(levelDbfs([])).toBe(-120);
  });

  it('maps dBFS onto the meter between the floor and full scale', () => {
    expect(meterFraction(-120)).toBe(0);
    expect(meterFraction(-80)).toBe(0);
    expect(meterFraction(-40)).toBeCloseTo(0.5);
    expect(meterFraction(0)).toBe(1);
    expect(meterFraction(6)).toBe(1);
    expect(meterFraction(Number.NaN)).toBe(0);
  });

  it('rises fast and falls slowly', () => {
    const up = smoothLevel(0, 1);
    const down = smoothLevel(1, 0);
    expect(up).toBeCloseTo(0.6);
    expect(down).toBeCloseTo(0.88);
    let level = 1;
    for (let frame = 0; frame < 60; frame += 1) level = smoothLevel(level, 0);
    expect(level).toBe(0);
    expect(smoothLevel(0.5, 0.5)).toBe(0.5);
  });
});
