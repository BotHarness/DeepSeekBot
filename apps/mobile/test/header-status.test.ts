import { describe, expect, it } from 'vitest';
import type { RosterBot, RosterChannel } from '../src/host/client';
import { headerStatus } from '../src/ui/chat/header-status';

const bot = (slug: string, state: RosterBot['state'], paused = false): RosterBot => ({
  slug,
  displayName: slug,
  state,
  paused,
  roles: [],
  computerAccess: false,
  browserAccess: false,
});
const group: RosterChannel = { id: 'group', name: 'Group', members: [], memberCount: 5 };

describe('conversation header status', () => {
  it('keeps a DM textual, preserving pause and attention states', () => {
    expect(headerStatus(bot('a', 'working', true), undefined, []).state).toBe('paused');
    expect(headerStatus(bot('a', 'waiting'), undefined, []).state).toBe('waiting');
    expect(headerStatus(bot('a', 'working'), undefined, []).bots).toEqual([]);
  });
  it('stacks only active, unpaused group bots and prioritizes attention', () => {
    const members = [
      bot('idle', 'idle'),
      bot('working', 'working'),
      bot('paused', 'working', true),
      bot('waiting', 'waiting'),
    ];
    const result = headerStatus(undefined, group, members);
    expect(result.bots.map((item) => item.slug)).toEqual(['working', 'waiting']);
    expect(result.state).toBe('waiting');
  });
  it('uses the conversation timestamp and retains an empty group member count', () => {
    const at = '2026-11-06T10:00:00Z';
    expect(headerStatus(undefined, { ...group, previewAt: at }, []).at).toBe(at);
    expect(headerStatus(undefined, group, [])).toMatchObject({
      state: 'idle',
      count: 5,
      at: undefined,
    });
    expect(headerStatus(bot('new', 'idle'), undefined, [])).toMatchObject({
      state: 'idle',
      at: undefined,
    });
  });
});
