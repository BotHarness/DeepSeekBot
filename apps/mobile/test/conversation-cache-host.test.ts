import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-file-system', () => ({
  Directory: class {},
  File: class {},
  Paths: {},
}));
vi.mock('expo-quick-actions', () => ({ setItems: async () => undefined }));
vi.mock('expo-secure-store', () => ({}));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));

const { cachedForHost } = await import('../src/host/native-cache');
const { chatHostId } = await import('../src/ui/shell/recent-chats');

const fileName = (key: unknown[]) => `${encodeURIComponent(JSON.stringify(key))}.json`;

describe('what an unpaired Computer left on the phone', () => {
  it('matches only that Computer’s cached conversations, encoded once or twice', () => {
    const dm = fileName(['computer', 'mac-1', 'writer']);
    const channel = fileName(['computer', 'mac-1', 'channel:g1']);
    expect(cachedForHost(dm, 'mac-1')).toBe(true);
    expect(cachedForHost(channel, 'mac-1')).toBe(true);
    expect(cachedForHost(encodeURIComponent(dm), 'mac-1')).toBe(true);
    expect(cachedForHost(dm, 'mac-10')).toBe(false);
    expect(cachedForHost(fileName(['computer', 'mac-10', 'writer']), 'mac-1')).toBe(false);
    expect(cachedForHost(fileName(['cloud', 'mac-1', 'writer']), 'mac-1')).toBe(false);
    expect(cachedForHost('%E0%A4%A.json', 'mac-1')).toBe(false);
  });

  it('reads the Computer from a recent chat link', () => {
    expect(chatHostId(`/dm/writer?hostId=${encodeURIComponent('mac/1 &x')}`)).toBe('mac/1 &x');
    expect(chatHostId('/channel/g1?focus=m1&hostId=mac-1')).toBe('mac-1');
    expect(chatHostId('/dm/writer')).toBeUndefined();
  });
});
