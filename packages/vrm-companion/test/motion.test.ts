import { describe, expect, it } from 'vitest';
import { CHAIR, RoomMotion } from '../src/client/motion.js';

const live = { enabled: true, idle: true, reduced: false };
function run(motion: RoomMotion, seconds: number, options = live) {
  for (let i = 0; i < seconds * 60; i++) motion.step(1 / 60, options);
}
describe('view-local room choreography', () => {
  it('starts seated and returns to the same chair through stand, walk and sit', () => {
    const motion = new RoomMotion();
    expect(motion.phase).toBe('seated');
    motion.command('wander');
    run(motion, 6);
    expect(motion.x).not.toBe(CHAIR.x);
    motion.command('sit');
    run(motion, 14);
    expect(motion.phase).toBe('seated');
    expect(motion.seated).toBe(1);
    expect(motion.x).toBeCloseTo(CHAIR.x);
    expect(motion.z).toBeCloseTo(CHAIR.z);
    expect(motion.yaw).toBeCloseTo(0, 1);
  });
  it('yields autonomous travel to work and speaking without losing its position', () => {
    const motion = new RoomMotion();
    motion.command('wander');
    run(motion, 3);
    const before = [motion.x, motion.z];
    run(motion, 8, { ...live, idle: false });
    expect([motion.x, motion.z]).toEqual(before);
    expect(motion.stride).toBe(0);
    run(motion, 2);
    expect([motion.x, motion.z]).not.toEqual(before);
  });
  it('cancels wander on disconnect and does not replay travel on reconnect', () => {
    const motion = new RoomMotion();
    motion.command('wander');
    run(motion, 4);
    run(motion, 1, { ...live, enabled: false });
    const before = [motion.x, motion.z];
    run(motion, 10);
    expect([motion.x, motion.z]).toEqual(before);
    expect(motion.wandering).toBe(false);
  });
  it('reverses interrupted sitting/rising continuously and accepts the latest command', () => {
    const motion = new RoomMotion();
    motion.command('stand');
    run(motion, 0.4);
    const amount = motion.seated;
    motion.command('sit');
    expect(motion.seated).toBe(amount);
    run(motion, 2);
    expect(motion.phase).toBe('seated');
    motion.command('stand');
    run(motion, 2);
    expect(motion.phase).toBe('standing');
    expect(motion.seated).toBe(0);
  });
  it('reduced motion snaps explicit poses and never loops wandering', () => {
    const motion = new RoomMotion();
    const reduced = { ...live, reduced: true };
    motion.command('stand');
    run(motion, 1, reduced);
    expect(motion.phase).toBe('standing');
    motion.command('sit');
    run(motion, 1, reduced);
    expect(motion.phase).toBe('seated');
    motion.command('wander');
    run(motion, 10, reduced);
    expect(motion.wandering).toBe(false);
    expect(motion.stride).toBe(0);
  });
  it('keeps two instances independent and clamps long background deltas', () => {
    const a = new RoomMotion(),
      b = new RoomMotion();
    a.command('stand');
    a.step(3600, live);
    expect(a.seated).toBeGreaterThan(0.9);
    expect(b.phase).toBe('seated');
    run(a, 3);
    expect(b.seated).toBe(1);
  });
});
