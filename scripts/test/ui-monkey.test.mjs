import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { describeAction, mulberry32, pickAction, runMonkey, safeTargets } from '../ui-monkey.mjs';

const target = (name, extra = {}) => ({
  index: 0,
  role: 'button',
  name,
  editable: false,
  external: false,
  ...extra,
});

function fakePage({ throwOnClick, blankAfterClick } = {}) {
  const listeners = { pageerror: new Set(), console: new Set() };
  let clicks = 0;
  let blank = false;
  const element = {
    click: async () => {
      clicks += 1;
      if (clicks === throwOnClick)
        for (const listener of listeners.pageerror) listener(new Error('boom'));
      if (clicks === blankAfterClick) blank = true;
    },
  };
  const keyboard = {
    down: async () => {},
    up: async () => {},
    press: async () => {},
    type: async () => {},
  };
  return {
    on: (event, listener) => listeners[event].add(listener),
    off: (event, listener) => listeners[event].delete(listener),
    url: () => 'http://127.0.0.1:1/',
    keyboard,
    evaluate: async (work) =>
      work.name === 'collectTargets' ? [target('Settings'), target('Channels')] : !blank,
    evaluateHandle: async () => ({ asElement: () => element }),
  };
}

const run = (page) =>
  runMonkey(page, { seed: 3, steps: 30, origin: 'http://127.0.0.1:1', pause: 0 });

const arbitraryTarget = fc.record({
  index: fc.nat(50),
  role: fc.constantFrom('button', 'tab', 'menuitem', 'input', 'a'),
  name: fc.oneof(
    fc.string(),
    fc.constantFrom('Delete Bot', 'Reset data', 'Send', '删除频道', '退出登录', 'Settings'),
  ),
  editable: fc.boolean(),
  external: fc.boolean(),
});

describe('ui monkey', () => {
  it('draws the same numbers for the same seed', () => {
    const draw = (seed) => Array.from({ length: 20 }, mulberry32(seed));
    expect(draw(42)).toEqual(draw(42));
    expect(draw(42)).not.toEqual(draw(43));
    for (const value of draw(7)) expect(value >= 0 && value < 1).toBe(true);
  });

  it('skips destructive controls and links that leave the Host', () => {
    const kept = safeTargets([
      target('Delete Bot'),
      target('删除频道'),
      target('Sign out'),
      target('Send'),
      target('Docs', { role: 'a', external: true }),
      target('Settings'),
      target('Clearly named tab'),
    ]);
    expect(kept.map((entry) => entry.name)).toEqual(['Settings', 'Clearly named tab']);
  });

  it('never acts on an unsafe target, whatever the seed and page', () => {
    fc.assert(
      fc.property(fc.nat(), fc.array(arbitraryTarget, { maxLength: 30 }), (seed, targets) => {
        const random = mulberry32(seed);
        const allowed = new Set(safeTargets(targets));
        for (let step = 0; step < 10; step += 1) {
          const action = pickAction(random, targets);
          if (action.kind !== 'press') expect(allowed.has(action.target)).toBe(true);
          expect(describeAction(action)).toMatch(/^(?:press|click|type) /u);
        }
      }),
    );
  });

  it('replays the same choices from the same seed and page', () => {
    fc.assert(
      fc.property(fc.nat(), fc.array(arbitraryTarget, { maxLength: 30 }), (seed, targets) => {
        const run = () => {
          const random = mulberry32(seed);
          return Array.from({ length: 10 }, () => describeAction(pickAction(random, targets)));
        };
        expect(run()).toEqual(run());
      }),
    );
  });

  it('passes a run with no page error and a live shell', async () => {
    const result = await run(fakePage());
    expect([result.ok, result.steps, result.failedAt]).toEqual([true, 30, undefined]);
  });

  it('fails at the step that raised an uncaught page error', async () => {
    const result = await run(fakePage({ throwOnClick: 2 }));
    const step = result.actions.filter((entry) => entry.action.startsWith('click'))[1].step;
    expect(result.ok).toBe(false);
    expect(result.failedAt).toBe(step);
    expect(result.pageErrors).toEqual([{ step, message: 'boom' }]);
  });

  it('stops at the step that left a blank shell', async () => {
    const result = await run(fakePage({ blankAfterClick: 1 }));
    expect(result.ok).toBe(false);
    expect(result.blankAt).toBe(result.steps);
    expect(result.actions.at(-1).action).toMatch(/^click /u);
  });
});
