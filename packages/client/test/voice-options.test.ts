import { describe, expect, it } from 'vitest';

import {
  choiceValues,
  chosenValue,
  CUSTOM_CHOICE,
  defaultProviderName,
  initialChoice,
} from '../src/client/voice-options.js';

describe('voice settings choices', () => {
  it('puts the default model first without duplicates', () => {
    expect(choiceValues(['s2.1-pro', 's1'], 's1')).toEqual(['s1', 's2.1-pro']);
    expect(choiceValues([], undefined)).toEqual([]);
    expect(choiceValues(['a', ''], 'a')).toEqual(['a']);
  });

  it('starts on the default and falls back to free text when nothing is listed', () => {
    expect(initialChoice(['tts-1', 'tts-1-hd'], 'tts-1')).toEqual({ choice: 'tts-1', custom: '' });
    expect(initialChoice([], undefined)).toEqual({ choice: CUSTOM_CHOICE, custom: '' });
  });

  it('reads the chosen or typed value', () => {
    expect(chosenValue({ choice: 'eleven_v3', custom: 'ignored' })).toBe('eleven_v3');
    expect(chosenValue({ choice: CUSTOM_CHOICE, custom: '  my-model ' })).toBe('my-model');
    expect(chosenValue({ choice: CUSTOM_CHOICE, custom: ' ' })).toBeUndefined();
  });

  it('suggests a Provider name that is not taken', () => {
    expect(defaultProviderName('Fish Audio', [])).toBe('Fish Audio');
    expect(defaultProviderName('Fish Audio', [{ name: 'Fish Audio' }])).toBe('Fish Audio 2');
  });
});
