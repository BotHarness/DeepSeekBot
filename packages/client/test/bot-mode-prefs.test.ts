import { describe, expect, it, vi } from 'vitest';

import {
  BotModePrefs,
  botModePrefsFace,
  sectionSortMode,
  type BotModeScope,
  type BotModeScopeSnapshot,
} from '../src/client/bot-mode-prefs.js';
import { ROSTER_CONFIG_KEY, type ConfigStorage } from '../src/client/roster-config.js';

function memoryStorage(seed?: string): ConfigStorage {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(ROSTER_CONFIG_KEY, seed);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

function stored(storage: ConfigStorage): unknown {
  const raw = storage.getItem(ROSTER_CONFIG_KEY);
  return raw === null ? undefined : JSON.parse(raw);
}

function fakeHost(initial: Partial<BotModeScopeSnapshot> = {}) {
  let snapshot: BotModeScopeSnapshot = {
    status: 'ready',
    value: {
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 8,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      motionPreference: 'system',
      sortMode: 'updated',
      sortModes: {},
    },
    user: {},
    writable: true,
    mode: 'host',
    ...initial,
  };
  const listeners = new Set<() => void>();
  const set = vi.fn(async (_field: string, _value: unknown) => undefined);
  const mutate = vi.fn(async (_ops: readonly unknown[]) => undefined);
  const host: BotModeScope = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set,
    mutate,
  };
  return {
    host,
    set,
    mutate,
    push(next: Partial<BotModeScopeSnapshot>) {
      snapshot = { ...snapshot, ...next };
      for (const listener of listeners) listener();
    },
  };
}

