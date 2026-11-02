import { describe, expect, it } from 'vitest';
import { IDLE_ACTIONS, IDLE_DURATION, IdleScheduler } from '../src/client/idle.js';

const sequence = (...values: number[]) => {
  let index = 0;
  return () => values[index++ % values.length]!;
};
function run(idle: IdleScheduler, seconds: number, eligible = true) {
  const seen: (string | undefined)[] = [];
  for (let i = 0; i < seconds * 30; i++) seen.push(idle.step(1 / 30, eligible).action);
  return seen;
}

describe('idle micro-action scheduling', () => {
  it('waits a random interval before acting, then eases in and out', () => {
    const idle = new IdleScheduler(sequence(0), 6, 14);
    expect(run(idle, 5.9).every((action) => action === undefined)).toBe(true);
    run(idle, 0.2);
    expect(idle.action).toBe(IDLE_ACTIONS[0]);
    const peak = Math.max(...Array.from({ length: 45 }, () => idle.step(1 / 30, true).weight));
    expect(peak).toBeGreaterThan(0.9);
    run(idle, IDLE_DURATION[IDLE_ACTIONS[0]]);
    expect(idle.action).toBeUndefined();
    expect(idle.weight).toBe(0);
  });

  it('does not repeat the same action twice in a row', () => {
    const idle = new IdleScheduler(sequence(0, 0), 1, 1);
    const actions: string[] = [];
    for (let i = 0; i < 30 * 40; i++) {
      const { action } = idle.step(1 / 30, true);
      if (action && action !== actions.at(-1)) actions.push(action);
    }
    expect(actions.length).toBeGreaterThan(3);
    for (let i = 1; i < actions.length; i++)
      expect(actions.slice(Math.max(0, i - 3), i)).not.toContain(actions[i]);
  });

  it('retreats smoothly when work, speech or movement interrupts', () => {
    const idle = new IdleScheduler(sequence(0.4), 1, 1);
    run(idle, 2.2);
    expect(idle.action).toBeDefined();
    const before = idle.weight;
    idle.step(1 / 30, false);
    expect(idle.weight).toBeGreaterThan(0);
    expect(idle.weight).toBeLessThan(before);
    run(idle, 0.5, false);
    expect(idle.action).toBeUndefined();
    expect(idle.weight).toBe(0);
  });

  it.each([
    ['sip', 0.6],
    ['phone', 0.9],
  ] as const)('puts the %s down before letting go when interrupted', (action, pick) => {
    const idle = new IdleScheduler(sequence(pick), 1, 1);
    run(idle, 1 + IDLE_DURATION[action] * 0.4);
    expect(idle.action).toBe(action);
    const lifted = idle.progress;
    idle.step(0.2, false);
    expect(idle.progress).toBeGreaterThan(lifted);
    expect(idle.weight).toBe(1);
    run(idle, 0.4, false);
    expect(idle.progress).toBeCloseTo(0.86);
    expect(idle.weight).toBeLessThan(1);
    run(idle, 0.5, false);
    expect(idle.action).toBeUndefined();
  });

  it('never catches up on time spent ineligible', () => {
    const idle = new IdleScheduler(sequence(0), 6, 6);
    run(idle, 30, false);
    expect(run(idle, 5.5).every((action) => action === undefined)).toBe(true);
  });
});
