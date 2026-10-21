import { describe, expect, it } from 'vitest';
import { loadingText, presence, problemText } from '../src/client/copy.js';

const live = { name: 'Tob', available: true, paused: false, sync: 'live', activity: 'idle' };

describe('panel copy', () => {
  it('describes the Bot in plain words instead of raw states', () => {
    expect(presence(live)).toBe('Relaxing');
    expect(presence({ ...live, activity: 'waiting' })).toBe('Waiting for you');
    expect(presence({ ...live, sync: 'stale' })).toBe('Reconnecting…');
    expect(presence({ ...live, paused: true })).toBe('Taking a break');
    expect(presence({ ...live, available: false })).toBe('Offline');
  });

  it('names the Bot while it loads and when it cannot show up', () => {
    expect(loadingText('signing-in', 'Tob')).toBe('Tob is signing in');
    expect(loadingText('', 'Tob')).toBe('');
    expect(problemText('missing', 'Tob')?.text).toContain('Tob');
    expect(problemText('', 'Tob')).toBeUndefined();
  });
});
