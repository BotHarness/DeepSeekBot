import { describe, expect, it } from 'vitest';

import type { ActivityItem } from '../src/host/activity-sources';
import type { RosterBot } from '../src/host/client';
import { activityAvatar } from '../src/ui/shell/activity-avatar';

const item = (fields: Partial<ActivityItem>) =>
  ({
    id: 'i1',
    category: 'unread',
    kind: 'channel-unread',
    createdAt: '2026-10-27T00:00:00Z',
    botSlug: 'ada',
    summary: 'hi',
    ...fields,
  }) as ActivityItem;

const ada = { slug: 'ada', displayName: 'Ada' } as RosterBot;

describe('Activity avatar', () => {
  it('shows a group Channel by its group mark, not the last author', () => {
    const source = { roster: { channels: [{ id: 'launch', avatar: 'https://h/launch.png' }] } };
    expect(
      activityAvatar(item({ channelId: 'launch', activitySource: source as never }), ada),
    ).toEqual({ kind: 'group', avatar: 'https://h/launch.png' });
    expect(activityAvatar(item({ channelId: 'ops' }), ada)).toEqual({
      kind: 'group',
      avatar: undefined,
    });
  });

  it('shows the Bot for its DM and requests, and its initial when it left the roster', () => {
    expect(activityAvatar(item({ channelId: 'dm-ada' }), ada)).toEqual({ kind: 'bot', bot: ada });
    expect(activityAvatar(item({ kind: 'tool-approval', category: 'action' }), ada)).toEqual({
      kind: 'bot',
      bot: ada,
    });
    expect(activityAvatar(item({ kind: 'tool-approval', botSlug: 'ben' }), undefined)).toEqual({
      kind: 'initial',
      initial: 'B',
    });
  });
});
