// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  version: 26,
  reduced: false,
  listeners: new Set<(value: boolean) => void>(),
}));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: {
    get Version() {
      return native.version;
    },
  },
  AccessibilityInfo: {
    isReduceTransparencyEnabled: async () => native.reduced,
    addEventListener: (_: string, listener: (value: boolean) => void) => {
      native.listeners.add(listener);
      return { remove: () => native.listeners.delete(listener) };
    },
  },
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  foregroundStyle: () => ({}),
  accessibilityHidden: () => ({}),
  glassEffect: () => ({}),
  ignoreSafeArea: () => ({}),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children: ReactNode }) => createElement('div', null, children),
  Capsule: () => createElement('div', { 'data-material': 'capsule' }),
  RoundedRectangle: () => createElement('div', { 'data-material': 'panel' }),
}));
import { DrawerMaterial, useLiquidGlass } from '../src/ui/primitives/drawer-material.ios';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('uses panel glass only when supported and keeps live transparency and drawer-title fallbacks', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(<DrawerMaterial rounded glassPanel />));
    expect(container.querySelector('[data-material="panel"]')).not.toBeNull();
    await act(async () => {
      native.reduced = true;
      native.listeners.forEach((notify) => notify(true));
    });
    expect(container.querySelector('[data-material]')).toBeNull();
    await act(async () => {
      native.reduced = false;
      native.listeners.forEach((notify) => notify(false));
    });
    expect(container.querySelector('[data-material="panel"]')).not.toBeNull();
    await act(async () => root.render(<DrawerMaterial rounded />));
    expect(container.querySelector('[data-material]')).toBeNull();
    native.version = 25;
    await act(async () => root.render(<DrawerMaterial rounded glassPanel />));
    expect(container.querySelector('[data-material]')).toBeNull();
  } finally {
    act(() => root.unmount());
    native.version = 26;
    native.reduced = false;
    expect(native.listeners.size).toBe(0);
  }
});

it('floats the sidebar on glass only on iOS 26 with transparency allowed', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const Probe = () => createElement('span', null, useLiquidGlass() ? 'glass' : 'opaque');
  try {
    await act(async () => root.render(<Probe />));
    expect(container.textContent).toBe('glass');
    await act(async () => {
      native.reduced = true;
      native.listeners.forEach((notify) => notify(true));
    });
    expect(container.textContent).toBe('opaque');
    await act(async () => {
      native.reduced = false;
      native.listeners.forEach((notify) => notify(false));
    });
    native.version = 18;
    await act(async () => root.render(<Probe key="older" />));
    expect(container.textContent).toBe('opaque');
  } finally {
    act(() => root.unmount());
    native.version = 26;
    native.reduced = false;
  }
});
