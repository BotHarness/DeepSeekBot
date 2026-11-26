import { describe, expect, it } from 'vitest';
import {
  requireChannelAccess,
  type ChannelAccessFacts,
} from '../src/team-policy/channel-access.js';
import { DEFAULT_CHANNEL_POLICY } from '../src/team-policy/channel-contract.js';
import { TeamError } from '../src/team-policy/error.js';
import { resolveHostPermissions } from '../src/team-policy/host-access.js';

function facts(overrides: Partial<ChannelAccessFacts> = {}): ChannelAccessFacts {
  return {
    active: () => true,
    joined: () => true,
    group: () => true,
    groupPolicy: () => ({
      ...DEFAULT_CHANNEL_POLICY,
      addMembers: 'admins',
      post: 'admins',
      mentionAll: 'admins',
    }),
    role: () => 'member',
    managesAll: () => false,
    ...overrides,
  };
}

describe('Team Policy', () => {
  it('lets a role denial override a grant and ignores unrecognized permissions', () => {
    expect(
      resolveHostPermissions([
        { allow: ['channels.manageAll', 'audit.view', 'unknown'], deny: [] },
        { allow: [], deny: ['channels.manageAll'] },
      ]),
    ).toEqual(['audit.view']);
  });

  it('conceals an unreadable Channel before considering permission to post', () => {
    expect(() =>
      requireChannelAccess('post', facts({ joined: () => false, managesAll: () => true })),
    ).toThrow(new TeamError('channel-not-found'));
  });

  it('allows posting in a readable DM while withholding group-only privileges', () => {
    const dm = facts({ group: () => false });
    expect(() => requireChannelAccess('post', dm)).not.toThrow();
    expect(() => requireChannelAccess('mentionAll', dm)).toThrow(
      new TeamError('channel-not-found'),
    );
  });

  it('enforces action-specific restrictions and recognizes Channel administrators', () => {
    expect(() => requireChannelAccess('post', facts())).toThrow(
      new TeamError('channel-post-restricted', undefined, { permission: 'post' }),
    );
    expect(() => requireChannelAccess('mentionAll', facts())).toThrow(
      new TeamError('channel-mention-restricted', undefined, { permission: 'mentionAll' }),
    );
    expect(() => requireChannelAccess('post', facts({ role: () => 'admin' }))).not.toThrow();
    expect(() => requireChannelAccess('mentionAll', facts({ role: () => 'owner' }))).not.toThrow();
  });

  it('lets active Host-wide managers manage groups and add members without joining', () => {
    const manager = facts({ joined: () => false, managesAll: () => true });
    expect(() => requireChannelAccess('manage', manager)).not.toThrow();
    expect(() => requireChannelAccess('addMembers', manager)).not.toThrow();
    expect(() => requireChannelAccess('addMembers', { ...manager, active: () => false })).toThrow(
      new TeamError('permission-required', undefined, { permission: 'addMembers' }),
    );
  });
});
