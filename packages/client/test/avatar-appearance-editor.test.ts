// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
}));
import { AvatarAppearanceEditor } from '../src/client/avatar-appearance-editor.js';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { parseBotSummaries } from '../src/client/bridge.js';
import {
  AVATAR_HAIR_PARTS,
  AVATAR_HEADPIECES,
  AVATAR_PARTS,
  AVATAR_PRESETS,
  AVATAR_SPECIES,
  AVATAR_ANIMAL_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  isIllustratedAvatarRecipe,
  seededAvatarRecipe,
  seededAvatarRecipeV2,
  canonicalCustomPart,
  customPartId,
  hairPieceStart,
  replacePartStart,
  headpieceStart,
  withAvatarBuiltInHeadpiece,
  type PixelCustomPart,
} from '../../core/src/bots/avatar-appearance.js';
import type { PartLibraryEntry } from '../../core/src/bots/part-library.js';
import { LINE_PARTS, LINE_PRESETS, seededLineRecipe } from '../../core/src/bots/avatar-line.js';
import { zhTranslate } from '../src/client/locale.js';

describe('Profile Avatar Appearance editing', () => {
  it('offers pixel design and image upload as two choices and marks the one in use', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const upload = vi.fn();
    const remove = vi.fn();
    const render = (bot: Parameters<typeof AvatarAppearanceEditor>[0]['bot']) =>
      act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            onUpload: upload,
            onRemoveImage: remove,
            t: zhTranslate,
          }),
        ),
      );
    const base = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      workspaces: [],
      createdAt: '',
      aggregateState: 'idle',
    };
    try {
      await render(base);
      const rows = () => [...container.querySelectorAll('.bh-avatar-methods > .bh-card-row')];
      expect(container.querySelector('section')?.getAttribute('aria-label')).toBe('头像');
      expect(rows().map((row) => row.querySelector('.bh-card-title')?.textContent)).toEqual([
        '设计像素头像',
        '上传图片',
      ]);
      expect(rows().map((row) => row.getAttribute('data-state'))).toEqual(['current', null]);
      expect(container.querySelector('[data-avatar-remove]')).toBeNull();
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-upload]')!.click());
      expect(upload).toHaveBeenCalledTimes(1);

      await render({ ...base, avatar: '/saved.png' });
      expect(rows().map((row) => row.getAttribute('data-state'))).toEqual([null, 'current']);
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-remove]')!.click());
      expect(remove).toHaveBeenCalledTimes(1);

      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-edit]')!.click());
      expect(container.querySelector('.bh-avatar-methods')).toBeNull();
      expect(container.querySelector('[data-avatar-save]')).not.toBeNull();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('keeps a failed-save draft editable and leaves the committed image untouched', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const save = vi.fn(async () => false);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      workspaces: [],
      createdAt: '',
      avatar: '/saved.png',
      aggregateState: 'idle',
    };
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/saved.png');
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-edit]')!.click());
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-save]')!.click());
      expect(container.querySelector('[role=alert]')).not.toBeNull();
      expect(container.querySelector('[data-avatar-save]')).not.toBeNull();
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-cancel]')!.click());
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/saved.png');
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('previews an unsaved choice, cancels without writing, and saves the selected recipe explicitly', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'working',
      workspaces: [],
      createdAt: '',
      attention: { approvalCount: 2 },
    };
    const click = async (selector: string) =>
      act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-option="hair:bob"]');
      expect(container.querySelector('[data-avatar-preview] svg')).not.toBeNull();
      expect(container.querySelector('[data-avatar-preview] [data-approval-count="2"]')).toBeNull();
      expect(
        container.querySelector('.bh-avatar-editor-title [data-approval-count="2"]'),
      ).not.toBeNull();
      expect(container.querySelectorAll('[data-avatar-option^="hair:"]')).toHaveLength(
        AVATAR_PARTS.hair.length,
      );
      expect(
        container.querySelector('[data-avatar-option="hair:bob"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      expect(save).not.toHaveBeenCalled();
      await click('[data-avatar-cancel]');
      expect(save).not.toHaveBeenCalled();
      await click('[data-avatar-edit]');
      expect(
        container
          .querySelector(`[data-avatar-option="hair:${seededAvatarRecipe('Ada').hair}"]`)
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-category="accessory"]');
      await click('[data-avatar-option="accessory:crown"]');
      await click('[data-avatar-category="colors"]');
      await click('[data-avatar-option="shirtColor:#3d9970"]');
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith('dm-ada', {
        ...seededAvatarRecipe('Ada'),
        accessory: 'crown',
        shirtColor: '#3d9970',
      });
      expect(container.querySelector('[data-avatar-save]')).toBeNull();
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="presets"]');
      expect(container.querySelectorAll('[data-avatar-option^="preset:"]')).toHaveLength(
        AVATAR_PRESETS.length,
      );
      await click('[data-avatar-option="preset:2"]');
      expect(
        container.querySelector('[data-avatar-option="preset:2"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-save]');
      expect(save).toHaveBeenLastCalledWith('dm-ada', AVATAR_PRESETS[2]);
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="bangs"]');
      expect(container.querySelectorAll('[data-avatar-option^="bangs:"]')).toHaveLength(
        AVATAR_HAIR_PARTS.bangs.length,
      );
      await click('[data-avatar-option="bangs:sweep"]');
      await click('[data-avatar-category="backHair"]');
      await click('[data-avatar-option="backHair:twintails"]');
      await click('[data-avatar-category="shape"]');
      expect(container.querySelector('input[name="hairLength"]')).not.toBeNull();
      await click('[data-avatar-save]');
      expect(save).toHaveBeenLastCalledWith(
        'dm-ada',
        expect.objectContaining({
          bangs: 'sweep',
          backHair: 'twintails',
          spacing: 0,
          height: 0,
          hairLength: 0,
        }),
      );
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('saves a goblin with separately styled and colored side hair', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'grub',
      displayName: 'Grub',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const click = async (selector: string) =>
      act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-grub',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="species"]');
      expect(container.querySelectorAll('[data-avatar-option^="species:"]')).toHaveLength(
        AVATAR_SPECIES.length + AVATAR_ANIMAL_SPECIES.length,
      );
      await click('[data-avatar-option="species:goblin"]');
      expect(
        container
          .querySelector('[data-avatar-option="species:goblin"]')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-category="sideHair"]');
      await click('[data-avatar-option="sideHair:long"]');
      await click('[data-avatar-category="rightSideHair"]');
      await click('[data-avatar-option="rightSideHair:none"]');
      await click('[data-avatar-category="colors"]');
      const skin = AVATAR_SPECIES_SWATCHES.goblin;
      expect(container.querySelectorAll('[data-avatar-option^="skinColor:"]')).toHaveLength(
        skin.length,
      );
      await click('[data-avatar-option="leftSideHairColor:#e2b04a"]');
      await click('[data-avatar-option="rightSideHairColor:#3fc1b8"]');
      await click('[data-avatar-color-reset="rightSideHairColor"]');
      expect(container.querySelector('[data-avatar-color-reset="rightSideHairColor"]')).toBeNull();
      await click('[data-avatar-save]');
      const saved = (save.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect(saved).toMatchObject({
        assetVersion: 2,
        species: 'goblin',
        sideHair: 'long',
        rightSideHair: 'none',
        leftSideHairColor: '#e2b04a',
        skinColor: skin[0],
      });
      expect(saved).not.toHaveProperty('rightSideHairColor');
      expect(isIllustratedAvatarRecipe(saved)).toBe(true);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('dresses a dwarf, keeps hidden hair, and grows a talking flower', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'gimli',
      displayName: 'Gimli',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const click = async (selector: string) =>
      act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-gimli',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="species"]');
      await click('[data-avatar-option="species:dwarf"]');
      expect(container.querySelector('[data-avatar-category="petals"]')).toBeNull();
      await click('[data-avatar-category="beard"]');
      await click('[data-avatar-option="beard:braided"]');
      await click('[data-avatar-category="outfit"]');
      await click('[data-avatar-option="outfit:armor"]');
      await click('[data-avatar-category="backHair"]');
      await click('[data-avatar-option="backHair:long"]');
      await click('[data-avatar-category="accessory"]');
      await click('[data-avatar-option="accessory:helmet"]');
      await click('[data-avatar-category="backHair"]');
      expect(container.querySelector('[data-avatar-hidden-note="backHair"]')).not.toBeNull();
      await click('[data-avatar-save]');
      const dwarf = (save.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect(dwarf).toMatchObject({
        species: 'dwarf',
        beard: 'braided',
        outfit: 'armor',
        accessory: 'helmet',
        backHair: 'long',
      });
      expect(isIllustratedAvatarRecipe(dwarf)).toBe(true);

      await click('[data-avatar-edit]');
      await click('[data-avatar-category="beard"]');
      await click('[data-avatar-option="beard:none"]');
      await click('[data-avatar-category="species"]');
      await click('[data-avatar-option="species:flower"]');
      expect(container.querySelector('[data-avatar-category="beard"]')).toBeNull();
      await click('[data-avatar-category="petals"]');
      await click('[data-avatar-option="petals:sunflower"]');
      await click('[data-avatar-category="flowerBase"]');
      await click('[data-avatar-option="flowerBase:pot"]');
      await click('[data-avatar-category="outfit"]');
      expect(container.querySelector('[data-avatar-hidden-note="outfit"]')).not.toBeNull();
      await click('[data-avatar-save]');
      const flower = (save.mock.calls[1] as unknown[])[1] as Record<string, unknown>;
      expect(flower).toMatchObject({
        species: 'flower',
        petals: 'sunflower',
        flowerBase: 'pot',
      });
      expect(flower).not.toHaveProperty('beard');
      expect(isIllustratedAvatarRecipe(flower)).toBe(true);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('starts a new Bot from its full-domain seed and keeps older Bots on their original face', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'gimli',
      displayName: 'Gimli',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
      avatarSeed: 2 as const,
    };
    const face = async (avatarSeed: 2 | undefined) => {
      const frame = document.createElement('div');
      const avatar = createRoot(frame);
      await act(() =>
        avatar.render(
          createElement(PersonaBotAvatar, {
            personaBotId: 'gimli',
            name: 'Gimli',
            avatarSeed,
            size: 32,
            still: true,
          }),
        ),
      );
      const markup = frame.innerHTML;
      await act(() => avatar.unmount());
      return markup;
    };
    try {
      expect(seededAvatarRecipeV2('Gimli')).not.toEqual(seededAvatarRecipe('Gimli'));
      expect(await face(2)).not.toBe(await face(undefined));
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-gimli',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-edit]')!.click());
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-save]')!.click());
      expect(save).toHaveBeenCalledWith('dm-gimli', seededAvatarRecipeV2('Gimli'));
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('draws a mirrored headpiece, saves it to the Part Library and wears it', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const add = vi.fn(
      async (part: PixelCustomPart, name: string, parent?: string): Promise<PartLibraryEntry> => ({
        id: customPartId(part),
        part: canonicalCustomPart(part),
        name,
        origins: ['drawn'],
        ...(parent ? { parent } : {}),
        addedAt: '2026-10-08T00:00:00.000Z',
      }),
    );
    const load = vi.fn(async (): Promise<PartLibraryEntry[]> => []);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const press = async (x: number, y: number) =>
      act(() => {
        $(`[data-part-cell="${x},${y}"]`)!.dispatchEvent(
          new Event('pointerdown', { bubbles: true, cancelable: true }),
        );
        $('[data-part-canvas]')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
      });
    const ink = (x: number, y: number) =>
      $(`[data-part-cell="${x},${y}"]`)?.getAttribute('data-part-ink');
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            library: { load, add },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="headpiece"]');
      expect(load).toHaveBeenCalledTimes(1);
      expect($('[data-avatar-option="headpiece:none"]')?.getAttribute('aria-pressed')).toBe('true');
      await click('[data-part-draw]');
      expect($('[data-avatar-save]')?.hasAttribute('disabled')).toBe(true);

      await press(10, 2);
      expect(ink(10, 2)).toBe('hairColor:0');
      expect(ink(21, 2)).toBe('hairColor:0');
      expect(ink(11, 2)).toBeNull();

      for (let x = 0; x <= 15; x++) await press(x, 6);
      expect(ink(31, 6)).toBe('hairColor:0');
      await click('[data-part-mirror]');
      await click('[data-part-tool="fill"]');
      await click('[data-part-ink="#efb93f:1"]');
      await press(6, 0);
      expect(ink(6, 0)).toBe('#efb93f:1');
      expect(ink(6, 7)).toBeNull();
      expect(ink(25, 0)).toBe('#efb93f:1');
      await click('[data-part-undo]');
      expect(ink(6, 0)).toBeNull();
      await click('[data-part-redo]');
      expect(ink(6, 0)).toBe('#efb93f:1');
      await click('[data-part-undo]');

      await click('[data-part-tool="pencil"]');
      await click('[data-part-layer="back"]');
      await press(15, 8);
      expect(ink(15, 8)).toBe('#efb93f:1');
      await click('[data-part-layer="front"]');
      expect($('[data-part-cell="15,8"]')?.getAttribute('data-part-other')).toBe('true');
      expect($('[data-part-preview] svg')).not.toBeNull();

      const name = $('[data-part-name]') as HTMLInputElement;
      await act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          name,
          'Gold band',
        );
        name.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click('[data-part-save]');
      expect(add).toHaveBeenCalledTimes(1);
      const [part, saved, parent] = add.mock.calls[0]!;
      expect(saved).toBe('Gold band');
      expect(parent).toBeUndefined();
      expect(part.back).toEqual([[15, 8, '#efb93f', 1]]);
      expect(part.front.filter(([, y]) => y === 6)).toHaveLength(32);
      expect(part.front).toContainEqual([10, 2, 'hairColor', 0]);
      expect(part.front).toContainEqual([21, 2, 'hairColor', 0]);
      expect(part.front.some(([x, y]) => x === 6 && y === 0)).toBe(false);
      expect($('[data-part-editor]')).toBeNull();
      const id = customPartId(part);
      expect($(`[data-avatar-option="headpiece:${id}"]`)?.getAttribute('aria-pressed')).toBe(
        'true',
      );

      await click('[data-part-edit]');
      await click('[data-part-tool="eraser"]');
      await press(10, 2);
      await click('[data-part-save]');
      const [edited, , editedParent] = add.mock.calls[1]!;
      expect(editedParent).toBe(id);
      expect(edited.front).toHaveLength(32);
      expect(edited.front.some(([, y]) => y === 2)).toBe(false);
      expect(edited.back).toEqual(part.back);

      await click(`[data-avatar-option="headpiece:${id}"]`);
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith(
        'dm-ada',
        expect.objectContaining({ assetVersion: 3, headpiece: canonicalCustomPart(part) }),
      );
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('draws a hair piece from the built-in style, wears it and switches back', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const add = vi.fn(
      async (part: PixelCustomPart, name: string, parent?: string): Promise<PartLibraryEntry> => ({
        id: customPartId(part),
        part: canonicalCustomPart(part),
        name,
        origins: ['drawn'],
        ...(parent ? { parent } : {}),
        addedAt: '2026-10-08T00:00:00.000Z',
      }),
    );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const press = async (x: number, y: number) =>
      act(() => {
        $(`[data-part-cell="${x},${y}"]`)!.dispatchEvent(
          new Event('pointerdown', { bubbles: true, cancelable: true }),
        );
        $('[data-part-canvas]')!.dispatchEvent(new Event('pointerup', { bubbles: true }));
      });
    const start = hairPieceStart(seededAvatarRecipe('Ada'), 'bangs');
    const [x, y] = start.front[0]!;
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            library: { load: vi.fn(async () => []), add },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="bangs"]');
      await click('[data-part-draw="bangs"]');
      expect($('[data-part-note]')?.textContent).toBe(
        zhTranslate('profile.avatar.part.flattenNote'),
      );
      expect($('[data-part-layer="back"]')).toBeNull();
      expect($(`[data-part-cell="${x},${y}"]`)?.getAttribute('data-part-ink')).toBe('hairColor:0');
      expect(container.querySelectorAll('[data-part-cell]')).toHaveLength(32 * 32);
      await click('[data-part-mirror]');
      await click('[data-part-tool="eraser"]');
      await press(x, y);
      await click('[data-part-save]');
      const [part, , parent] = add.mock.calls[0]!;
      expect(part.slot).toBe('bangs');
      expect(parent).toBeUndefined();
      expect(part.front).toHaveLength(start.front.length - 1);
      const id = customPartId(part);
      expect($(`[data-avatar-option="bangs:${id}"]`)?.getAttribute('aria-pressed')).toBe('true');
      expect(
        $('[data-avatar-option^="bangs:"][aria-pressed="true"]')?.dataset['avatarOption'],
      ).toBe(`bangs:${id}`);

      await click('[data-part-draw="bangs"]');
      expect($('[data-part-note]')).toBeNull();
      await click('[data-part-cancel]');
      expect(add).toHaveBeenCalledTimes(1);

      await click('[data-part-remove="bangs"]');
      expect($(`[data-avatar-option="bangs:${id}"]`)?.getAttribute('aria-pressed')).toBe('false');
      await click(`[data-avatar-option="bangs:${id}"]`);
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith(
        'dm-ada',
        expect.objectContaining({ assetVersion: 3, bangsPart: canonicalCustomPart(part) }),
      );
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('draws an outfit from the built-in style and switches back', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const add = vi.fn(async (part: PixelCustomPart, name: string): Promise<PartLibraryEntry> => ({
      id: customPartId(part),
      part: canonicalCustomPart(part),
      name,
      origins: ['drawn'],
      addedAt: '',
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const start = replacePartStart(seededAvatarRecipe('Ada'), 'outfit');
    const [x, y, color, tone] = start.front[0]!;
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            library: { load: vi.fn(async () => []), add },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="outfit"]');
      await click('[data-part-draw="outfit"]');
      expect($('[data-part-note]')?.textContent).toBe(
        zhTranslate('profile.avatar.part.flattenPartNote'),
      );
      expect($('[data-part-layer="back"]')).toBeNull();
      expect($(`[data-part-cell="${x},${y}"]`)?.getAttribute('data-part-ink')).toBe(
        `${color}:${tone}`,
      );
      await click('[data-part-save]');
      const [part] = add.mock.calls[0]!;
      expect(part.slot).toBe('outfit');
      expect(part.front).toHaveLength(start.front.length);
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith(
        'dm-ada',
        expect.objectContaining({ assetVersion: 3, outfitPart: canonicalCustomPart(part) }),
      );
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('imports part files, filters by origin and exports parts and the library', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const crown: PixelCustomPart = {
      slot: 'headpiece',
      front: [[13, 2, '#efb93f', 0]],
      back: [],
    };
    const ears: PixelCustomPart = { slot: 'headpiece', front: [[9, 1, 'hairColor', 0]], back: [] };
    const entry = (
      part: PixelCustomPart,
      name: string,
      origin: PartLibraryEntry['origins'][number],
    ) => ({
      id: customPartId(part),
      part: canonicalCustomPart(part),
      name,
      origins: [origin],
      addedAt: '',
    });
    const importParts = vi.fn(async () => ({
      added: [entry(ears, 'Ears', 'imported-file')],
      refused: 1,
    }));
    const exportParts = vi.fn(async (id?: string) => ({
      fileName: id ? 'crown.png' : 'part-library.zip',
      data: btoa('x'),
    }));
    const created: string[] = [];
    Object.assign(URL, {
      createObjectURL: () => {
        created.push('blob');
        return 'blob:part';
      },
      revokeObjectURL: () => {},
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            library: {
              load: vi.fn(async () => [entry(crown, 'Crown', 'drawn')]),
              add: vi.fn(async () => undefined),
              importParts,
              exportParts,
            },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="headpiece"]');
      const input = $('[data-part-import] input') as HTMLInputElement;
      const file = new File([new Uint8Array([1, 2, 3])], 'ears.png', { type: 'image/png' });
      Object.defineProperty(file, 'arrayBuffer', {
        value: async () => new Uint8Array([1, 2, 3]).buffer,
      });
      Object.defineProperty(input, 'files', { value: [file] });
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(importParts).toHaveBeenCalledWith(btoa(String.fromCharCode(1, 2, 3)));
      expect($('[data-part-library-note]')?.textContent).toBe(
        zhTranslate('profile.avatar.part.importedRefused', { count: 1, refused: 1 }),
      );
      expect(container.querySelectorAll('[data-avatar-option^="headpiece:"]')).toHaveLength(
        3 + AVATAR_HEADPIECES.length,
      );
      const filter = $('[data-part-origin-filter]') as HTMLSelectElement;
      await act(() => {
        filter.value = 'imported-file';
        filter.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(container.querySelectorAll('[data-avatar-option^="headpiece:"]')).toHaveLength(
        2 + AVATAR_HEADPIECES.length,
      );
      expect($(`[data-avatar-option="headpiece:${customPartId(ears)}"]`)).not.toBeNull();
      await click('[data-part-export-library]');
      expect(exportParts).toHaveBeenLastCalledWith(undefined, undefined);
      await click(`[data-avatar-option="headpiece:${customPartId(ears)}"]`);
      await click('[data-part-export="headpiece"]');
      expect(exportParts).toHaveBeenLastCalledWith(customPartId(ears), canonicalCustomPart(ears));
      expect(created).toHaveLength(2);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('retries loading the Part Library after a failed load', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const load = vi
      .fn<() => Promise<PartLibraryEntry[] | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const click = async (selector: string) =>
      act(() => container.querySelector<HTMLElement>(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            library: { load, add: vi.fn(async () => undefined) },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="headpiece"]');
      expect(container.textContent).not.toContain(zhTranslate('profile.avatar.part.libraryEmpty'));
      await click('[data-avatar-category="hair"]');
      await click('[data-avatar-category="headpiece"]');
      expect(load).toHaveBeenCalledTimes(2);
      expect(container.textContent).toContain(zhTranslate('profile.avatar.part.libraryEmpty'));
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('switches families without substituting parts and saves a bounded line recipe', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    const click = async (selector: string) =>
      act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-option="hair:bob"]');
      await click('[data-avatar-family="line"]');
      expect(
        container.querySelector('[data-avatar-family="line"]')?.getAttribute('aria-checked'),
      ).toBe('true');
      expect(container.querySelector('[data-avatar-option^="hair:"]')).toBeNull();
      expect(container.querySelectorAll('[data-avatar-option^="eyes:"]')).toHaveLength(
        LINE_PARTS.eyes.length,
      );
      await click('[data-avatar-option="eyes:cross"]');
      await click('[data-avatar-category="shape"]');
      const spacing = container.querySelector<HTMLInputElement>('input[name="spacing"]')!;
      await act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          spacing,
          '3',
        );
        spacing.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click('[data-avatar-family="illustrated"]');
      expect(
        container.querySelector('[data-avatar-option="hair:bob"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-family="line"]');
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith('dm-ada', {
        ...seededLineRecipe('Ada'),
        eyes: 'cross',
        spacing: 3,
      });
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
  it('colors every hair piece, adds a strand and wears a built-in headpiece with an accessory', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async (_channel: string, _recipe: unknown) => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const legacy = { ...seededAvatarRecipe('Ada'), accessory: 'catears' } as const;
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
      appearance: { recipe: legacy, revision: '0'.repeat(64) },
    };
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="accessory"]');
      expect($('[data-avatar-option="accessory:catears"]')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
      await click('[data-avatar-category="headpiece"]');
      expect($('[data-avatar-option="headpiece:none"]')?.getAttribute('aria-pressed')).toBe('true');
      await click('[data-avatar-option="headpiece:halo"]');
      expect($('[data-avatar-option="headpiece:halo"]')?.getAttribute('aria-pressed')).toBe('true');
      await click('[data-avatar-category="accessory"]');
      expect($('[data-avatar-option="accessory:none"]')?.getAttribute('aria-pressed')).toBe('true');
      expect($('[data-avatar-option="accessory:catears"]')).toBeNull();
      await click('[data-avatar-option="accessory:bow"]');
      await click('[data-avatar-category="strand"]');
      await click('[data-avatar-option="strand:curl"]');
      await click('[data-avatar-category="colors"]');
      await click('[data-avatar-option="bangsColor:#f06292"]');
      await click('[data-avatar-option="backHairColor:#3fc1b8"]');
      await click('[data-avatar-option="strandColor:#e2b04a"]');
      await click('[data-avatar-color-reset="backHairColor"]');
      await click('[data-avatar-save]');
      const saved = save.mock.calls[0]![1] as Record<string, unknown>;
      expect(saved).toMatchObject({
        assetVersion: 4,
        headpiece: 'halo',
        accessory: 'bow',
        strand: 'curl',
        bangsColor: '#f06292',
        strandColor: '#e2b04a',
      });
      expect(saved['backHairColor']).toBeUndefined();
      expect(AVATAR_HEADPIECES).toContain('wings');
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
  it('imports a plain PNG after showing its colors and labels derived parts', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const band: PixelCustomPart = { slot: 'headpiece', front: [[10, 2, '#efb93f', 0]], back: [] };
    const wings: PixelCustomPart = { slot: 'headpiece', front: [[9, 1, '#f4f1ec', 0]], back: [] };
    const importParts = vi.fn(async () => ({
      added: [],
      refused: 0,
      image: { width: 32, height: 16, colors: 40, slots: ['headpiece'] },
    }));
    const importImage = vi.fn(async () => ({
      id: customPartId(band),
      part: canonicalCustomPart(band),
      name: 'band',
      origins: ['imported-image' as const],
      addedAt: '',
    }));
    const load = vi.fn(async (): Promise<PartLibraryEntry[]> => [
      {
        id: customPartId(wings),
        part: canonicalCustomPart(wings),
        name: 'Wider wings',
        origins: ['derived'],
        parent: 'a'.repeat(64),
        parentAuthor: 'Mika',
        addedAt: '',
      },
    ]);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            library: { load, add: vi.fn(async () => undefined), importParts, importImage },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="headpiece"]');
      expect(
        $(`[data-avatar-option="headpiece:${customPartId(wings)}"]`)?.getAttribute('aria-label'),
      ).toContain(zhTranslate('profile.avatar.part.basedOn', { author: 'Mika' }));
      const input = $('[data-part-import] input') as HTMLInputElement;
      const file = new File([new Uint8Array([1])], 'band.png', { type: 'image/png' });
      Object.defineProperty(file, 'arrayBuffer', { value: async () => new Uint8Array([1]).buffer });
      Object.defineProperty(input, 'files', { value: [file] });
      await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect($('[data-part-image] p')?.textContent).toBe(
        zhTranslate('profile.avatar.part.imageInfo', { width: 32, height: 16, colors: 40 }),
      );
      expect($('[data-part-image-reduce]')).not.toBeNull();
      expect(($('[data-part-image-keep]') as HTMLInputElement).value).toBe('32');
      await act(() => {
        const keep = $('[data-part-image-keep]') as HTMLInputElement;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(keep, '6');
        keep.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        $('[data-part-image-accept]')!.click();
      });
      expect(importImage).toHaveBeenCalledWith(
        btoa(String.fromCharCode(1)),
        'headpiece',
        6,
        'band',
      );
      expect($('[data-part-image]')).toBeNull();
      expect(
        $(`[data-avatar-option="headpiece:${customPartId(band)}"]`)?.getAttribute('aria-pressed'),
      ).toBe('true');
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
  it('opens a built-in headpiece as a flattened starting canvas', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const add = vi.fn(async (part: PixelCustomPart, name: string): Promise<PartLibraryEntry> => ({
      id: customPartId(part),
      part: canonicalCustomPart(part),
      name,
      origins: ['drawn'],
      addedAt: '',
    }));
    const recipe = withAvatarBuiltInHeadpiece(seededAvatarRecipe('Ada'), 'catears');
    const start = headpieceStart(recipe);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
      appearance: { recipe, revision: '0'.repeat(64) },
    };
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            library: { load: vi.fn(async () => []), add },
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="headpiece"]');
      expect($('[data-avatar-option="headpiece:catears"]')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
      await click('[data-part-draw]');
      expect($('[data-part-note]')?.textContent).toBe(
        zhTranslate('profile.avatar.part.flattenPartNote'),
      );
      const [x, y, color, tone] = start.front[0]!;
      expect($(`[data-part-cell="${x},${y}"]`)?.getAttribute('data-part-ink')).toBe(
        `${color}:${tone}`,
      );
      await click('[data-part-save]');
      expect(add.mock.calls[0]![0]).toEqual(canonicalCustomPart(start));
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
  it('makes an animal with a fur pattern and keeps an ear headpiece hidden with a note', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async (_channel: string, _recipe: unknown) => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const click = async (selector: string) => act(() => $(selector)!.click());
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
    };
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      expect($('[data-avatar-category="pattern"]')).toBeNull();
      await click('[data-avatar-category="headpiece"]');
      await click('[data-avatar-option="headpiece:bunnyears"]');
      await click('[data-avatar-category="species"]');
      await click('[data-avatar-option="species:cat"]');
      await click('[data-avatar-category="pattern"]');
      await click('[data-avatar-option="pattern:tabby"]');
      await click('[data-avatar-category="nose"]');
      expect($('[data-avatar-hidden-note="nose"]')).not.toBeNull();
      await click('[data-avatar-category="headpiece"]');
      expect($('[data-avatar-hidden-note="headpiece"]')).not.toBeNull();
      await click('[data-avatar-category="colors"]');
      expect($('[data-avatar-option="skinColor:#9aa3ad"]')).not.toBeNull();
      await click('[data-avatar-option="skinColor:#9aa3ad"]');
      await click('[data-avatar-save]');
      expect(save.mock.calls[0]![1]).toMatchObject({
        assetVersion: 4,
        species: 'cat',
        pattern: 'tabby',
        headpiece: 'bunnyears',
        skinColor: '#9aa3ad',
      });
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});

describe('unsupported saved appearance', () => {
  it('shows the saved snapshot, explains the pause and keeps editing closed', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const [bot] = parseBotSummaries({
      bots: [
        {
          slug: 'ada',
          displayName: 'Ada',
          workspaces: [],
          createdAt: '',
          avatar: 'data:image/png;base64,iVBORw0KGgo=',
          appearance: {
            revision: 'a'.repeat(64),
            recipe: {
              family: 'illustrated',
              schemaVersion: 1,
              assetVersion: 999,
              rigVersion: 1,
              tail: 'swirl',
            },
          },
        },
      ],
    });
    expect(bot?.appearance).toBeUndefined();
    expect(bot?.appearanceUnsupported).toBe(true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot: bot!,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            t: zhTranslate,
          }),
        ),
      );
      expect(container.querySelector('[data-avatar-unsupported]')).not.toBeNull();
      expect(container.querySelector<HTMLButtonElement>('[data-avatar-edit]')?.disabled).toBe(true);
      expect(container.querySelector('[data-avatar-preview] img')).not.toBeNull();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});