describe('BOT-mode policy store', () => {
  it('persists Group auto-accept only through a writable Host and restores a rejected value', async () => {
    const prefs = new BotModePrefs();
    prefs.setAutoAcceptGroupInvites(false);
    expect(prefs.source.getSnapshot().autoAcceptGroupInvites).toBe(true);
    const scope = fakeHost();
    prefs.attach(scope.host);
    prefs.setAutoAcceptGroupInvites(false);
    expect(scope.set).toHaveBeenCalledWith('autoAcceptGroupInvites', false);
    scope.push({ value: { ...scope.host.getSnapshot().value!, autoAcceptGroupInvites: false } });
    expect(prefs.source.getSnapshot().autoAcceptGroupInvites).toBe(false);
    scope.host.set = async () => false;
    prefs.setAutoAcceptGroupInvites(true);
    await vi.waitFor(() => expect(prefs.source.getSnapshot().autoAcceptGroupInvites).toBe(false));
  });

  it('starts on the default without pretending persistence', () => {
    const prefs = new BotModePrefs();

    expect(prefs.source.getSnapshot()).toEqual({
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 8,
      developerMode: false,
      showBotSessions: true,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: {},
      mode: 'memory',
      status: 'loading',
    });
  });

  it('shows Bot Sessions unless the Host holds an explicit choice to hide them', () => {
    const { showBotSessions: _omitted, ...withoutChoice } = fakeHost().host.getSnapshot().value!;
    const unset = new BotModePrefs();
    unset.attach(fakeHost({ value: withoutChoice as never }).host);
    expect(unset.source.getSnapshot().showBotSessions).toBe(true);

    const hidden = new BotModePrefs();
    hidden.attach(
      fakeHost({
        value: { ...withoutChoice, showBotSessions: false } as never,
        user: { showBotSessions: false },
      }).host,
    );
    expect(hidden.source.getSnapshot().showBotSessions).toBe(false);
  });

  it('adopts the accepted Host global and per-section values on every accepted change', () => {
    const scope = fakeHost({
      value: {
        botIcon: 'mascot' as const,
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        showBotSessions: false,
        showApprovalReviewSessions: false,
        motionPreference: 'reduce',
        sortMode: 'manual',
        sortModes: { s1: 'updated' },
      },
      user: { sortMode: 'manual', sortModes: { s1: 'updated' } },
    });
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    expect(prefs.source.getSnapshot()).toEqual({
      motionPreference: 'reduce',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'reduce',
      sortMode: 'manual',
      sortModes: { s1: 'updated' },
      mode: 'host',
      status: 'ready',
    });

    scope.push({
      value: {
        botIcon: 'mascot' as const,
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        showBotSessions: false,
        showApprovalReviewSessions: false,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: {},
      },
      user: {},
    });
    expect(prefs.source.getSnapshot()).toMatchObject({ sortMode: 'updated', sortModes: {} });
  });

  it('publishes an optimistic global value and writes it through the Host scope', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setSortMode('manual');
    expect(prefs.source.getSnapshot().sortMode).toBe('manual');
    expect(scope.set).toHaveBeenCalledWith('sortMode', 'manual');

    scope.set.mockClear();
    prefs.setSortMode('manual');
    expect(scope.set).not.toHaveBeenCalled();
  });

  it('publishes and persists the product-level motion preference through the same scope', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setMotionPreference('reduce');
    expect(prefs.source.getSnapshot()).toMatchObject({
      motionPreference: 'reduce',
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 8,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'reduce',
    });
    expect(scope.set).toHaveBeenCalledWith('motionPreference', 'reduce');

    scope.set.mockClear();
    prefs.setMotionPreference('reduce');
    expect(scope.set).not.toHaveBeenCalled();
  });

  it('sends with Enter by default and persists the chosen send key', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    expect(prefs.source.getSnapshot().sendKey).toBe('enter');
    prefs.setSendKey('mod-enter');
    expect(prefs.source.getSnapshot().sendKey).toBe('mod-enter');
    expect(scope.set).toHaveBeenCalledWith('sendKey', 'mod-enter');

    scope.push({
      value: {
        botIcon: 'mascot',
        sendKey: 'bogus' as never,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: {},
      },
    });
    expect(prefs.source.getSnapshot().sendKey).toBe('enter');
  });

  it('keeps developer details off by default and persists an explicit toggle', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    expect(prefs.source.getSnapshot().developerMode).toBe(false);
    prefs.setDeveloperMode(true);
    expect(prefs.source.getSnapshot().developerMode).toBe(true);
    expect(scope.set).toHaveBeenCalledWith('developerMode', true);

    scope.push({
      value: {
        botIcon: 'mascot',
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: true,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: {},
      },
    });
    expect(prefs.source.getSnapshot().developerMode).toBe(true);
    prefs.setDeveloperMode(false);
    expect(scope.set).toHaveBeenCalledWith('developerMode', false);
  });

  it('writes per-section overrides as path operations and clears back to inherit', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setSectionSortMode('s1', 'manual');
    expect(prefs.source.getSnapshot().sortModes).toEqual({ s1: 'manual' });
    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['sortModes', 's1'], value: 'manual' },
    ]);

    scope.mutate.mockClear();
    prefs.setSectionSortMode('s1', 'manual');
    expect(scope.mutate).not.toHaveBeenCalled();

    prefs.setSectionSortMode('s1', undefined);
    expect(prefs.source.getSnapshot().sortModes).toEqual({});
    expect(scope.mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['sortModes', 's1'] }]);
  });

  it('resolves a section without an override to inherit', () => {
    const snapshot = {
      motionPreference: 'system' as const,
      botIcon: 'mascot' as const,
      sendKey: 'enter' as const,
      autoAcceptGroupInvites: true,
      assignmentConcurrencyLimit: 3,
      developerMode: false,
      showBotSessions: false,
      showApprovalReviewSessions: false,
      effectiveMotion: 'full' as const,
      sortMode: 'updated' as const,
      sortModes: { s1: 'manual' as const },
      mode: 'host' as const,
      status: 'ready' as const,
    };

    expect(sectionSortMode(snapshot, 's1')).toBe('manual');
    expect(sectionSortMode(snapshot, 'missing')).toBe('inherit');
  });

  it('stays usable process-locally while the scope reports memory mode', () => {
    const scope = fakeHost({
      status: 'unavailable',
      value: undefined,
      user: undefined,
      writable: false,
      mode: 'memory',
    });
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    expect(prefs.source.getSnapshot()).toMatchObject({
      sortMode: 'updated',
      sortModes: {},
      mode: 'memory',
      status: 'unavailable',
    });

    expect(() => {
      prefs.setSortMode('manual');
      prefs.setSectionSortMode('s1', 'updated');
    }).not.toThrow();
    expect(prefs.source.getSnapshot()).toMatchObject({
      sortMode: 'manual',
      sortModes: { s1: 'updated' },
    });
  });

  it('warns on a rejected write instead of dropping it silently', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scope = fakeHost();
    scope.host.set = async () => Promise.reject(new Error('offline'));
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    prefs.setSortMode('manual');

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'botharness: failed to persist the BOT-mode preference',
        expect.any(Error),
      );
    });
    warn.mockRestore();
  });

  it('detaches without losing the local value', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);
    prefs.setSortMode('manual');
    prefs.detach();

    scope.push({
      value: {
        botIcon: 'mascot' as const,
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        showBotSessions: false,
        showApprovalReviewSessions: false,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: {},
      },
    });
    expect(prefs.source.getSnapshot().sortMode).toBe('manual');
  });

  it('shares one store and both writers through the slot face factory', () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);
    const face = botModePrefsFace(prefs);

    expect(face.hooks.botModePrefs).toBe(prefs.source);
    face.setSortMode('manual');
    face.setSectionSortMode('s1', 'updated');
    expect(prefs.source.getSnapshot()).toMatchObject({
      sortMode: 'manual',
      sortModes: { s1: 'updated' },
    });
  });
});

