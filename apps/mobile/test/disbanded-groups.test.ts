import { describe, expect, it } from 'vitest';
import { watchDisbandedGroups } from '../src/host/disbanded-groups';

const listing = (groups: string[], others: string[] = ['dm-ada']) => ({
  channels: groups.map((id) => ({ id })),
  activityChannels: [...groups, ...others].map((id) => ({ id })),
});

describe('watchDisbandedGroups', () => {
  it('reports groups that left a later listing', () => {
    const disbanded = watchDisbandedGroups();
    expect(disbanded(listing(['trip', 'work'])).gone).toEqual([]);
    expect(disbanded(listing(['trip', 'work', 'new'])).gone).toEqual([]);
    expect(disbanded(listing(['work', 'new'])).gone).toEqual(['trip']);
    expect(disbanded(listing(['work', 'new'])).gone).toEqual([]);
  });

  it('marks cached group conversations the Host no longer lists, including on the first listing', () => {
    const disbanded = watchDisbandedGroups();
    const first = disbanded(listing(['work']));
    expect(first.stale?.('channel:trip')).toBe(true);
    expect(first.stale?.('channel:work')).toBe(false);
    expect(first.stale?.('channel:dm-ada')).toBe(false);
    expect(first.stale?.('ada')).toBe(false);
    expect(disbanded(listing(['work'])).stale).toBeUndefined();
    expect(disbanded(listing([])).stale?.('channel:work')).toBe(true);
  });

  it('does not judge cached conversations without the full channel list', () => {
    const disbanded = watchDisbandedGroups();
    expect(disbanded({ channels: [{ id: 'work' }] }).stale).toBeUndefined();
  });
});
