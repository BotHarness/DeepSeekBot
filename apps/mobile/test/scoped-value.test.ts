import { expect, it } from 'vitest';
import { settleScoped } from '../src/host/scoped-value';

it('keeps the open Channel nickname when a save for another Channel finishes late', () => {
  const loadedB = { scope: 'host:b', value: 'Bea' };
  expect(settleScoped(loadedB, { scope: 'host:a', value: 'Ann' })).toBe(loadedB);
  expect(
    settleScoped({ scope: 'host:a', value: 'Old' }, { scope: 'host:a', value: 'Ann' }),
  ).toEqual({ scope: 'host:a', value: 'Ann' });
  expect(settleScoped(undefined, { scope: 'host:a', value: null })).toEqual({
    scope: 'host:a',
    value: null,
  });
});
