import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ClientSettingsError } from '../src/client/client-settings-control.js';
import {
  SHORTCUT_ACTION_IDS,
  SHORTCUT_BINDINGS_KEY,
  ShortcutBindings,
  sameBinding,
  type ShortcutBinding,
} from '../src/client/shortcut-bindings.js';
import {
  shortcutSettingsDomain,
  type ShortcutSettingsSnapshot,
} from '../src/client/shortcut-settings-control.js';

const binding = fc.record({
  code: fc.constantFrom('KeyJ', 'KeyK', 'KeyC', 'Backquote', 'Slash', 'Comma', 'ArrowUp', 'Digit2'),
  mod: fc.boolean(),
  alt: fc.boolean(),
  shift: fc.boolean(),
});

const patch = fc.oneof(
  fc.record({ action: fc.constantFrom(...SHORTCUT_ACTION_IDS), binding }),
  fc.record({ action: fc.constantFrom(...SHORTCUT_ACTION_IDS), binding: fc.constant(null) }),
  fc.record({ action: fc.constantFrom(...SHORTCUT_ACTION_IDS), reset: fc.constant(true) }),
);

describe('remote shortcut writes', () => {
  it('never leave two actions on the same binding, and a reload sees the same map', () => {
    fc.assert(
      fc.property(fc.array(patch, { maxLength: 30 }), (patches) => {
        const values = new Map<string, string>();
        const storage = {
          getItem: (name: string) => values.get(name) ?? null,
          setItem: (name: string, value: string) => void values.set(name, value),
        };
        const bindings = new ShortcutBindings(storage, () => false);
        const domain = shortcutSettingsDomain(bindings);
        for (const next of patches) {
          const { revision } = domain.read() as ShortcutSettingsSnapshot;
          try {
            domain.write(next, {
              expectedRevision: revision,
              expiresAt: Number.MAX_SAFE_INTEGER,
              signal: new AbortController().signal,
              assertLive: () => {},
            });
          } catch (error) {
            if (!(error instanceof ClientSettingsError)) throw error;
          }
          const set = SHORTCUT_ACTION_IDS.map((id) => bindings.binding(id)).filter(
            (value): value is ShortcutBinding => value !== null,
          );
          for (const [index, a] of set.entries())
            for (const b of set.slice(index + 1)) expect(sameBinding(a, b)).toBe(false);
        }
        const reloaded = new ShortcutBindings(storage, () => false);
        expect(reloaded.getSnapshot()).toEqual(bindings.getSnapshot());
        expect(
          values.size <= 1 && [...values.keys()].every((k) => k === SHORTCUT_BINDINGS_KEY),
        ).toBe(true);
      }),
    );
  });
});
