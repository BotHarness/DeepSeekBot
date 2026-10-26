import { describe, expect, it, vi } from 'vitest';

import { workRows, type ProfileAssignment } from '../src/host/bot-profile';
import {
  createProfileTabMemory,
  openingTab,
  profileTabs,
  swipedTab,
  type ProfileTab,
} from '../src/ui/chat/profile-tabs';

describe('profile tabs', () => {
  it('gives a Bot five tabs and a Bot-to-Bot DM only its files', () => {
    expect(profileTabs('bot')).toEqual(['work', 'memory', 'files', 'routines', 'settings']);
    expect(profileTabs('bot-pair')).toEqual(['files']);
  });

  it('opens on the remembered tab and falls back to the first tab', () => {
    const tabs = profileTabs('bot');
    expect(openingTab(tabs, 'routines')).toBe('routines');
    expect(openingTab(tabs, undefined)).toBe('work');
    expect(openingTab(tabs, 'overview')).toBe('work');
    expect(openingTab(tabs, 3)).toBe('work');
    expect(openingTab(profileTabs('bot-pair'), 'memory')).toBe('files');
  });

  it('swipes to the neighbouring tab and stops at either end', () => {
    const tabs = profileTabs('bot');
    expect(swipedTab(tabs, 'work', true)).toBe('memory');
    expect(swipedTab(tabs, 'memory', false)).toBe('work');
    expect(swipedTab(tabs, 'work', false)).toBeUndefined();
    expect(swipedTab(tabs, 'settings', true)).toBeUndefined();
    expect(swipedTab(profileTabs('bot-pair'), 'files', true)).toBeUndefined();
  });
});

describe('profile tab memory', () => {
  it('reads the stored tab, remembers a new one for every Bot and writes it', async () => {
    const write = vi.fn();
    const memory = createProfileTabMemory({
      read: async () => ({ bot: 'files' }),
      write,
    });
    const listener = vi.fn();
    memory.subscribe(listener);
    await Promise.resolve();
    expect(memory.get('bot')).toBe('files');
    expect(listener).toHaveBeenCalledTimes(1);

    memory.remember('bot', 'settings');
    expect(memory.get('bot')).toBe('settings');
    expect(write).toHaveBeenLastCalledWith({ bot: 'settings' });
    memory.remember('bot', 'settings');
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('keeps a choice made before the stored tab was read', async () => {
    let resolve!: (value: unknown) => void;
    const memory = createProfileTabMemory({
      read: () => new Promise((done) => (resolve = done)),
      write: () => {},
    });
    memory.remember('bot', 'memory');
    resolve({ bot: 'routines' });
    await Promise.resolve();
    expect(memory.get('bot')).toBe('memory');
  });

  it('ignores an unknown or unreadable stored tab', async () => {
    const unknown = createProfileTabMemory({
      read: async () => ({ bot: 'overview' as ProfileTab }),
      write: () => {},
    });
    const broken = createProfileTabMemory({
      read: async () => {
        throw new Error('unreadable');
      },
      write: () => {},
    });
    await Promise.resolve();
    expect(unknown.get('bot')).toBeUndefined();
    expect(broken.get('bot')).toBeUndefined();
    expect(openingTab(profileTabs('bot'), unknown.get('bot'))).toBe('work');
  });
});

describe('Work tab rows', () => {
  const row = (sessionId: string, updatedAt: string, archivedAt?: string): ProfileAssignment => ({
    sessionId,
    purpose: sessionId,
    activity: 'idle',
    updatedAt,
    ...(archivedAt === undefined ? {} : { archivedAt }),
  });

  it('drops archived Assignments and lists the most recent first', () => {
    expect(
      workRows([
        row('old', '2026-10-01T00:00:00Z'),
        row('archived', '2026-10-26T00:00:00Z', '2026-10-26T01:00:00Z'),
        row('new', '2026-10-25T00:00:00Z'),
      ]).map((assignment) => assignment.sessionId),
    ).toEqual(['new', 'old']);
  });
});
