import { expect, it } from 'vitest';
import { repaintsOnly, type CompanionPoint } from '../src/client/companion-motion.js';

const at = (x: number, phase: CompanionPoint['phase'] = 'rest'): CompanionPoint => ({
  x,
  y: 0,
  width: 1000,
  tilt: 0,
  squash: 0,
  phase,
});

it('moves a quiet walking companion without re-rendering it', () => {
  expect(repaintsOnly(false, at(100), at(101))).toBe(true);
});

it('re-renders when the move changes what the markup shows', () => {
  expect(repaintsOnly(true, at(100), at(101))).toBe(false);
  expect(repaintsOnly(false, at(100), at(101, 'drag'))).toBe(false);
  expect(repaintsOnly(false, at(849), at(851))).toBe(false);
  expect(repaintsOnly(false, at(100), { ...at(101), width: 900 })).toBe(false);
});
