// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_LINE_RECIPE } from '../../../packages/core/src/bots/avatar-line';
import {
  seededAvatarFor,
  type AvatarRecipe,
} from '../../../packages/core/src/bots/avatar-appearance';

vi.mock('expo-router', () => ({
  Stack: {
    Screen: ({ options }: { options: { headerRight?: () => unknown } }) =>
      options.headerRight?.() ?? null,
  },
}));
vi.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} />,
}));
vi.mock('expo-haptics', () => ({ selectionAsync: async () => {} }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/host/pick-avatar-image', () => ({ pickAvatarImage: async () => undefined }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/avatar-range', () => ({ AvatarRange: () => null }));
vi.mock('../src/ui/primitives/sheet-save-button', () => ({
  SheetSaveButton: ({
    label,
    onPress,
    busy,
  }: {
    label: string;
    onPress(): void;
    busy: boolean;
  }) => (
    <button disabled={busy} onClick={onPress}>
      {label}
    </button>
  ),
}));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Rect: () => null,
  Circle: () => null,
}));

import { AvatarCustomizer } from '../src/ui/shell/avatar-customizer';
import { CreationAvatarPreview } from '../src/ui/shell/creation-avatar';
import { interfacePreferences } from '../src/ui/interface-preferences';

let root: Root;
let node: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  interfacePreferences.setLanguage('en');
  node = document.createElement('div');
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});
function click(name: string) {
  const button = [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent === name,
  );
  expect(button, name).toBeDefined();
  if (button) act(() => button.click());
}

it('keeps edits local, retains each style draft, and saves only after Done', async () => {
  const saved: AvatarRecipe[] = [];
  const close = vi.fn();
  const initial = seededAvatarFor('initial', 2);
  await act(async () =>
    root.render(
      <AvatarCustomizer
        initial={initial}
        onSave={async (recipe) => {
          saved.push(recipe);
          return true;
        }}
        onClose={close}
      />,
    ),
  );
  click('Line');
  click('Smiling');
  click('Pixel');
  click('Line');
  expect(saved).toEqual([]);
  expect(close).not.toHaveBeenCalled();
  await act(async () => click('Done'));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({ ...DEFAULT_LINE_RECIPE, eyes: 'smile' });
  expect(close).toHaveBeenCalledOnce();
});

it('keeps its editable draft open when applying fails', async () => {
  const close = vi.fn();
  await act(async () =>
    root.render(
      <AvatarCustomizer initial={DEFAULT_LINE_RECIPE} onSave={async () => false} onClose={close} />,
    ),
  );
  click('Smiling');
  await act(async () => click('Done'));
  expect(close).not.toHaveBeenCalled();
  expect(node.textContent).toContain('Could not save the avatar');
  expect(
    node.querySelector('[data-testid="avatar-option-eyes-smile"]')?.getAttribute('aria-checked'),
  ).toBe('true');
});

it('changing the preview name never changes its image identity', async () => {
  await act(async () =>
    root.render(<CreationAvatarPreview name="A" avatar={undefined} imported={false} />),
  );
  const image = node.querySelector('img');
  const uri = image?.src;
  expect(uri).toMatch(/^data:image\/svg\+xml/);
  await act(async () =>
    root.render(<CreationAvatarPreview name="Another Bot" avatar={undefined} imported={false} />),
  );
  expect(node.querySelector('img')).toBe(image);
  expect(node.querySelector('img')?.src).toBe(uri);
});
