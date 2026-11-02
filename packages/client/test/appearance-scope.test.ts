// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from 'vitest';
import { Appearance, APPEARANCE_KEY } from '../src/client/appearance.js';
import { mountAppearance } from '../src/client/appearance-scope.js';
import { bindBotAppearance, readBotColorScheme } from '../src/client/bot-color-scheme.js';
afterEach(() => {
  vi.unstubAllGlobals();
  document.head.innerHTML = '';
  document.body.removeAttribute('data-ds-dark-theme');
  localStorage.clear();
});
describe('scoped appearance lifecycle', () => {
  it('updates only its stylesheet and releases system/storage subscriptions on disposal', () => {
    const add = vi.fn(),
      remove = vi.fn();
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: add,
      removeEventListener: remove,
    }));
    document.body.setAttribute('data-ds-dark-theme', '');
    const owner = new Appearance(localStorage, () => 'light');
    const release = bindBotAppearance(owner);
    const off = mountAppearance(owner);
    owner.update({ preference: 'light' });
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true);
    expect(document.body.getAttribute('style')).toBeNull();
    expect(document.querySelector('style[data-bh-appearance="light"]')).not.toBeNull();
    expect(readBotColorScheme()).toBe('light');
    const next = { ...owner.getSnapshot().config, preference: 'dark' };
    localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
    window.dispatchEvent(new StorageEvent('storage', { key: APPEARANCE_KEY }));
    expect(readBotColorScheme()).toBe('dark');
    off();
    release();
    expect(document.querySelector('style[data-bh-appearance]')).toBeNull();
    expect(remove).toHaveBeenCalledWith('change', owner.refresh);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(owner.getSnapshot().config.preference).toBe('dark');
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true);
  });
});
