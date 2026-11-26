import { describe, expect, it } from 'vitest';
import { en, zh } from '../src/client/model-provider-copy.js';

const LEVELS = ['off', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

describe('reasoning effort level copy', () => {
  it('has an English and Chinese name for every shared level', () => {
    for (const copy of [en, zh] as Record<string, string>[])
      for (const level of LEVELS) expect(copy[`engine.effort.${level}`]).toBeTruthy();
    expect((zh as Record<string, string>)['engine.effort.off']).toBe('关闭');
  });
});
