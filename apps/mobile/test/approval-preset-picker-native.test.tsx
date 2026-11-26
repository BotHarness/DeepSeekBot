// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('@expo/ui/swift-ui/modifiers', () => {
  const modifier = () => undefined;
  return {
    accessibilityIdentifier: modifier,
    accessibilityLabel: modifier,
    buttonStyle: modifier,
    disabled: modifier,
    fixedSize: modifier,
    font: modifier,
    foregroundStyle: modifier,
    frame: modifier,
    lineLimit: modifier,
    tint: modifier,
    truncationMode: modifier,
  };
});
vi.mock('@expo/ui/swift-ui', () => {
  const pass = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    Host: pass,
    HStack: pass,
    Menu: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
    Section: pass,
    Spacer: () => null,
    Image: () => null,
    Text: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
    Button: ({ label, onPress }: { label: string; onPress(): void }) =>
      createElement('button', { onClick: onPress }, label),
    Toggle: ({
      children,
      testID,
      isOn,
      onIsOnChange,
    }: {
      children?: ReactNode;
      testID: string;
      isOn: boolean;
      onIsOnChange(value: boolean): void;
    }) =>
      createElement(
        'button',
        {
          'data-testid': testID,
          'aria-pressed': String(isOn),
          onClick: () => onIsOnChange(!isOn),
        },
        children,
      ),
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', async () => ({
  ...(await import('./compose-menu-shim')).modifiers,
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const base = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  return {
    ...base,
    Box: pass,
    DropdownMenu: Object.assign(pass, { Trigger: pass, Items: pass }),
    useMaterialColors: () => ({ ...base.useMaterialColors(), surfaceContainer: '#f3edf7' }),
  };
});

import type { ApprovalPresetPickerProps } from '../src/ui/chat/approval-preset-picker';
import type { PresetOption } from '../src/ui/chat/approval-preset';
import { ApprovalPresetPicker as IosPicker } from '../src/ui/chat/approval-preset-picker.ios';
import { ApprovalPresetPicker as AndroidPicker } from '../src/ui/chat/approval-preset-picker.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
});

const options: PresetOption[] = [
  { key: '@global', value: '@global', title: 'Follow global', selected: false },
  { key: 'cautious', value: 'cautious', title: 'Cautious', selected: false },
  { key: '@off', value: null, title: 'Off', selected: true },
];

function render(picker: (props: ApprovalPresetPickerProps) => ReactNode) {
  const onSelect = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root!.render(
      createElement(picker, {
        label: 'Auto approval · Off',
        value: 'No auto approval',
        header: 'Preset',
        note: 'Applies next time',
        options,
        disabled: false,
        onSelect,
      }),
    ),
  );
  return { view: container, onSelect };
}

describe('Native Auto approval preset pickers', () => {
  it('iOS sends a pick of the shown preset and keeps its check', () => {
    const { view, onSelect } = render(IosPicker);
    const off = () =>
      view.querySelector<HTMLElement>('[data-testid="approval-preset-option-@off"]')!;
    act(() => off().click());
    expect(onSelect).toHaveBeenCalledWith(options[2]);
    expect(off().getAttribute('aria-pressed')).toBe('true');
  });

  it('Android shows only the preset name in its trigger', () => {
    const { view } = render(AndroidPicker);
    const trigger = view.querySelector<HTMLElement>('[data-testid="approval-preset-trigger"]')!;
    expect(trigger.textContent).toBe('No auto approval');
    expect(trigger.getAttribute('aria-label')).toBe('Auto approval · Off');
  });

  it('Android sends a pick of the shown preset', () => {
    const { view, onSelect } = render(AndroidPicker);
    act(() =>
      view.querySelector<HTMLElement>('[data-testid="approval-preset-option-@off"]')!.click(),
    );
    expect(onSelect).toHaveBeenCalledWith(options[2]);
  });
});
