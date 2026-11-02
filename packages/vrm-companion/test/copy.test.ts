import { describe, expect, it } from 'vitest';
import { en, english, loadingText, presence, problemText, zh } from '../src/client/copy.js';

const live = { name: 'Tob', available: true, paused: false, sync: 'live', activity: 'idle' };

describe('panel copy', () => {
  it('describes the Bot in plain words instead of raw states', () => {
    expect(presence(english, live)).toBe('Relaxing');
    expect(presence(english, { ...live, activity: 'waiting' })).toBe('Waiting for you');
    expect(presence(english, { ...live, sync: 'stale' })).toBe('Reconnecting…');
    expect(presence(english, { ...live, paused: true })).toBe('Taking a break');
    expect(presence(english, { ...live, available: false })).toBe('Offline');
  });

  it('names the Bot while it loads and when it cannot show up', () => {
    expect(loadingText(english, 'signing-in', 'Tob')).toBe('Tob is signing in');
    expect(loadingText(english, '', 'Tob')).toBe('');
    expect(problemText(english, 'missing', 'Tob')?.text).toContain('Tob');
    expect(problemText(english, 'interrupted', 'Tob')?.action).toBe('Reload');
    expect(problemText(english, '', 'Tob')).toBeUndefined();
  });

  it('ships the same keys and placeholders in Chinese and English', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort());
    const holes = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const key of Object.keys(en) as Array<keyof typeof en>)
      expect(holes(zh[key]), key).toEqual(holes(en[key]));
  });
});
