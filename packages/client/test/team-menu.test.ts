import { describe, expect, it } from 'vitest';

import { menuItemAllowed } from '../src/client/team-menu.js';

const member = (permissions: string[]) => ({ kind: 'member' as const, owner: false, permissions });

describe('Team New menu gating', () => {
  it('shows everything to the Owner and outside Team mode', () => {
    expect(menuItemAllowed('marketplace', undefined)).toBe(true);
    expect(menuItemAllowed('bot', { kind: 'owner', owner: true, permissions: [] })).toBe(true);
  });

  it('gives a default member only browsing, sections and DMs', () => {
    const viewer = member(['dm.humans']);
    expect(menuItemAllowed('public-channels', viewer)).toBe(true);
    expect(menuItemAllowed('section', viewer)).toBe(true);
    expect(menuItemAllowed('message-person', viewer)).toBe(true);
    expect(menuItemAllowed('bot', viewer)).toBe(false);
    expect(menuItemAllowed('channel', viewer)).toBe(false);
    expect(menuItemAllowed('marketplace', viewer)).toBe(false);
  });

  it('unlocks creation with the matching permissions', () => {
    const viewer = member(['bots.createPrivate', 'channels.create']);
    expect(menuItemAllowed('bot', viewer)).toBe(true);
    expect(menuItemAllowed('channel', viewer)).toBe(true);
    expect(menuItemAllowed('message-person', viewer)).toBe(false);
  });
});