describe('legacy roster.json sort migration', () => {
  it('moves the global and per-section legacy fields once and cleans the local record', () => {
    const storage = memoryStorage(
      JSON.stringify({
        pins: ['ada'],
        sortMode: 'auto',
        sections: [
          { id: 's1', name: 'A', channels: ['c1'], sortMode: 'manual' },
          { id: 's2', name: 'B', channels: [] },
        ],
      }),
    );
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['sortMode'], value: 'updated' },
      { op: 'set', path: ['sortModes', 's1'], value: 'manual' },
    ]);
    expect(scope.set).not.toHaveBeenCalled();

    scope.push({ user: { sortMode: 'updated', sortModes: { s1: 'manual' } } });
    expect(stored(storage)).toEqual({
      pins: ['ada'],
      sections: [
        { id: 's1', name: 'A', channels: ['c1'] },
        { id: 's2', name: 'B', channels: [] },
      ],
    });

    const again = fakeHost();
    prefs.attach(again.host);
    expect(again.mutate).not.toHaveBeenCalled();
  });

  it('migrates a per-section-only preference without touching the global field', () => {
    const storage = memoryStorage(
      JSON.stringify({ sections: [{ id: 's1', name: 'A', channels: [], sortMode: 'auto' }] }),
    );
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['sortModes', 's1'], value: 'updated' },
    ]);
  });

  it('never overwrites a Host user override and still clears the legacy fields', () => {
    const storage = memoryStorage(
      JSON.stringify({
        sortMode: 'manual',
        sections: [{ id: 's1', name: 'A', channels: [], sortMode: 'manual' }],
      }),
    );
    const scope = fakeHost({
      value: {
        botIcon: 'mascot' as const,
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        showBotSessions: false,
        showApprovalReviewSessions: false,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: { s1: 'updated' },
      },
      user: { sortMode: 'updated', sortModes: { s1: 'updated' } },
    });
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual({ sections: [{ id: 's1', name: 'A', channels: [] }] });
  });

  it('leaves the legacy fields alone while the scope is not writable', () => {
    const storage = memoryStorage('{"sortMode":"manual","sections":[]}');
    const scope = fakeHost({ status: 'unavailable', writable: false, mode: 'memory' });
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual({ sortMode: 'manual', sections: [] });
  });

  it('keeps the legacy source and warns when the migration write fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = memoryStorage('{"sortMode":"manual","sections":[]}');
    const scope = fakeHost();
    scope.host.mutate = async () => Promise.reject(new Error('offline'));
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith(
        'botharness: failed to persist the BOT-mode preference',
        expect.any(Error),
      );
    });
    expect(stored(storage)).toEqual({ sortMode: 'manual', sections: [] });
    warn.mockRestore();
  });

  it('is a no-op when no legacy preference exists', () => {
    const storage = memoryStorage('{"pins":[]}');
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    expect(scope.mutate).not.toHaveBeenCalled();
    expect(scope.set).not.toHaveBeenCalled();
    expect(stored(storage)).toEqual({ pins: [] });
  });
});

