import { describe, expect, it } from 'vitest';
import { watchDisbandedGroups } from '../src/host/disbanded-groups';

describe('watchDisbandedGroups', () => {
  it('reports only groups that left a later listing', () => {
    const disbanded = watchDisbandedGroups();
    expect(disbanded([{ id: 'trip' }, { id: 'work' }])).toEqual([]);
    expect(disbanded([{ id: 'trip' }, { id: 'work' }, { id: 'new' }])).toEqual([]);
    expect(disbanded([{ id: 'work' }, { id: 'new' }])).toEqual(['trip']);
    expect(disbanded([{ id: 'work' }, { id: 'new' }])).toEqual([]);
  });
});
