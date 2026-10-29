import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHORTCUT_BINDINGS,
  SHORTCUT_BINDINGS_KEY,
  ShortcutBindings,
  bindingFromEvent,
  bindingMatches,
  bindingText,
  parseShortcutBindings,
  shortcutBindingProblem,
  type ShortcutKeyboardEvent,
} from '../src/client/shortcut-bindings.js';

function key(
  keyValue: string,
  code: string,
  modifiers: Partial<Omit<ShortcutKeyboardEvent, 'key' | 'code'>> & { altGraph?: boolean } = {},
): ShortcutKeyboardEvent {
  const { altGraph = false, ...rest } = modifiers;
  return {
    key: keyValue,
    code,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    getModifierState: (name) => name === 'AltGraph' && altGraph,
    ...rest,
  };
}

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

describe('default shortcut bindings', () => {
  const defaults = new ShortcutBindings(undefined, () => false);
  const mac = new ShortcutBindings(undefined, () => true);

  it('toggles Bot mode only for Alt plus the physical backquote key', () => {
    expect(defaults.matches('bot-mode', key('`', 'Backquote', { altKey: true }))).toBe(true);
    expect(defaults.matches('bot-mode', key('`', 'Backquote'))).toBe(false);
    for (const extra of [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altGraph: true },
      { isComposing: true },
      { repeat: true },
      { defaultPrevented: true },
    ]) {
      expect(defaults.matches('bot-mode', key('`', 'Backquote', { altKey: true, ...extra }))).toBe(
        false,
      );
    }
    expect(defaults.matches('bot-mode', key('1', 'Digit1', { altKey: true }))).toBe(false);
  });

  it('opens the quick switcher with Alt+K, or Option+K on macOS', () => {
    expect(defaults.matches('quick-switcher', key('k', 'KeyK', { altKey: true }))).toBe(true);
    expect(mac.matches('quick-switcher', key('˚', 'KeyK', { altKey: true }))).toBe(true);
    expect(
      defaults.matches('quick-switcher', key('k', 'KeyK', { altKey: true, shiftKey: true })),
    ).toBe(false);
    expect(
      defaults.matches('quick-switcher', key('k', 'KeyK', { altKey: true, repeat: true })),
    ).toBe(false);
    expect(
      defaults.matches('quick-switcher', key('k', 'KeyK', { altKey: true, altGraph: true })),
    ).toBe(false);
    expect(defaults.matches('quick-switcher', key('k', 'KeyV', { altKey: true }))).toBe(true);
    expect(defaults.text('quick-switcher')).toBe('Alt+K');
    expect(mac.text('quick-switcher')).toBe('⌥K');
  });

  it('still opens the quick switcher with Ctrl+K or Command+K where the browser delivers it', () => {
    expect(defaults.matches('quick-switcher', key('k', 'KeyK', { ctrlKey: true }))).toBe(true);
    expect(defaults.matches('quick-switcher', key('K', 'KeyK', { ctrlKey: true }))).toBe(true);
    expect(mac.matches('quick-switcher', key('k', 'KeyK', { metaKey: true }))).toBe(true);
    expect(mac.matches('quick-switcher', key('k', 'KeyK', { ctrlKey: true }))).toBe(false);
    expect(defaults.matches('quick-switcher', key('k', 'KeyK', { metaKey: true }))).toBe(false);
    expect(
      defaults.matches('quick-switcher', key('k', 'KeyK', { ctrlKey: true, shiftKey: true })),
    ).toBe(false);
    expect(
      defaults.matches('quick-switcher', key('k', 'KeyK', { ctrlKey: true, repeat: true })),
    ).toBe(false);
    expect(defaults.matches('quick-switcher', key('л', 'KeyK', { ctrlKey: true }))).toBe(true);

    const custom = new ShortcutBindings(undefined, () => false);
    custom.set('quick-switcher', { code: 'KeyJ', mod: true, alt: false, shift: false });
    expect(custom.matches('quick-switcher', key('k', 'KeyK', { ctrlKey: true }))).toBe(false);

    const taken = new ShortcutBindings(undefined, () => false);
    taken.set('bot-mode', { code: 'KeyK', mod: true, alt: false, shift: false });
    expect(taken.matches('quick-switcher', key('k', 'KeyK', { ctrlKey: true }))).toBe(false);
    expect(taken.matches('bot-mode', key('k', 'KeyK', { ctrlKey: true }))).toBe(true);
  });

  it('maps Alt+↑/↓ to conversation steps, adds Shift for unread, and allows held keys', () => {
    expect(defaults.matches('conversation-prev', key('ArrowUp', 'ArrowUp', { altKey: true }))).toBe(
      true,
    );
    expect(
      defaults.matches(
        'conversation-next',
        key('ArrowDown', 'ArrowDown', { altKey: true, repeat: true }),
      ),
    ).toBe(true);
    expect(
      defaults.matches(
        'unread-next',
        key('ArrowDown', 'ArrowDown', { altKey: true, shiftKey: true }),
      ),
    ).toBe(true);
    expect(
      defaults.matches(
        'conversation-next',
        key('ArrowDown', 'ArrowDown', { altKey: true, shiftKey: true }),
      ),
    ).toBe(false);
    expect(defaults.matches('conversation-prev', key('ArrowUp', 'ArrowUp'))).toBe(false);
    expect(
      defaults.matches(
        'conversation-prev',
        key('ArrowUp', 'ArrowUp', { altKey: true, ctrlKey: true }),
      ),
    ).toBe(false);
    expect(mac.text('unread-prev')).toBe('⌥⇧↑');
    expect(defaults.text('unread-prev')).toBe('Alt+Shift+↑');
  });

  it('opens Bot settings with Ctrl+, or ⌘+,', () => {
    expect(defaults.matches('settings', key(',', 'Comma', { ctrlKey: true }))).toBe(true);
    expect(mac.matches('settings', key(',', 'Comma', { metaKey: true }))).toBe(true);
    expect(mac.matches('settings', key(',', 'Comma', { ctrlKey: true }))).toBe(false);
    expect(defaults.matches('settings', key(',', 'Comma', { ctrlKey: true, altKey: true }))).toBe(
      false,
    );
    expect(defaults.matches('settings', key(',', 'Comma'))).toBe(false);
    expect(defaults.text('settings')).toBe('Ctrl+,');
    expect(mac.text('settings')).toBe('⌘,');
  });

  it('opens the list with Ctrl+/ or ⌘+/', () => {
    expect(defaults.matches('help', key('/', 'Slash', { ctrlKey: true }))).toBe(true);
    expect(mac.matches('help', key('/', 'Slash', { metaKey: true }))).toBe(true);
    expect(defaults.matches('help', key('?', 'Slash', { ctrlKey: true, shiftKey: true }))).toBe(
      false,
    );
    expect(defaults.matches('help', key('/', 'Slash'))).toBe(false);
  });
});

