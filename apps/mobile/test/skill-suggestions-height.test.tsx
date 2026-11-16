// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const screen = vi.hoisted(() => ({ height: 874, keyboard: 0 }));

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  useWindowDimensions: () => ({ width: 402, height: screen.height, scale: 3, fontScale: 1 }),
  View: (props: { children?: ReactNode; testID?: string; style?: { maxHeight?: number } }) =>
    createElement(
      'div',
      { 'data-testid': props.testID, 'data-max-height': props.style?.maxHeight },
      props.children,
    ),
  ScrollView: (props: {
    children?: ReactNode;
    testID?: string;
    keyboardShouldPersistTaps?: string;
  }) =>
    createElement(
      'div',
      { 'data-testid': props.testID, 'data-taps': props.keyboardShouldPersistTaps },
      props.children,
    ),
  Pressable: (props: { children?: ReactNode; testID?: string }) =>
    createElement('button', { 'data-testid': props.testID }, null),
}));
vi.mock('react-native-keyboard-controller', () => ({
  useKeyboardState: (pick: (state: { isVisible: boolean; height: number }) => number) =>
    pick({ isVisible: screen.keyboard > 0, height: screen.keyboard }),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 62, bottom: 34, left: 0, right: 0 }),
}));
vi.mock('../src/ui/bot-avatar', () => ({ BotAvatar: () => null }));
vi.mock('../src/ui/primitives/system-symbol', () => ({ SystemSymbol: () => null }));
vi.mock('../src/ui/primitives/drawer-material', () => ({ useLiquidGlass: () => false }));
vi.mock('../src/ui/chat/composer-chrome', () => ({ ComposerFieldMaterial: () => null }));

import type { SkillOption } from '../src/ui/chat/skill-draft';
import { SkillSuggestions } from '../src/ui/chat/skill-suggestions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const options: SkillOption[] = Array.from({ length: 8 }, (_, index) => ({
  name: `skill-${index}`,
  description: 'Writes a long description that wraps onto a second line in the menu',
  owner: { kind: 'host' },
}));

it('caps the bare / menu to half the space above the keyboard and scrolls the rest', async () => {
  const host = document.createElement('div');
  const root = createRoot(host);
  screen.keyboard = 336;
  await act(async () => root.render(<SkillSuggestions options={options} onChoose={() => {}} />));
  const menu = host.querySelector('[data-testid="skill-suggestions"]');
  expect(Number(menu?.getAttribute('data-max-height'))).toBe((874 - 336 - 62) / 2);
  const list = host.querySelector('[data-testid="skill-suggestions-list"]');
  expect(list?.getAttribute('data-taps')).toBe('always');
  expect(list?.querySelectorAll('button')).toHaveLength(8);
  screen.keyboard = 0;
  await act(async () => root.render(<SkillSuggestions options={options} onChoose={() => {}} />));
  expect(Number(menu?.getAttribute('data-max-height'))).toBe((874 - 62) / 2);
  act(() => root.unmount());
});
