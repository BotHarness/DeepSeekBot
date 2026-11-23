import { describe, expect, it } from 'vitest';

import { ClientSettings, ClientSettingsError } from '../src/client/client-settings-control.js';
import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_BINDINGS_KEY,
  ShortcutBindings,
  parseShortcutBindings,
  type ShortcutKeyboardEvent,
} from '../src/client/shortcut-bindings.js';
import {
  shortcutSettingsDomain,
  type ShortcutSettingsSnapshot,
} from '../src/client/shortcut-settings-control.js';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      values.set(name, value);
    },
  };
}

function key(
  code: string,
  modifiers: Partial<Omit<ShortcutKeyboardEvent, 'key' | 'code'>> = {},
): ShortcutKeyboardEvent {
  return {
    key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code,
    code,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

function setup(storage = memoryStorage()) {
  const bindings = new ShortcutBindings(storage, () => false);
  const domain = shortcutSettingsDomain(bindings);
  const read = () => domain.read() as ShortcutSettingsSnapshot;
  const write = (patch: unknown, expectedRevision = read().revision, assertLive = () => {}) =>
    domain.write(patch, {
      expectedRevision,
      expiresAt: Number.MAX_SAFE_INTEGER,
      signal: new AbortController().signal,
      assertLive,
    }) as ShortcutSettingsSnapshot;
  return { storage, bindings, domain, read, write };
}

function refusal(run: () => unknown): { code: string; message: string } {
  try {
    run();
  } catch (error) {
    if (error instanceof ClientSettingsError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('expected a refusal');
}

const ctrlJ = { code: 'KeyJ', mod: true, alt: false, shift: false };

describe('shortcut settings read', () => {
  it('lists every action with its effective binding, default, text and the reserved keys', () => {
    const snapshot = setup().read();
    expect(snapshot.platform).toBe('other');
    expect(snapshot.revision).toMatch(/^r/u);
    expect(snapshot.actions.find((action) => action.id === 'quick-switcher')).toEqual({
      id: 'quick-switcher',
      binding: DEFAULT_SHORTCUT_BINDINGS['quick-switcher'],
      default: DEFAULT_SHORTCUT_BINDINGS['quick-switcher'],
      custom: false,
      text: 'Alt+K',
    });
    expect(snapshot.actions).toHaveLength(8);
    expect(snapshot.reserved.modCodes).toContain('KeyC');
    expect(snapshot.reserved.codes).toContain('Enter');
  });
});

describe('shortcut settings write', () => {
  it('changes one action, persists it and returns the fresh snapshot that a reload agrees with', () => {
    const { storage, bindings, read, write } = setup();
    const before = read().revision;
    const after = write({ action: 'help', binding: ctrlJ });
    expect(after.revision).not.toBe(before);
    expect(after.actions.find((action) => action.id === 'help')).toMatchObject({
      binding: ctrlJ,
      custom: true,
      text: 'Ctrl+J',
    });
    expect(bindings.matches('help', key('KeyJ', { ctrlKey: true }))).toBe(true);
    expect(JSON.parse(storage.values.get(SHORTCUT_BINDINGS_KEY)!)).toEqual({ help: ctrlJ });
    expect(setup(storage).read()).toEqual(after);
  });

  it('disables one action so it never matches and shows as not set, then resets it', () => {
    const { storage, bindings, read, write } = setup();
    const disabled = write({ action: 'bot-mode', binding: null });
    expect(disabled.actions.find((action) => action.id === 'bot-mode')).toMatchObject({
      binding: null,
      custom: true,
      text: null,
    });
    expect(bindings.matches('bot-mode', key('Backquote', { altKey: true }))).toBe(false);
    expect(bindings.text('bot-mode')).toBeUndefined();
    expect(JSON.parse(storage.values.get(SHORTCUT_BINDINGS_KEY)!)).toEqual({ 'bot-mode': null });
    const reloaded = setup(storage);
    expect(reloaded.bindings.binding('bot-mode')).toBeNull();
    const reset = reloaded.write({ action: 'bot-mode', reset: true });
    expect(reset.actions.find((action) => action.id === 'bot-mode')?.custom).toBe(false);
    expect(reloaded.bindings.matches('bot-mode', key('Backquote', { altKey: true }))).toBe(true);
    expect(read().revision).toBe(reset.revision);
  });

  it('lets a disabled action free its default for another action across a reload', () => {
    const { storage, write } = setup();
    write({ action: 'quick-switcher', binding: null });
    write({ action: 'bot-mode', binding: DEFAULT_SHORTCUT_BINDINGS['quick-switcher'] });
    const reloaded = setup(storage);
    expect(reloaded.bindings.binding('bot-mode')).toEqual(
      DEFAULT_SHORTCUT_BINDINGS['quick-switcher'],
    );
    expect(reloaded.bindings.binding('quick-switcher')).toBeNull();
  });

  it('refuses a binding another action owns, names the owner and leaves both unchanged', () => {
    const { storage, bindings, read, write } = setup();
    const before = read();
    expect(
      refusal(() =>
        write({ action: 'bot-mode', binding: DEFAULT_SHORTCUT_BINDINGS['quick-switcher'] }),
      ),
    ).toEqual({ code: 'shortcut-conflict', message: 'shortcut-conflict: quick-switcher' });
    expect(read()).toEqual(before);
    expect(bindings.binding('quick-switcher')).toEqual(DEFAULT_SHORTCUT_BINDINGS['quick-switcher']);
    expect(storage.values.has(SHORTCUT_BINDINGS_KEY)).toBe(false);
  });

  it('refuses a reset when another action took the default, naming that action', () => {
    const { write } = setup();
    write({ action: 'help', binding: null });
    write({ action: 'settings', binding: DEFAULT_SHORTCUT_BINDINGS.help });
    expect(refusal(() => write({ action: 'help', reset: true }))).toEqual({
      code: 'shortcut-conflict',
      message: 'shortcut-conflict: settings',
    });
  });

  it('refuses reserved keys, bare keys, unknown actions and malformed patches', () => {
    const { write, read } = setup();
    const before = read();
    expect(refusal(() => write({ action: 'help', binding: { ...ctrlJ, code: 'KeyC' } })).code).toBe(
      'shortcut-reserved',
    );
    expect(
      refusal(() =>
        write({ action: 'help', binding: { code: 'Digit2', mod: false, alt: true, shift: false } }),
      ).code,
    ).toBe('shortcut-reserved');
    expect(refusal(() => write({ action: 'help', binding: { ...ctrlJ, mod: false } })).code).toBe(
      'shortcut-needs-modifier',
    );
    expect(refusal(() => write({ action: 'paste', binding: ctrlJ })).code).toBe(
      'shortcut-action-unknown',
    );
    for (const patch of [
      null,
      [],
      { binding: ctrlJ },
      { action: 'help' },
      { action: 'help', reset: false },
      { action: 'help', reset: true, binding: null },
      { action: 'help', binding: { code: 'KeyJ', mod: true } },
      { action: 'help', binding: { ...ctrlJ, meta: true } },
      { action: 'help', binding: { ...ctrlJ, code: '' } },
      { action: 'help', binding: { ...ctrlJ, code: 'ShiftLeft' } },
      { action: 'help', binding: { ...ctrlJ, mod: 'yes' } },
    ])
      expect(refusal(() => write(patch)).code).toBe('client-settings-invalid-input');
    expect(read()).toEqual(before);
  });

  it('refuses a stale revision, including one another tab made in shared storage', () => {
    const storage = memoryStorage();
    const first = setup(storage);
    const other = new ShortcutBindings(storage, () => false);
    const seen = first.bindings.getSnapshot();
    const revision = first.read().revision;
    other.set('settings', ctrlJ);
    expect(first.bindings.getSnapshot()).toBe(seen);
    expect(refusal(() => first.write({ action: 'help', binding: null }, revision)).code).toBe(
      'client-settings-revision-conflict',
    );
    expect(first.bindings.binding('settings')).toEqual(ctrlJ);
    const fresh = first.write({ action: 'help', binding: null });
    expect(JSON.parse(storage.values.get(SHORTCUT_BINDINGS_KEY)!)).toEqual({
      settings: ctrlJ,
      help: null,
    });
    expect(fresh.actions.find((action) => action.id === 'settings')?.binding).toEqual(ctrlJ);
  });

  it('persists nothing when the deadline passes just before the write', () => {
    const { storage, bindings, write } = setup();
    expect(
      refusal(() =>
        write({ action: 'help', binding: null }, undefined, () => {
          throw new ClientSettingsError('appearance-request-stale');
        }),
      ).code,
    ).toBe('appearance-request-stale');
    expect(storage.values.has(SHORTCUT_BINDINGS_KEY)).toBe(false);
    expect(bindings.binding('help')).toEqual(DEFAULT_SHORTCUT_BINDINGS.help);
  });

  it('runs through the Client settings registry and refuses an expired request', async () => {
    let now = 1_000;
    const registry = new ClientSettings(() => now);
    const { storage, bindings } = setup();
    registry.register('shortcuts', shortcutSettingsDomain(bindings));
    const deadline = { expiresAt: 2_000, signal: new AbortController().signal };
    const snapshot = (await registry.execute(
      { domain: 'shortcuts' },
      undefined,
      deadline,
    )) as ShortcutSettingsSnapshot;
    now = 2_000;
    await expect(
      registry.execute(
        { domain: 'shortcuts', patch: { action: 'help', binding: null } },
        snapshot.revision,
        deadline,
      ),
    ).rejects.toMatchObject({ code: 'appearance-request-stale' });
    expect(storage.values.has(SHORTCUT_BINDINGS_KEY)).toBe(false);
    now = 1_500;
    const written = (await registry.execute(
      { domain: 'shortcuts', patch: { action: 'help', binding: null } },
      snapshot.revision,
      deadline,
    )) as ShortcutSettingsSnapshot;
    expect(written.actions.find((action) => action.id === 'help')?.binding).toBeNull();
  });

  it('changes only the selected Client instance, not one on other storage', () => {
    const selected = setup();
    const other = setup();
    const before = other.read();
    selected.write({ action: 'help', binding: ctrlJ });
    expect(other.read()).toEqual(before);
    expect(other.storage.values.has(SHORTCUT_BINDINGS_KEY)).toBe(false);
  });
});

describe('disabled quick switcher', () => {
  it('does not fall back to the legacy Ctrl+K once disabled', () => {
    const { bindings, write } = setup();
    expect(bindings.matches('quick-switcher', key('KeyK', { ctrlKey: true }))).toBe(true);
    write({ action: 'quick-switcher', binding: null });
    expect(bindings.matches('quick-switcher', key('KeyK', { ctrlKey: true }))).toBe(false);
    expect(bindings.matches('quick-switcher', key('KeyK', { altKey: true }))).toBe(false);
    write({ action: 'quick-switcher', reset: true });
    expect(bindings.matches('quick-switcher', key('KeyK', { ctrlKey: true }))).toBe(true);
  });

  it('still ignores a remote binding while an IME composes', () => {
    const { bindings, write } = setup();
    write({ action: 'help', binding: ctrlJ });
    expect(bindings.matches('help', key('KeyJ', { ctrlKey: true, isComposing: true }))).toBe(false);
  });

  it('applies stored disables before custom bindings regardless of action order', () => {
    const bindings = parseShortcutBindings(
      JSON.stringify({
        'bot-mode': DEFAULT_SHORTCUT_BINDINGS.help,
        help: null,
      }),
    );
    expect(bindings['bot-mode']).toEqual(DEFAULT_SHORTCUT_BINDINGS.help);
    expect(bindings.help).toBeNull();
  });
});

it('reports a failed storage write instead of a success the reload would not keep', () => {
  const storage = memoryStorage();
  const { read, write } = setup({
    ...storage,
    setItem: () => {
      throw new Error('quota');
    },
  });
  expect(
    refusal(() =>
      write({ action: 'help', binding: { code: 'KeyJ', mod: true, alt: false, shift: false } }),
    ),
  ).toEqual({
    code: 'client-settings-storage-unavailable',
    message: 'client-settings-storage-unavailable',
  });
  expect(read().actions.find((action) => action.id === 'help')?.binding).toEqual(
    DEFAULT_SHORTCUT_BINDINGS.help,
  );
});