describe('recording a binding', () => {
  it('reads the pressed combination and ignores bare modifiers', () => {
    expect(bindingFromEvent(key('j', 'KeyJ', { ctrlKey: true, shiftKey: true }), false)).toEqual({
      code: 'KeyJ',
      mod: true,
      alt: false,
      shift: true,
    });
    expect(bindingFromEvent(key('Control', 'ControlLeft', { ctrlKey: true }), false)).toBe(
      undefined,
    );
    expect(bindingFromEvent(key('j', 'KeyJ', { ctrlKey: true }), true)).toBe(undefined);
    expect(bindingFromEvent(key('j', 'KeyJ', { altGraph: true }), false)).toBe(undefined);
    expect(bindingText({ code: 'KeyJ', mod: true, alt: true, shift: false }, false)).toBe(
      'Ctrl+Alt+J',
    );
  });

  it('refuses combinations without a modifier, reserved ones, and ones in use', () => {
    const defaults = DEFAULT_SHORTCUT_BINDINGS;
    const plain = { code: 'KeyJ', mod: false, alt: false, shift: false };
    expect(shortcutBindingProblem(defaults, 'bot-mode', plain)).toEqual({ kind: 'needs-modifier' });
    expect(shortcutBindingProblem(defaults, 'bot-mode', { ...plain, shift: true })).toEqual({
      kind: 'needs-modifier',
    });
    expect(
      shortcutBindingProblem(defaults, 'bot-mode', { ...plain, code: 'Digit3', alt: true }),
    ).toEqual({ kind: 'reserved' });
    expect(
      shortcutBindingProblem(defaults, 'bot-mode', { ...plain, code: 'KeyC', mod: true }),
    ).toEqual({ kind: 'reserved' });
    expect(
      shortcutBindingProblem(defaults, 'quick-switcher', { ...plain, code: 'KeyF', mod: true }),
    ).toEqual({ kind: 'reserved' });
    expect(
      shortcutBindingProblem(defaults, 'bot-mode', { ...plain, code: 'Enter', mod: true }),
    ).toEqual({ kind: 'reserved' });
    expect(
      shortcutBindingProblem(defaults, 'bot-mode', { ...plain, code: 'KeyK', alt: true }),
    ).toEqual({ kind: 'conflict', action: 'quick-switcher' });
    expect(
      shortcutBindingProblem(defaults, 'bot-mode', { ...plain, code: 'Backquote', alt: true }),
    ).toBeUndefined();
    expect(
      shortcutBindingProblem(defaults, 'bot-mode', {
        ...plain,
        code: 'KeyB',
        mod: true,
        shift: true,
      }),
    ).toBeUndefined();
  });
});

