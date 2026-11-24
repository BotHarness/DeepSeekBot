// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AVATAR_PRESETS } from '../../../packages/core/src/bots/avatar-presets';

vi.mock('expo-image', () => ({
  Image: ({ source }: { source: { uri: string } }) => <img src={source.uri} />,
}));
vi.mock('expo-haptics', () => ({ selectionAsync: async () => {} }));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/host/pick-avatar-image', () => ({
  pickAvatarImage: async () => 'data:image/jpeg;base64,AAAA',
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Rect: () => null,
  Circle: () => null,
}));

import { TILTIES_PORTRAITS } from '@botharness/host-client/tilties-avatars';
import type { BotAvatarChoice } from '@botharness/host-client/bot-avatar-choice';
import { CreationAvatar, CreationAvatarPreview } from '../src/ui/shell/creation-avatar';
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

const byTestID = (id: string) => node.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const press = async (id: string) => {
  const element = byTestID(id);
  expect(element, id).not.toBeNull();
  await act(async () => element?.click());
};
const render = (avatar: BotAvatarChoice | undefined, onChange = vi.fn()) =>
  act(async () =>
    root.render(
      <CreationAvatar
        avatar={avatar}
        name="A"
        imported={false}
        disabled={false}
        onChange={onChange}
      >
        <input data-testid="create-bot-name" />
      </CreationAvatar>,
    ),
  );

it('leads with the preview and name, then photo, style tabs, Random and inline presets', async () => {
  await render({ kind: 'generated', seed: 'initial', origin: 'initial' });
  const order = [
    'create-bot-avatar-preview',
    'create-bot-name',
    'create-bot-avatar-photo',
    'create-bot-avatar-random',
    'create-bot-avatar-tilties-' + TILTIES_PORTRAITS[0]?.id,
  ].map((id) => byTestID(id));
  for (const [index, element] of order.entries()) {
    expect(element).not.toBeNull();
    const next = order[index + 1];
    if (next)
      expect(element?.compareDocumentPosition(next) ?? 0).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  }
  expect(node.querySelectorAll('[data-testid^="create-bot-avatar-tilties-"]')).toHaveLength(
    TILTIES_PORTRAITS.length,
  );
  expect(node.textContent).not.toContain('Customize');
});

it('chooses a preset directly and marks it selected', async () => {
  const [, second] = TILTIES_PORTRAITS;
  if (!second) throw Error('Expected Tilties');
  const change = vi.fn();
  await render(undefined, change);
  await press('create-bot-avatar-tilties-' + second.id);
  expect(change).toHaveBeenLastCalledWith({ kind: 'photo', image: second.image });
  await render({ kind: 'photo', image: second.image }, change);
  expect(byTestID('create-bot-avatar-tilties-' + second.id)?.getAttribute('aria-checked')).toBe(
    'true',
  );
});

it('switches to Pixel presets, and Random follows the visible style', async () => {
  const change = vi.fn();
  const current = TILTIES_PORTRAITS[0]?.image ?? '';
  await render({ kind: 'photo', image: current }, change);
  await press('create-bot-avatar-random');
  const tilties = change.mock.lastCall?.[0] as BotAvatarChoice;
  expect(tilties.kind).toBe('photo');
  expect(tilties.kind === 'photo' && tilties.image).not.toBe(current);
  expect(TILTIES_PORTRAITS.some((p) => tilties.kind === 'photo' && p.image === tilties.image)).toBe(
    true,
  );

  const pixelTab = [...node.querySelectorAll<HTMLElement>('[role="tab"], button')].find(
    (element) => element.textContent === 'Pixel',
  );
  expect(pixelTab).toBeDefined();
  await act(async () => pixelTab?.click());
  expect(node.querySelectorAll('[data-testid^="create-bot-avatar-pixel-"]')).toHaveLength(
    AVATAR_PRESETS.length,
  );
  await press('create-bot-avatar-pixel-1');
  expect(change).toHaveBeenLastCalledWith({ kind: 'recipe', recipe: AVATAR_PRESETS[0] });
  await press('create-bot-avatar-random');
  expect(change.mock.lastCall?.[0]).toMatchObject({ kind: 'generated', seed: expect.any(String) });
});

it('opens on Pixel when the draft already holds a chosen pixel avatar', async () => {
  await render({ kind: 'recipe', recipe: AVATAR_PRESETS[1]! });
  expect(byTestID('create-bot-avatar-pixel-2')?.getAttribute('aria-checked')).toBe('true');
});

it('sets a photo from the photo action', async () => {
  const change = vi.fn();
  await render(undefined, change);
  await press('create-bot-avatar-photo');
  expect(change).toHaveBeenLastCalledWith({ kind: 'photo', image: 'data:image/jpeg;base64,AAAA' });
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
