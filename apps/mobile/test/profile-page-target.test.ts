import { describe, expect, it } from 'vitest';
import type { RosterView } from '../src/host/client';
import { profilePageTarget } from '../src/ui/chat/profile-page-target';

const roster: RosterView = {
  bots: [],
  channels: [{ id: 'group', name: 'QA group', memberCount: 2, members: ['a', 'b'] }],
  activityChannels: [{ id: 'pair', name: 'QA pair', type: 'dm', members: ['a', 'b'] }],
};

describe('retained profile source', () => {
  it('keeps the explicit routed Host for a Bot, without requiring an online roster', () => {
    expect(profilePageTarget({ kind: 'dm', slug: 'a' }, 'host-a', undefined)).toEqual({
      kind: 'bot',
      hostId: 'host-a',
      slug: 'a',
    });
  });
  it('opens the existing group profile for a group Channel', () => {
    expect(profilePageTarget({ kind: 'channel', channelId: 'group' }, 'host-b', roster)).toEqual({
      kind: 'group',
      hostId: 'host-b',
      channelId: 'group',
    });
  });
  it('keeps Bot-to-Bot DM on its Files-only profile', () => {
    expect(profilePageTarget({ kind: 'channel', channelId: 'pair' }, 'host-a', roster)).toEqual({
      kind: 'pair',
      hostId: 'host-a',
      channelId: 'pair',
    });
  });
  it('does not invent a Host or a Channel when source data is unavailable', () => {
    expect(profilePageTarget({ kind: 'dm', slug: 'a' }, undefined, roster)).toBeUndefined();
    expect(profilePageTarget({ kind: 'dm', slug: undefined }, 'host-a', roster)).toBeUndefined();
    expect(
      profilePageTarget({ kind: 'channel', channelId: 'missing' }, 'host-a', roster),
    ).toBeUndefined();
  });
});
