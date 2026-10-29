// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Appearance } from '../src/client/appearance.js';
import {
  ColorSchemePicker,
  ThemePresetPicker,
  applyPreset,
} from '../src/client/appearance-pickers.js';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const t = ((key: string) => key) as never;

it('marks the chosen scheme and applies a palette to both modes', () => {
  let raw: string | null = null;
  let n = 0;
  const appearance = new Appearance(
    { getItem: () => raw, setItem: (_key, value) => void (raw = value) },
    () => 'light',
    () => `prefs-${++n}`,
  );
  const onChange = vi.fn();
  const render = () => {
    const config = appearance.getSnapshot().config;
    act(() =>
      root.render(
        <>
          <ColorSchemePicker value={config.preference} config={config} t={t} onChange={onChange} />
          <ThemePresetPicker
            config={config}
            t={t}
            onSelect={(preset) => applyPreset(appearance, preset)}
          />
        </>,
      ),
    );
  };
  render();
  const checked = () =>
    [...host.querySelectorAll('[role="radio"][aria-checked="true"]')].map((n) => n.textContent);
  expect(checked()).toEqual(['settings.theme.system', 'appearance.classicBlue']);
  act(() => host.querySelectorAll<HTMLButtonElement>('[role="radio"]')[2]!.click());
  expect(onChange).toHaveBeenCalledWith('dark');
  appearance.update({ mode: 'light', primary: '#123456' });
  const forest = [...host.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (n) => n.textContent === 'appearance.forestGreen',
  )!;
  act(() => forest.click());
  render();
  const modes = appearance.getSnapshot().config.modes;
  expect(modes.light.preset).toBe('forest-green');
  expect(modes.dark.preset).toBe('forest-green');
  expect(modes.light.primary).toBeUndefined();
  expect(checked()).toContain('appearance.forestGreen');
});
