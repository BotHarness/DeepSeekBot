import { describe, expect, it } from 'vitest';

import {
  readSessionViewPreference,
  SESSION_VIEW_PREFERENCES_KEY,
  sessionViewPreferenceSnapshot,
  subscribeSessionViewPreference,
  updateSessionViewPreference,
  writeSessionViewPreference,
} from '../src/client/session-view-prefs.js';
import type { ConfigStorage } from '../src/client/roster-config.js';

function memoryStorage(): ConfigStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('PersonaBot Session view preferences', () => {
  it('keeps the heading menu and Session rows on one per-Bot snapshot', () => {
    const changes: string[] = [];
    const unsubscribe = subscribeSessionViewPreference('menu-bot-a', () => changes.push('a'));
    const unsubscribeOther = subscribeSessionViewPreference('menu-bot-b', () => changes.push('b'));

    updateSessionViewPreference('menu-bot-a', (current) => ({ ...current, scope: 'all' }));
    updateSessionViewPreference('menu-bot-a', (current) => ({
      ...current,
      layout: 'workspace',
      collapsedWorkspaces: ['cwd:/projects/a'],
      collapsedSections: [],
    }));

    expect(sessionViewPreferenceSnapshot('menu-bot-a')).toEqual({
      scope: 'all',
      layout: 'workspace',
      collapsedWorkspaces: ['cwd:/projects/a'],
      collapsedSections: [],
    });
    expect(sessionViewPreferenceSnapshot('menu-bot-b')).toEqual({
      scope: 'current',
      layout: 'status',
      collapsedWorkspaces: [],
      collapsedSections: ['resolved'],
    });
    expect(changes).toEqual(['a', 'a']);
    unsubscribe();
    unsubscribeOther();
  });

  it('persists scope, layout and workspace collapse independently for each Bot', () => {
    const storage = memoryStorage();
    writeSessionViewPreference(
      'bot-a',
      {
        scope: 'all',
        layout: 'workspace',
        collapsedWorkspaces: ['cwd:/projects/a'],
        collapsedSections: [],
      },
      storage,
    );
    writeSessionViewPreference(
      'bot-b',
      { scope: 'current', layout: 'workspace', collapsedWorkspaces: [], collapsedSections: [] },
      storage,
    );
    expect(readSessionViewPreference('bot-a', storage)).toEqual({
      scope: 'all',
      layout: 'workspace',
      collapsedWorkspaces: ['cwd:/projects/a'],
      collapsedSections: [],
    });
    expect(readSessionViewPreference('bot-b', storage)).toEqual({
      scope: 'current',
      layout: 'workspace',
      collapsedWorkspaces: [],
      collapsedSections: [],
    });
    expect(readSessionViewPreference('bot-c', storage)).toEqual({
      scope: 'current',
      layout: 'status',
      collapsedWorkspaces: [],
      collapsedSections: ['resolved'],
    });
  });

  it('falls back safely when storage is malformed or denied', () => {
    const storage = memoryStorage();
    storage.values.set(SESSION_VIEW_PREFERENCES_KEY, '{invalid');
    expect(readSessionViewPreference('bot-a', storage).layout).toBe('status');
    storage.values.set(
      SESSION_VIEW_PREFERENCES_KEY,
      JSON.stringify({
        'bot-a': {
          scope: 'unexpected',
          layout: 'workspace',
          collapsedWorkspaces: ['cwd:/a', 'cwd:/a', 12],
          collapsedSections: [],
        },
      }),
    );
    expect(readSessionViewPreference('bot-a', storage)).toEqual({
      scope: 'current',
      layout: 'workspace',
      collapsedWorkspaces: ['cwd:/a'],
      collapsedSections: [],
    });
    expect(() =>
      writeSessionViewPreference('bot-a', readSessionViewPreference('bot-a', storage), {
        getItem: () => null,
        setItem: () => {
          throw new Error('blocked');
        },
      }),
    ).not.toThrow();
  });
});
