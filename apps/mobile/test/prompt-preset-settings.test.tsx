// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
const appState = vi.hoisted(() => ({ change: undefined as ((state: string) => void) | undefined }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      appState.change = listener;
      return { remove: () => (appState.change = undefined) };
    },
  },
}));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('expo-router', () => ({ useRouter: () => ({ back() {} }) }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: <A extends unknown[]>(callback: (...args: A) => void, ...args: A) =>
    callback(...args),
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import type { PromptLibrary } from '@botharness/host-client/prompt-presets';
import { PromptPresetSettings } from '../src/ui/prompt-preset-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

function library(globalPresetId: string | null): PromptLibrary {
  return {
    parts: [
      { id: 'coordination', kind: 'system', section: '', defaultText: 'Lead.', defaultHash: 'new' },
    ],
    limits: [],
    presets: [
      {
        id: 'concise',
        name: 'Concise',
        revision: 1,
        parts: { coordination: { text: 'Be brief.', base: 'old' } },
        limits: { 'review-tool-calls': 6 },
        updatedAt: '',
      },
      { id: 'plain', name: 'Plain', revision: 1, parts: {}, limits: {}, updatedAt: '' },
    ],
    globalPresetId,
  };
}

const row = (view: HTMLElement, id: string) =>
  view.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;

describe('Prompt preset settings', () => {
  it('shows the Host presets and makes one the global preset', async () => {
    let global: string | null = null;
    const setGlobal = vi.fn(async (id: string | null) => {
      global = id;
    });
    const view = await render(
      <PromptPresetSettings port={{ load: async () => library(global), setGlobal }} />,
    );
    expect(row(view, 'prompt-global-built-in').getAttribute('aria-selected')).toBe('true');
    expect(row(view, 'prompt-preset-concise').textContent).toContain(t.prompts.changed(2));
    expect(row(view, 'prompt-preset-concise').textContent).toContain(t.prompts.defaultChanged);
    expect(row(view, 'prompt-preset-plain').textContent).toBe(`Plain${t.prompts.changed(0)}`);
    expect(t.prompts.changed(0)).not.toMatch(/0/);
    await act(async () => row(view, 'prompt-global-concise').click());
    await act(async () => undefined);
    expect(setGlobal).toHaveBeenCalledWith('concise');
    expect(row(view, 'prompt-global-concise').getAttribute('aria-selected')).toBe('true');
    expect(row(view, 'prompt-preset-concise').textContent).toContain(t.prompts.globalTag);
    await act(async () => row(view, 'prompt-global-built-in').click());
    await act(async () => undefined);
    expect(setGlobal).toHaveBeenLastCalledWith(null);
  });

  it('keeps the current choice and says why when the Host refuses the change', async () => {
    const view = await render(
      <PromptPresetSettings
        port={{
          load: async () => library(null),
          setGlobal: async () => {
            throw new Error('Unknown Prompt Preset');
          },
        }}
      />,
    );
    await act(async () => row(view, 'prompt-global-concise').click());
    await act(async () => undefined);
    expect(view.querySelector('[data-testid="notice-danger"]')?.textContent).toBe(
      `${t.prompts.failed} Unknown Prompt Preset`,
    );
    expect(row(view, 'prompt-global-built-in').getAttribute('aria-selected')).toBe('true');
  });

  it('reads the Host again when the app comes back, so a change made on the computer shows', async () => {
    let global: string | null = null;
    const load = vi.fn(async () => library(global));
    const view = await render(<PromptPresetSettings port={{ load, setGlobal: vi.fn() }} />);
    expect(row(view, 'prompt-global-built-in').getAttribute('aria-selected')).toBe('true');
    global = 'concise';
    await act(async () => appState.change?.('background'));
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => appState.change?.('active'));
    await act(async () => undefined);
    expect(load).toHaveBeenCalledTimes(2);
    expect(row(view, 'prompt-global-concise').getAttribute('aria-selected')).toBe('true');
  });
});
