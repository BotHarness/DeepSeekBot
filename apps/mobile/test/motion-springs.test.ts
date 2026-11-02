import { describe, expect, it } from 'vitest';

import { platformSprings } from '../src/ui/design/motion-springs';
import { springs } from '../src/ui/design/tokens';

const ratio = ({
  damping,
  stiffness,
  mass,
}: {
  damping: number;
  stiffness: number;
  mass: number;
}) => damping / (2 * Math.sqrt(stiffness * mass));

describe('platform springs', () => {
  it('matches Compose Material 3 Expressive on Android', () => {
    const { spatial, effects } = springs.android;
    expect([spatial.fast, spatial.default, spatial.slow].map((s) => s.stiffness)).toEqual([
      800, 380, 200,
    ]);
    expect(ratio(spatial.fast)).toBeCloseTo(0.6);
    expect(ratio(spatial.default)).toBeCloseTo(0.8);
    expect([effects.fast, effects.default, effects.slow].map((s) => s.stiffness)).toEqual([
      3800, 1600, 800,
    ]);
    for (const s of Object.values(effects)) expect(ratio(s)).toBeCloseTo(1);
  });

  it('follows SwiftUI duration and bounce on iOS', () => {
    const { spatial, effects } = springs.ios;
    expect(ratio(spatial.fast)).toBeCloseTo(0.85);
    expect(ratio(spatial.default)).toBeCloseTo(1);
    expect(spatial.default.stiffness).toBeCloseTo(((2 * Math.PI) / 0.5) ** 2);
    for (const s of Object.values(effects)) expect(ratio(s)).toBeCloseTo(1);
  });

  it('never bounces effects or a released drag, and follows the system Reduce Motion setting', () => {
    for (const os of ['ios', 'android'] as const) {
      const table = platformSprings(os);
      expect(ratio(table.release)).toBeCloseTo(1);
      expect(table.release.stiffness).toBe(springs[os].spatial.default.stiffness);
      for (const s of [
        ...Object.values(table.spatial),
        ...Object.values(table.effects),
        table.release,
      ])
        expect(s.reduceMotion).toBe('system');
    }
  });
});