describe('roster migration sort-mode remap', () => {
  it('re-keys accepted per-section modes onto host-generated ids', async () => {
    const scope = fakeHost({
      value: {
        motionPreference: 'system',
        botIcon: 'mascot' as const,
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        showBotSessions: false,
        showApprovalReviewSessions: false,
        sortMode: 'updated',
        sortModes: { 'section-1': 'manual' },
      },
      user: { sortModes: { 'section-1': 'manual' } },
    });
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    const applied = await prefs.remapSectionSortModes(
      new Map([
        ['section-1', 'host-1'],
        ['section-2', 'host-2'],
      ]),
    );

    expect(applied).toBe(true);
    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'unset', path: ['sortModes', 'section-1'] },
      { op: 'set', path: ['sortModes', 'host-1'], value: 'manual' },
    ]);
    expect(prefs.source.getSnapshot().sortModes).toEqual({ 'host-1': 'manual' });
  });

  it('carries modes that only the legacy record still holds', async () => {
    const storage = memoryStorage(
      JSON.stringify({
        sections: [{ id: 'section-1', name: 'A', channels: [], sortMode: 'manual' }],
      }),
    );
    const scope = fakeHost();
    const prefs = new BotModePrefs(storage);
    prefs.attach(scope.host);

    const applied = await prefs.remapSectionSortModes(new Map([['section-1', 'host-1']]));

    expect(applied).toBe(true);
    expect(scope.mutate).toHaveBeenCalledWith([
      { op: 'unset', path: ['sortModes', 'section-1'] },
      { op: 'set', path: ['sortModes', 'host-1'], value: 'manual' },
    ]);
  });

  it('reports pending when a legacy mode has no writable Host scope', async () => {
    const storage = memoryStorage(
      JSON.stringify({
        sections: [{ id: 'section-1', name: 'A', channels: [], sortMode: 'manual' }],
      }),
    );
    const prefs = new BotModePrefs(storage);

    await expect(prefs.remapSectionSortModes(new Map([['section-1', 'host-1']]))).resolves.toBe(
      false,
    );
  });

  it('writes nothing when no mapped legacy id carries a mode', async () => {
    const scope = fakeHost();
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    await expect(prefs.remapSectionSortModes(new Map([['section-1', 'host-1']]))).resolves.toBe(
      true,
    );
    expect(scope.mutate).not.toHaveBeenCalled();
  });

  it('restores the published modes when the Host rejects the remap', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scope = fakeHost({
      value: {
        motionPreference: 'system',
        botIcon: 'mascot' as const,
        sendKey: 'enter' as const,
        autoAcceptGroupInvites: true,
        assignmentConcurrencyLimit: 3,
        developerMode: false,
        showBotSessions: false,
        showApprovalReviewSessions: false,
        sortMode: 'updated',
        sortModes: { 'section-1': 'manual' },
      },
      user: { sortModes: { 'section-1': 'manual' } },
    });
    scope.host.mutate = async () => Promise.reject(new Error('offline'));
    const prefs = new BotModePrefs();
    prefs.attach(scope.host);

    await expect(prefs.remapSectionSortModes(new Map([['section-1', 'host-1']]))).resolves.toBe(
      false,
    );
    expect(prefs.source.getSnapshot().sortModes).toEqual({ 'section-1': 'manual' });
    warn.mockRestore();
  });
});

describe('Assignment limit persistence', () => {
  it('only publishes Host-confirmed values, including another client update', async () => {
    const prefs = new BotModePrefs();
    const scope = fakeHost();
    prefs.attach(scope.host);
    let settle: ((value: boolean) => void) | undefined;
    scope.host.set = () =>
      new Promise<boolean>((resolve) => {
        settle = resolve;
      });
    const pending = prefs.setAssignmentConcurrencyLimit(5);
    expect(prefs.source.getSnapshot().assignmentConcurrencyLimit).toBe(8);
    scope.push({ value: { ...scope.host.getSnapshot().value!, assignmentConcurrencyLimit: 5 } });
    settle!(true);
    expect(await pending).toBe(true);
    expect(prefs.source.getSnapshot().assignmentConcurrencyLimit).toBe(5);
    scope.host.set = async () => false;
    expect(await prefs.setAssignmentConcurrencyLimit(2)).toBe(false);
    expect(prefs.source.getSnapshot().assignmentConcurrencyLimit).toBe(5);
    scope.push({ value: { ...scope.host.getSnapshot().value!, assignmentConcurrencyLimit: 1 } });
    expect(prefs.source.getSnapshot().assignmentConcurrencyLimit).toBe(1);
  });
  it('refuses invalid, unavailable, memory-only and non-writable saves', async () => {
    const prefs = new BotModePrefs();
    expect(await prefs.setAssignmentConcurrencyLimit(2)).toBe(false);
    const scope = fakeHost();
    prefs.attach(scope.host);
    for (const value of [0, 33, 1.5, NaN])
      expect(await prefs.setAssignmentConcurrencyLimit(value)).toBe(false);
    for (const patch of [
      { writable: false },
      { writable: true, mode: 'memory' as const },
      { mode: 'host' as const, status: 'loading' as const },
    ]) {
      scope.push(patch);
      expect(await prefs.setAssignmentConcurrencyLimit(2)).toBe(false);
    }
    expect(scope.set).not.toHaveBeenCalled();
  });
  it('propagates failed Host writes without committing the new value', async () => {
    const prefs = new BotModePrefs();
    const scope = fakeHost();
    prefs.attach(scope.host);
    scope.host.set = async () => {
      throw new Error('Host unavailable');
    };
    await expect(prefs.setAssignmentConcurrencyLimit(2)).rejects.toThrow('Host unavailable');
    expect(prefs.source.getSnapshot().assignmentConcurrencyLimit).toBe(8);
  });
});
