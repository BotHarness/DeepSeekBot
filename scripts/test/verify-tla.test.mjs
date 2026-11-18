import { describe, expect, it } from 'vitest';
import { expectation, models, outcome, verdict } from '../verify-tla.mjs';

describe('verify-tla', () => {
  it('reads the rule a broken config expects to break', () => {
    expect(expectation('\\* expect: AtMostOnce\nSPECIFICATION Spec')).toBe('AtMostOnce');
    expect(expectation('SPECIFICATION Spec')).toBeUndefined();
  });

  it('reads TLC output', () => {
    expect(outcome('Error: Invariant AtMostOnce is violated.')).toEqual({ broken: 'AtMostOnce' });
    expect(outcome('Model checking completed. No error has been found.')).toEqual({ passed: true });
    expect(outcome('Error: TLC threw an unexpected exception.')).toEqual({
      error: 'Error: TLC threw an unexpected exception.',
    });
  });

  it('fails a real model that breaks a rule and a broken variant that does not', () => {
    expect(verdict(undefined, { passed: true })).toBeUndefined();
    expect(verdict(undefined, { broken: 'AtMostOnce' })).toMatch('breaks AtMostOnce');
    expect(verdict('AtMostOnce', { broken: 'AtMostOnce' })).toBeUndefined();
    expect(verdict('AtMostOnce', { passed: true })).toMatch('every state keeps it');
    expect(verdict('AtMostOnce', { broken: 'TypeOK' })).toMatch('but TypeOK broke');
  });

  it('checks the Outbox with a real config and at least one broken variant', () => {
    const outbox = models(['outbox']);
    expect(outbox.map(({ config }) => config)).toContain('Outbox.cfg');
    expect(outbox.some(({ config }) => config.startsWith('OutboxBroken'))).toBe(true);
  });
});
