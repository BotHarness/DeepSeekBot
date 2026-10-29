import { expect, it } from 'vitest';
import { CompanionMotion } from '../src/client/companion-motion.js';

it('reports a real grab, cooled fast drag, fast throw and one first-ground impact without bounce chatter', () => {
  const feedback: { kind: string; strength: number }[] = [];
  const motion = new CompanionMotion((event) => feedback.push(event));
  motion.measure(1200, 800, 0.4);
  motion.grab(0, false);
  expect(feedback).toEqual([]);
  motion.drag(450, 200, 16, false);
  motion.drag(466, 200, 32, false);
  motion.drag(482, 200, 48, false);
  motion.release(64, false);
  expect(feedback.map((event) => event.kind)).toEqual(['grab', 'drag', 'throw']);
  for (let frame = 0; frame < 300; frame++) motion.advance(16, false, false, 1);
  expect(feedback.map((event) => event.kind)).toEqual(['grab', 'drag', 'throw', 'land']);
  expect(feedback.at(-1)!.strength).toBeGreaterThan(0);
  expect(feedback.at(-1)!.strength).toBeLessThanOrEqual(1);
  expect(motion.point).toMatchObject({ phase: 'rest', y: 0 });
});

it('keeps clicks, cancelled drops, held releases and reduced-motion resets free of stale interaction sounds', () => {
  const feedback: string[] = [];
  const motion = new CompanionMotion((event) => feedback.push(event.kind));
  motion.measure(1200, 800, 0.4);
  motion.grab(0, false);
  motion.release(16, false, true);
  for (let frame = 0; frame < 200; frame++) motion.advance(16, false, false, 1);
  expect(feedback).toEqual([]);
  motion.grab(4000, false);
  motion.drag(450, 200, 4016, false);
  motion.drag(466, 200, 4032, false);
  feedback.length = 0;
  motion.release(4048, false, true);
  for (let frame = 0; frame < 200; frame++) motion.advance(16, false, false, 1);
  expect(feedback).toEqual([]);
  motion.grab(8000, false);
  motion.drag(450, 200, 8016, false);
  motion.drag(466, 200, 8032, false);
  feedback.length = 0;
  motion.release(9000, false);
  expect(feedback).toEqual([]);
  motion.advance(0, true, false, 1);
  for (let frame = 0; frame < 200; frame++) motion.advance(16, false, false, 1);
  expect(feedback).toEqual([]);
  motion.grab(12000, true);
  motion.drag(500, 200, 12016, true);
  motion.drag(700, 300, 12032, true);
  motion.release(12048, true);
  expect(feedback).toEqual([]);
});

it('keeps angular inertia through a drag reversal, settles while held, and retains bottom alignment on release', () => {
  const motion = new CompanionMotion();
  motion.measure(1200, 800, 0.4);
  motion.grab(0, false);
  for (let i = 1; i <= 12; i++) {
    motion.drag(motion.point.x + 5, 250, i * 16, false);
    motion.advance(16, false, false, 1);
  }
  expect(motion.point.tilt).toBeGreaterThan(1);
  const angle = motion.point.tilt;
  motion.drag(motion.point.x - 8, 250, 208, false);
  expect(motion.point.tilt).toBe(angle);
  motion.advance(8, false, false, 1);
  expect(Math.abs(motion.point.tilt - angle)).toBeLessThan(2);
  for (let i = 1; i <= 30; i++) {
    motion.drag(motion.point.x - 5, 250, 208 + i * 16, false);
    motion.advance(16, false, false, 1);
  }
  expect(motion.point.tilt).toBeLessThan(-1);
  const trace: number[] = [];
  for (let i = 0; i < 200; i++) trace.push(motion.advance(16, false, false, 1).tilt);
  expect(trace.some((angle) => angle > 0)).toBe(true);
  expect(trace.every((angle) => Math.abs(angle) <= 24)).toBe(true);
  expect(motion.point.tilt).toBe(0);
  motion.release(4000, false);
  for (let i = 0; i < 250; i++) motion.advance(16, false, false, 1);
  expect(motion.point).toMatchObject({ y: 0, tilt: 0, squash: 0, phase: 'rest' });
});

it('bounds a delayed frame and clears spring energy when motion is reduced or a position is reset', () => {
  const motion = new CompanionMotion();
  motion.measure(1000, 700, 0.4);
  motion.grab(0, false);
  motion.drag(600, 200, 16, false);
  const delayed = motion.advance(60000, false, false, 1);
  expect(Number.isFinite(delayed.tilt)).toBe(true);
  expect(Math.abs(delayed.tilt)).toBeLessThanOrEqual(24);
  expect(motion.advance(0, true, false, 1)).toMatchObject({ tilt: 0, squash: 0, phase: 'drag' });
  motion.release(32, true);
  expect(motion.point).toMatchObject({ y: 0, tilt: 0, squash: 0, phase: 'rest' });
  expect(motion.advance(16, false, false, 1).tilt).toBe(0);
  motion.grab(50, false);
  motion.drag(400, 200, 66, false);
  motion.advance(64, false, false, 1);
  motion.move(200);
  expect(motion.advance(64, false, false, 1)).toMatchObject({ x: 200, tilt: 0, phase: 'rest' });
});

it('stands on the ground it is given instead of covering it, and lands on it after a throw', () => {
  const motion = new CompanionMotion();
  motion.setGround((x) => (x + 96 > 300 && x < 700 ? 90 : 0));
  motion.measure(1200, 800, 0.4);
  expect(motion.point.y).toBe(90);
  for (let frame = 0; frame < 1200; frame++) motion.advance(16, false, true, 1);
  expect(motion.point.x).toBeGreaterThan(700);
  expect(motion.point.y).toBe(0);
  motion.move(400);
  expect(motion.point.y).toBe(90);
  motion.grab(0, false);
  motion.drag(420, 400, 16, false);
  motion.release(500, false);
  for (let frame = 0; frame < 300; frame++) motion.advance(16, false, false, 1);
  expect(motion.point).toMatchObject({ phase: 'rest', y: 90 });
  motion.setGround(() => 0);
  motion.advance(0, true, false, 1);
  expect(motion.point.y).toBe(0);
});

it('drops in from the top on entry and lands with one impact', () => {
  const feedback: string[] = [];
  const motion = new CompanionMotion((event) => feedback.push(event.kind));
  motion.measure(1200, 800, 0.4);
  expect(motion.drop()).toMatchObject({ phase: 'fall', y: 680 });
  for (let frame = 0; frame < 300; frame++) motion.advance(16, false, false, 1);
  expect(feedback).toEqual(['land']);
  expect(motion.point).toMatchObject({ phase: 'rest', y: 0 });
});
