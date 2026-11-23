// @vitest-environment jsdom
import { type PixelCustomPart } from '../../core/src/bots/avatar-appearance.js';
import { type PartLibraryEntry } from '../../core/src/bots/part-library.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AvatarAppearanceEditor } from '../src/client/avatar-appearance-editor.js';
import {
  AVATAR_HEADPIECES,
  seededAvatarRecipe,
  canonicalCustomPart,
  customPartId,
  hairPieceStart,
  replacePartStart,
  headpieceStart,
  withAvatarBuiltInHeadpiece,
} from '../../core/src/bots/avatar-appearance.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
}));

describe('Profile Avatar Appearance editing', () => {
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
});
