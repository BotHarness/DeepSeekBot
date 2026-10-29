// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react');
  return {
    Menu: (p: {
      anchor: ReactNode;
      open: boolean;
      items: { id: string; label: string }[];
      onSelect(id: string): void;
    }) =>
      createElement(
        'div',
        null,
        p.anchor,
        p.open
          ? p.items.map((item) =>
              createElement(
                'button',
                { key: item.id, onClick: () => p.onSelect(item.id) },
                item.label,
              ),
            )
          : null,
      ),
    IconChevronDownOutlineRegular: () => null,
  };
});
import type { BrowserClientContext } from '../src/client/index.js';
import { BrowserTargetSettings, registerBrowserSettings } from '../src/client/settings.js';

describe('Browser Target native settings seam', () => {
  it('preserves native scope method receivers during render and selection', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    class NativeScope {
      value = {
        status: 'ready',
        writable: true,
        value: {
          target: 'local' as
            | 'local'
            | 'container'
            | 'extension'
            | 'daily-control'
            | 'profile-control',
        },
      };
      listeners = new Set<() => void>();
      getSnapshot() {
        return this.value;
      }
      subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }
      async set(_field: string, target: unknown) {
        if (
          target !== 'local' &&
          target !== 'container' &&
          target !== 'extension' &&
          target !== 'daily-control' &&
          target !== 'profile-control'
        )
          throw new Error('invalid target');
        this.value = { ...this.value, value: { target } };
        for (const listener of this.listeners) listener();
      }
    }
    const scope = new NativeScope();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(createElement(BrowserTargetSettings, { scope, t: (key) => key })),
      );
      expect(host.textContent).toContain('settings.local');
      await act(async () => host.querySelector('button')!.click());
      const choice = [...document.querySelectorAll('button')].find(
        (b) => b.textContent === 'settings.container',
      );
      expect(choice).toBeDefined();
      await act(async () => choice!.click());
      expect(scope.getSnapshot().value.target).toBe('container');
      for (const target of ['extension', 'daily-control', 'profile-control'] as const) {
        await act(async () => host.querySelector('button')!.click());
        const next = [...document.querySelectorAll('button')].find(
          (button) => button.textContent === `settings.${target}`,
        );
        expect(next).toBeDefined();
        await act(async () => next!.click());
        expect(scope.getSnapshot().value.target).toBe(target);
      }
      expect(host.querySelector('[role=alert]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
    expect(scope.listeners.size).toBe(0);
  });
  it('saves the Container choice without changing the independent Local choice', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    let snapshot = {
      status: 'ready',
      writable: true,
      value: {
        target: 'container' as const,
        localDriver: 'agent-browser' as const,
        containerDriver: 'current' as 'current' | 'agent-browser',
      },
    };
    const listeners = new Set<() => void>();
    const set = vi.fn(async (field: string, value: unknown) => {
      if (field !== 'containerDriver' || value !== 'agent-browser')
        throw new Error('Unexpected config mutation');
      snapshot = { ...snapshot, value: { ...snapshot.value, containerDriver: value } };
      for (const listener of listeners) listener();
    });
    const scope = {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      set,
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(createElement(BrowserTargetSettings, { scope, t: (key) => key })),
      );
      expect(host.textContent).toContain('settings.containerDriver');
      expect(host.textContent).not.toContain('settings.localDriver');
      const driver = [...host.querySelectorAll('button')].find(
        (button) => button.textContent === 'settings.driver.current',
      )!;
      await act(async () => driver.click());
      const candidate = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'settings.driver.agent-browser',
      )!;
      await act(async () => candidate.click());
      expect(set).toHaveBeenCalledExactlyOnceWith('containerDriver', 'agent-browser');
      expect(snapshot.value.localDriver).toBe('agent-browser');
      expect(snapshot.value.containerDriver).toBe('agent-browser');
      expect(host.querySelector('[role=alert]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
    expect(listeners.size).toBe(0);
  });
  it('names the target row and picker and announces a refused save', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const snapshot = { status: 'ready', writable: true, value: { target: 'local' as const } };
    const scope = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      set: vi.fn(async () => undefined),
    };
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () =>
        root.render(createElement(BrowserTargetSettings, { scope, t: (key) => key })),
      );
      const group = host.querySelector<HTMLElement>('[role=group]')!;
      const labelId = group.getAttribute('aria-labelledby')!;
      expect(document.getElementById(labelId)?.textContent).toBe('settings.target');
      const picker = host.querySelector<HTMLButtonElement>('button[aria-label="settings.target"]')!;
      expect(picker.textContent).toBe('settings.local');
      expect(picker.getAttribute('aria-haspopup')).toBe('menu');
      await act(async () => picker.click());
      const choice = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'settings.extension',
      )!;
      await act(async () => choice.click());
      expect(scope.set).toHaveBeenCalledExactlyOnceWith('target', 'extension');
      expect(host.querySelector('[role=alert]')?.textContent).toBe(
        'Error: Browser setting was not saved',
      );
      expect(host.querySelector('[class*="bh-settings-"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
  it('registers a Browser Bot Settings section bound to the canonical Browser configForms scope', () => {
    const scope = {
      getSnapshot: () => ({ status: 'ready', writable: true, value: { target: 'local' } }),
      subscribe: () => () => undefined,
      set: vi.fn(async () => undefined),
    };
    const get = vi.fn(() => scope);
    const register = vi.fn(
      (
        _options: { name: string; id: string; label(): string; inject(): { scope: unknown } },
        _component: unknown,
      ) =>
        () =>
          undefined,
    );
    const native = {
      configForms: { get },
      slots: { inject: (_name: string, callback: () => unknown) => callback(), register },
    };
    const ctx = {
      inject: (_dependencies: readonly string[], callback: (value: unknown) => void) =>
        callback(native),
    };
    registerBrowserSettings(ctx as unknown as BrowserClientContext, (key) => key);
    expect(get).toHaveBeenCalledExactlyOnceWith('botharness-browser');
    expect(register).toHaveBeenCalledOnce();
    const registration = register.mock.calls[0]![0];
    expect(registration).toMatchObject({ name: 'botharness.settings.section', id: 'browser' });
    expect(registration.label()).toBe('settings.section');
    expect(registration.inject().scope).toBe(scope);
  });
});
