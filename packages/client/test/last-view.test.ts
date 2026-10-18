import { describe, expect, it } from 'vitest';

import {
  consumeLastView,
  LAST_VIEW_KEY,
  readLastView,
  writeLastView,
} from '../src/client/last-view.js';
import type { ConfigStorage } from '../src/client/roster-config.js';

function memoryStorage(): ConfigStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('last visible Bot view', () => {
  it('restores the last mode and selected Channel, then remembers a manual exit', () => {
    const storage = memoryStorage();
    expect(readLastView(storage)).toBeUndefined();

    const selection = { kind: 'channel' as const, channelId: 'dm-1' };
    writeLastView(storage, { mode: 'bot', selection });
    expect(readLastView(storage)).toEqual({ mode: 'bot', selection });

    writeLastView(storage, { mode: 'dsh', selection });
    expect(readLastView(storage)).toEqual({ mode: 'dsh', selection });
  });

  it('restores legacy Overview navigation as the current Inbox', () => {
    const storage = memoryStorage();
    storage.setItem(
      LAST_VIEW_KEY,
      JSON.stringify({ mode: 'bot', selection: { kind: 'inbox', view: 'overview' } }),
    );
    expect(readLastView(storage)).toEqual({ mode: 'bot', selection: { kind: 'inbox' } });
  });

  it('ignores the superseded startup switch and malformed saved navigation', () => {
    const storage = memoryStorage();
    storage.setItem('botharness/start-in-bot-mode.v1', 'true');
    expect(readLastView(storage)).toBeUndefined();

    storage.setItem(LAST_VIEW_KEY, '{broken');
    expect(readLastView(storage)).toBeUndefined();
    storage.setItem(LAST_VIEW_KEY, JSON.stringify({ mode: 'bot', selection: { kind: 'channel' } }));
    expect(readLastView(storage)).toEqual({ mode: 'bot', selection: undefined });
  });

  it('reads once per document, leaving HMR navigation to its own handoff', () => {
    const storage = memoryStorage();
    writeLastView(storage, { mode: 'bot', selection: { kind: 'bot', slug: 'qa' } });
    const documentWindow: Record<string, unknown> = {};
    expect(consumeLastView(documentWindow, storage)).toEqual({
      mode: 'bot',
      selection: { kind: 'bot', slug: 'qa' },
    });
    expect(consumeLastView(documentWindow, storage)).toBeUndefined();
    expect(consumeLastView({}, storage)?.mode).toBe('bot');
  });

  it('keeps navigation usable when storage is unavailable', () => {
    const denied: ConfigStorage = {
      getItem: () => {
        throw new Error('storage denied');
      },
      setItem: () => {
        throw new Error('storage denied');
      },
    };
    expect(readLastView(denied)).toBeUndefined();
    expect(() => writeLastView(denied, { mode: 'bot', selection: undefined })).not.toThrow();
  });
});
