import { expect, it } from 'vitest';
import {
  createHostSettingsDrafts,
  type HostDraftChoice,
} from '../src/client/host-settings-drafts.js';

it('keeps the exact Host unchanged on cancel or a failed save, and discards only its draft', async () => {
  const guard = createHostSettingsDrafts();
  let dirty = true;
  let choice: HostDraftChoice = 'cancel';
  let saved = false;
  guard.register('a', {
    dirty: () => dirty,
    save: async () => {
      if (saved) dirty = false;
      return saved;
    },
    discard: () => {
      dirty = false;
    },
  });
  guard.register('b', {
    dirty: () => true,
    save: async () => {
      throw new Error('wrong Host');
    },
    discard: () => {
      throw new Error('wrong Host');
    },
  });
  guard.prompt('a', async () => choice);
  expect(await guard.prepare('a')).toBe(false);
  choice = 'save';
  expect(await guard.prepare('a')).toBe(false);
  expect(dirty).toBe(true);
  saved = true;
  expect(await guard.prepare('a')).toBe(true);
  dirty = true;
  choice = 'discard';
  expect(await guard.prepare('a')).toBe(true);
  expect(await guard.prepare('b')).toBe(false);
});

it('refuses new edits, a new registration or an unmount during asynchronous save', async () => {
  for (const mode of ['edit', 'register', 'unmount']) {
    const guard = createHostSettingsDrafts();
    let finish: (ok: boolean) => void = () => {};
    let dirty = true;
    const release = guard.register('a', {
      dirty: () => dirty,
      save: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      discard() {},
    });
    guard.prompt('a', async () => 'save');
    const result = guard.prepare('a');
    await Promise.resolve();
    if (mode === 'register') {
      dirty = false;
      guard.register('a', { dirty: () => true, save: async () => true, discard() {} });
    }
    if (mode === 'unmount') {
      dirty = false;
      release();
    }
    finish(true);
    expect(await result).toBe(false);
  }
});

it('does not let old prompt cleanup remove its replacement or silently ignore discard failure', async () => {
  const guard = createHostSettingsDrafts();
  guard.register('a', {
    dirty: () => true,
    save: async () => false,
    discard() {
      throw new Error('storage');
    },
  });
  const release = guard.prompt('a', async () => 'cancel');
  guard.prompt('a', async () => 'discard');
  release();
  expect(await guard.prepare('a')).toBe(false);
});