describe('stored bindings', () => {
  it('saves only changed bindings and restores them in a new page', () => {
    const storage = memoryStorage();
    const bindings = new ShortcutBindings(storage, () => false);
    let notified = 0;
    bindings.subscribe(() => {
      notified += 1;
    });
    const next = { code: 'KeyB', mod: true, alt: false, shift: true };
    expect(bindings.set('bot-mode', next)).toBeUndefined();
    expect(notified).toBe(1);
    expect(bindings.isCustom('bot-mode')).toBe(true);
    expect(JSON.parse(storage.values.get(SHORTCUT_BINDINGS_KEY)!)).toEqual({ 'bot-mode': next });
    expect(bindings.matches('bot-mode', key('B', 'KeyB', { ctrlKey: true, shiftKey: true }))).toBe(
      true,
    );
    expect(bindings.matches('bot-mode', key('`', 'Backquote', { altKey: true }))).toBe(false);

    const reloaded = new ShortcutBindings(storage, () => false);
    expect(reloaded.binding('bot-mode')).toEqual(next);
    expect(reloaded.reset('bot-mode')).toBeUndefined();
    expect(reloaded.isCustom('bot-mode')).toBe(false);
    expect(JSON.parse(storage.values.get(SHORTCUT_BINDINGS_KEY)!)).toEqual({});
  });

  it('keeps the old binding when a change is refused', () => {
    const bindings = new ShortcutBindings(undefined, () => false);
    expect(bindings.set('bot-mode', { code: 'KeyK', mod: false, alt: true, shift: false })).toEqual(
      { kind: 'conflict', action: 'quick-switcher' },
    );
    expect(bindings.binding('bot-mode')).toEqual(DEFAULT_SHORTCUT_BINDINGS['bot-mode']);
  });

  it('ignores broken, unknown and clashing stored values', () => {
    expect(parseShortcutBindings('not json')).toEqual(DEFAULT_SHORTCUT_BINDINGS);
    expect(
      parseShortcutBindings(
        JSON.stringify({
          'bot-mode': { code: 'KeyK', mod: false, alt: true, shift: false },
          help: { code: 'KeyH' },
          unknown: { code: 'KeyU', mod: true, alt: false, shift: false },
        }),
      ),
    ).toEqual(DEFAULT_SHORTCUT_BINDINGS);
  });

  it('matches regardless of key case and repeat only where allowed', () => {
    const binding = { code: 'KeyJ', mod: true, alt: false, shift: false };
    expect(bindingMatches(binding, key('J', 'KeyJ', { ctrlKey: true }), false)).toBe(true);
    expect(bindingMatches(binding, key('j', 'KeyJ', { ctrlKey: true, repeat: true }), false)).toBe(
      false,
    );
    expect(
      bindingMatches(binding, key('j', 'KeyJ', { ctrlKey: true, repeat: true }), false, true),
    ).toBe(true);
  });
});
