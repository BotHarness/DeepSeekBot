import { afterEach, describe, expect, it, vi } from 'vitest';
import { InstancedMesh, LineSegments, Mesh, Points } from 'three';
import { createOutdoors } from '../src/client/outdoors.js';

afterEach(() => vi.useRealTimers());

describe('room environment', () => {
  it('follows wall-clock time while presets remain explicit', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 19, 12, 0, 0));
    const outdoors = createOutdoors();
    expect(outdoors.update(0, 'auto').daylight).toBeCloseTo(1);
    vi.setSystemTime(new Date(2026, 9, 19, 23, 30, 0));
    expect(outdoors.update(0, 'auto')).toMatchObject({ hour: 23.5, daylight: 0 });
    const sunset = outdoors.update(0, 'sunset');
    expect(sunset.twilight).toBe(1);
    expect(sunset.hour).toBe(sunset.sunset);
    expect(sunset.sunrise).toBeLessThan(sunset.sunset);
    expect(outdoors.update(0, 'night').hour).toBe(23);
  });

  it('moves soft cloud layers without rebuilding or growing the scene', () => {
    const outdoors = createOutdoors();
    const layers = outdoors.root.children.filter((child) => child instanceof InstancedMesh);
    expect(layers.length).toBeGreaterThan(1);
    const initial = outdoors.cloudX(0);
    const count = outdoors.root.children.length;
    outdoors.update(30, 'sunset');
    expect(outdoors.cloudX(0)).not.toBe(initial);
    expect(outdoors.root.children.length).toBe(count);
    const paused = outdoors.cloudX(0);
    outdoors.update(0, 'sunset');
    expect(outdoors.cloudX(0)).toBe(paused);
    outdoors.update(3600, 'sunset');
    expect(Math.abs(outdoors.cloudX(0))).toBeLessThanOrEqual(26);
    expect(outdoors.root.children.some((child) => child instanceof Points)).toBe(true);
    expect(outdoors.root.children.some((child) => child instanceof Mesh)).toBe(true);
  });

  it('eases rain in and out and dims the sun while wet', () => {
    const outdoors = createOutdoors();
    const rain = outdoors.root.children.find((child) => child instanceof LineSegments)!;
    expect(outdoors.update(0, 'sunset', 'clear').wet).toBe(0);
    expect(rain.visible).toBe(false);
    const easing = outdoors.update(0.5, 'sunset', 'rain').wet;
    expect(easing).toBeGreaterThan(0);
    expect(easing).toBeLessThan(1);
    expect(outdoors.update(5, 'sunset', 'rain').wet).toBe(1);
    expect(rain.visible).toBe(true);
    expect(outdoors.update(0, 'sunset', 'clear').wet).toBe(0);
  });
});
