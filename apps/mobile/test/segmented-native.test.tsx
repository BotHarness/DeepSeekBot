// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const dimensions = vi.hoisted(() => ({ width: 390, height: 844, scale: 3, fontScale: 1 }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  useWindowDimensions: () => dimensions,
}));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@expo/ui/jetpack-compose', () => {
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const ToggleButton = ({
    checked,
    onCheckedChange,
    children,
  }: {
    checked: boolean;
    onCheckedChange(checked: boolean): void;
    children: ReactNode;
  }) =>
    createElement(
      'button',
      { 'aria-pressed': String(checked), onClick: () => onCheckedChange(!checked) },
      children,
    );
  return { Host: pass, Row: pass, ToggleButton, Text: pass };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  fillMaxWidth: () => ({}),
  selectableGroup: () => ({}),
  weight: () => ({}),
  defaultMinSize: () => ({}),
  testID: () => ({}),
}));
vi.mock('@expo/ui/swift-ui', () => ({
  Host: ({ children }: { children?: ReactNode }) => children ?? null,
  Picker: ({
    selection,
    onSelectionChange,
    children,
  }: {
    selection: string;
    onSelectionChange(value: string): void;
    children: ReactNode;
  }) =>
    createElement(
      'select',
      {
        value: selection,
        onChange: (event: { target: { value: string } }) => onSelectionChange(event.target.value),
      },
      children,
    ),
  Text: ({ children, modifiers }: { children: ReactNode; modifiers: { tag: string }[] }) =>
    createElement('option', { value: modifiers[0]!.tag }, children),
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityLabel: () => ({}),
  pickerStyle: () => ({}),
  tag: (tag: string) => ({ tag }),
}));

import { Segmented as AndroidSegmented } from '../src/ui/primitives/segmented.android';
import { Segmented as IosSegmented } from '../src/ui/primitives/segmented.ios';
import { Segmented } from '../src/ui/primitives/segmented';
import { haptic } from '../src/ui/haptics';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
  dimensions.width = 390;
  dimensions.fontScale = 1;
});

const options = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

function render(element: ReturnType<typeof createElement>) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(element));
  return host;
}

