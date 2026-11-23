// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_LINE_RECIPE } from '../../../packages/core/src/bots/avatar-line';
import {
  seededAvatarFor,
  type AvatarRecipe,
} from '../../../packages/core/src/bots/avatar-appearance';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('expo-router', () => ({
  router: { push },
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
import { TiltiesPicker } from '../src/ui/shell/tilties-picker';
import { TILTIES_PORTRAITS } from '@botharness/host-client/tilties-avatars';
import { CreationAvatar, CreationAvatarPreview } from '../src/ui/shell/creation-avatar';
import { interfacePreferences } from '../src/ui/interface-preferences';

let root: Root;
let node: HTMLDivElement;
beforeEach(() => {
  push.mockClear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  interfacePreferences.setLanguage('en');
  node = document.createElement('div');
  root = createRoot(node);
});

it('changes the creation portrait only through its explicit actions', async () => {
  const change = vi.fn();
  await act(async () =>
    root.render(
      <CreationAvatar
        avatar={{ kind: 'generated', seed: 'initial' }}
        name="A"
        imported={false}
        disabled={false}
        onChange={change}
      />,
    ),
  );
  expect(change).not.toHaveBeenCalled();
  click('Customize');
  expect(push).toHaveBeenCalledWith('/create-bot-avatar');
  expect(change).not.toHaveBeenCalled();
  expect(buttonNamed('Shuffle')).toBeUndefined();
  expect(node.querySelector('[data-testid="create-bot-avatar-shuffle"]')).toBeNull();
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
});
function buttonNamed(name: string) {
  return [...node.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.getAttribute('aria-label') === name || b.textContent === name,
  );
}
function click(name: string) {
  const button = buttonNamed(name);
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

it('offers Shuffle only in the Pixel section and keeps the shuffled draft until Done', async () => {
  const saved: AvatarRecipe[] = [];
  const initial = seededAvatarFor('initial', 2);
  await act(async () =>
    root.render(
      <AvatarCustomizer
        initial={initial}
        onSave={async (recipe) => {
          saved.push(recipe);
          return true;
        }}
        onClose={() => {}}
      />,
    ),
  );
  expect(node.querySelector('[data-testid="avatar-editor-shuffle"]')).not.toBeNull();
  const before = node
    .querySelector('[data-testid="avatar-editor-preview"] img')
    ?.getAttribute('src');
  click('Shuffle');
  const after = node
    .querySelector('[data-testid="avatar-editor-preview"] img')
    ?.getAttribute('src');
  expect(after).not.toBe(before);
  click('Line');
  expect(node.querySelector('[data-testid="avatar-editor-shuffle"]')).toBeNull();
  click('Pixel');
  expect(node.querySelector('[data-testid="avatar-editor-preview"] img')?.getAttribute('src')).toBe(
    after,
  );
  expect(saved).toEqual([]);
  await act(async () => click('Done'));
  expect(saved).toHaveLength(1);
  expect(saved[0]).not.toEqual(initial);
  expect(saved[0]?.family).toBe('illustrated');
});

it('lets a Tilties draft pick a portrait directly and saves it only after Done', async () => {
  const [first, second] = TILTIES_PORTRAITS;
  if (!first || !second) throw Error('Expected Tilties');
  const saved: string[] = [];
  const close = vi.fn();
  await act(async () =>
    root.render(
      <TiltiesPicker
        initial={first.image}
        onSave={async (image) => {
          saved.push(image);
          return true;
        }}
        onClose={close}
      />,
    ),
  );
  const checked = (id: string) =>
    node.querySelector(`[data-testid="tilties-avatar-${id}"]`)?.getAttribute('aria-checked');
  expect(checked(first.id)).toBe('true');
  expect(buttonNamed('Shuffle')).toBeUndefined();
  click(second.en);
  expect(checked(second.id)).toBe('true');
  expect(checked(first.id)).toBe('false');
  expect(saved).toEqual([]);
  await act(async () => click('Done'));
  expect(saved).toEqual([second.image]);
  expect(close).toHaveBeenCalledOnce();
});