describe('native segmented control', () => {
  for (const [name, Component] of [
    ['custom', Segmented],
    ['Material', AndroidSegmented],
    ['Android fallback', AndroidSegmented],
  ] as const) {
    it(`${name} permits a fresh choice after a newer commit skips an older pending choice`, () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const choices = [...options, { value: 'system', label: 'System' }];
      const onChange = vi.fn(() => new Promise<void>(() => {}));
      const view = render(
        createElement(Component, { label: 'Preview', options: choices, value: 'light', onChange }),
      );
      act(() => view.querySelectorAll('button')[1]!.click());
      act(() => view.querySelectorAll('button')[2]!.click());
      act(() =>
        root!.render(
          createElement(Component, {
            label: 'Preview',
            options: choices,
            value: 'system',
            onChange,
          }),
        ),
      );
      expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
      act(() => view.querySelectorAll('button')[1]!.click());
      expect(onChange.mock.calls).toEqual([['dark'], ['system'], ['dark']]);
    });

    it(`${name} does not acknowledge a later external change to a superseded choice`, async () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const choices = [...options, { value: 'system', label: 'System' }];
      const onChange = vi.fn();
      const view = render(
        createElement(Component, { label: 'Preview', options: choices, value: 'light', onChange }),
      );
      await act(async () => view.querySelectorAll('button')[1]!.click());
      await act(async () => view.querySelectorAll('button')[2]!.click());
      for (const value of ['system', 'dark']) {
        act(() =>
          root!.render(
            createElement(Component, { label: 'Preview', options: choices, value, onChange }),
          ),
        );
      }
      expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
    });

    it(`${name} acknowledges overlapping delayed selection commits independently`, async () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const choices = [...options, { value: 'system', label: 'System' }];
      const onChange = vi.fn();
      const view = render(
        createElement(Component, { label: 'Preview', options: choices, value: 'light', onChange }),
      );
      await act(async () => view.querySelectorAll('button')[1]!.click());
      await act(async () => view.querySelectorAll('button')[2]!.click());
      expect(onChange.mock.calls).toEqual([['dark'], ['system']]);
      expect(haptic).not.toHaveBeenCalled();
      for (const value of ['dark', 'system']) {
        act(() =>
          root!.render(
            createElement(Component, { label: 'Preview', options: choices, value, onChange }),
          ),
        );
      }
      expect(haptic).toHaveBeenCalledTimes(2);
      expect(haptic).toHaveBeenLastCalledWith('selection');
    });

    it(`${name} acknowledges a controlled commit after the callback completes`, async () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const onChange = vi.fn();
      const view = render(
        createElement(Component, { label: 'Preview', options, value: 'light', onChange }),
      );
      await act(async () => view.querySelectorAll('button')[1]!.click());
      expect(haptic).not.toHaveBeenCalled();
      act(() =>
        root!.render(
          createElement(Component, { label: 'Preview', options, value: 'dark', onChange }),
        ),
      );
      expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
    });

    it(`${name} gives immediate committed feedback while the caller's network work remains pending`, () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const deferred = new Promise<void>(() => {});
      const onChange = vi.fn();
      function Harness() {
        const [value, setValue] = useState('light');
        return createElement(Component, {
          label: 'Preview',
          options,
          value,
          onChange: (next) => {
            setValue(next);
            onChange(next);
            return deferred;
          },
        });
      }
      const view = render(createElement(Harness));
      act(() => view.querySelectorAll('button')[1]!.click());
      act(() => view.querySelectorAll('button')[1]!.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith('dark');
      expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
    });

    it(`${name} acknowledges only caller-committed selection without waiting for deferred work`, () => {
      const onChange = vi.fn(() => new Promise<void>(() => {}));
      if (name === 'Android fallback') dimensions.width = 100;
      const view = render(
        createElement(Component, { label: 'Preview', options, value: 'light', onChange }),
      );
      const buttons = [...view.querySelectorAll('button')];
      act(() => buttons[0]!.click());
      expect(haptic).not.toHaveBeenCalled();
      act(() => {
        buttons[1]!.click();
        buttons[1]!.click();
      });
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith('dark');
      expect(haptic).not.toHaveBeenCalled();
      const selectedAttribute =
        name === 'custom' ? 'aria-selected' : name === 'Material' ? 'aria-pressed' : 'aria-checked';
      expect(buttons[1]!.getAttribute(selectedAttribute)).toBe('false');
      act(() =>
        root!.render(
          createElement(Component, { label: 'Preview', options, value: 'dark', onChange }),
        ),
      );
      expect(buttons[1]!.getAttribute(selectedAttribute)).toBe('true');
      expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
      act(() => buttons[0]!.click());
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(haptic).toHaveBeenCalledTimes(1);
      act(() =>
        root!.render(
          createElement(Component, { label: 'Preview', options, value: 'light', onChange }),
        ),
      );
      expect(haptic).toHaveBeenCalledTimes(2);
    });

    it(`${name} follows subsequent controlled value changes without extra feedback`, () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const onChange = vi.fn();
      const view = render(
        createElement(Component, { label: 'Preview', options, value: 'light', onChange }),
      );
      act(() => view.querySelectorAll('button')[1]!.click());
      act(() =>
        root!.render(
          createElement(Component, { label: 'Preview', options, value: 'dark', onChange }),
        ),
      );
      act(() => view.querySelectorAll('button')[1]!.click());
      expect(onChange).toHaveBeenCalledExactlyOnceWith('dark');
      expect(haptic).toHaveBeenCalledExactlyOnceWith('selection');
      act(() =>
        root!.render(
          createElement(Component, { label: 'Preview', options, value: 'light', onChange }),
        ),
      );
      act(() => view.querySelectorAll('button')[1]!.click());
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(haptic).toHaveBeenCalledTimes(1);
    });

    it(`${name} permits retries after a refused choice without changing controlled appearance`, async () => {
      if (name === 'Android fallback') dimensions.width = 100;
      const onChange = vi.fn();
      const view = render(
        createElement(Component, { label: 'Preview', options, value: 'light', onChange }),
      );
      await act(async () => view.querySelectorAll('button')[1]!.click());
      await act(async () => view.querySelectorAll('button')[1]!.click());
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(haptic).not.toHaveBeenCalled();
    });
  }

  it('keeps one Android button selected and reports only a new choice', () => {
    const onChange = vi.fn();
    const view = render(
      createElement(AndroidSegmented, { label: 'Preview', options, value: 'light', onChange }),
    );
    const buttons = [...view.querySelectorAll('button')];
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    act(() => buttons[0]!.click());
    expect(onChange).not.toHaveBeenCalled();
    act(() => buttons[1]!.click());
    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('shows readable radio choices at large Android text sizes', () => {
    dimensions.fontScale = 3;
    const onChange = vi.fn();
    const view = render(
      createElement(AndroidSegmented, {
        label: 'Sort Bots',
        options: [
          { value: 'updated', label: 'Recently updated' },
          { value: 'created', label: 'Recently added' },
          { value: 'stars', label: 'Most popular' },
        ],
        value: 'updated',
        onChange,
      }),
    );
    const choices = [...view.querySelectorAll('[role="radio"]')];
    expect(choices.map((choice) => choice.textContent)).toEqual([
      'Recently updated',
      'Recently added',
      'Most popular',
    ]);
    expect(choices.map((choice) => choice.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    act(() => choices[2]!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('stars');
  });

  it('uses a SwiftUI segmented picker on iOS with one tagged segment per option', () => {
    const onChange = vi.fn();
    const view = render(
      createElement(IosSegmented, { label: 'Preview', options, value: 'dark', onChange }),
    );
    const segments = [...view.querySelectorAll('option')];
    expect(segments.map((segment) => [segment.value, segment.textContent])).toEqual([
      ['light', 'Light'],
      ['dark', 'Dark'],
    ]);
    const picker = view.querySelector('select')!;
    act(() => {
      picker.value = 'light';
      picker.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledExactlyOnceWith('light');
    expect(haptic).not.toHaveBeenCalled();
  });
});
