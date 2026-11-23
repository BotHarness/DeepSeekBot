// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AvatarAppearanceEditor } from '../src/client/avatar-appearance-editor.js';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { parseBotSummaries, setBotAvatar } from '../src/client/bridge.js';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
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
} from '../../core/src/bots/avatar-appearance.js';
import { LINE_PARTS, seededLineRecipe } from '../../core/src/bots/avatar-line.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
}));

describe('Profile Avatar Appearance editing', () => {
  it('refuses to use a redacted avatar receipt to update the Bot profile', async () => {
    await expect(
      setBotAvatar(
        async () => ({
          ok: true,
          value: {
            metadataOnly: true,
            bot: {
              slug: 'ada',
              displayName: 'Ada',
              ownerHumanId: 'mia',
              owner: false,
              paused: false,
              createdAt: '2026-11-20T00:00:00Z',
            },
          },
        }),
        'dm-ada',
        null,
      ),
    ).rejects.toBeInstanceOf(HostAnswerInvalid);
  });

  it('shows presets first, previews selections before saving, and keeps upload under the portrait', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const upload = vi.fn();
    const remove = vi.fn();
    const save = vi.fn(async () => true);
    const saveImage = vi.fn(async () => true);
    const render = (bot: Parameters<typeof AvatarAppearanceEditor>[0]['bot']) =>
      act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            onChooseImage: saveImage,
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
      const click = (selector: string) =>
        act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
      expect(container.querySelectorAll('[data-avatar-preset]')).toHaveLength(
        AVATAR_PRESETS.length,
      );
      expect(
        container.querySelector('[data-avatar-preview] + [data-avatar-upload]')?.textContent,
      ).toBe('上传图片');
      expect(container.querySelector('[data-avatar-remove]')).toBeNull();
      await click('[data-avatar-upload]');
      expect(upload).toHaveBeenCalledOnce();

      await render({ ...base, avatar: '/saved.png' });
      await click('[data-avatar-preview-column] [data-avatar-remove]');
      expect(remove).toHaveBeenCalledOnce();
      await click(`[data-avatar-preset="${AVATAR_PRESETS.length - 1}"]`);
      expect(save).not.toHaveBeenCalled();
      expect(
        container.querySelector('[data-avatar-preview] [data-media]')?.getAttribute('data-media'),
      ).toBe('composed');
      await click('[data-avatar-edit]');
      expect(container.querySelector('[data-avatar-preset]')).toBeNull();
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith('dm-ada', AVATAR_PRESETS.at(-1));

      const tilties = [...container.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
        (tab) => tab.textContent === '歪头团',
      );
      expect(tilties).toBeDefined();
      await act(() => tilties!.click());
      expect(container.querySelectorAll('[data-tilties-avatar]')).toHaveLength(36);
      expect(tilties?.getAttribute('aria-selected')).toBe('true');
      expect(container.querySelectorAll('[role="tablist"]')).toHaveLength(1);
      expect(container.querySelector('[data-tilties-avatar="genshin-yelan"]')).toBeNull();
      const deepseek = '[data-tilties-avatar="deepseek"]';
      const image = container.querySelector(`${deepseek} img`)?.getAttribute('src');
      await click(deepseek);
      expect(saveImage).not.toHaveBeenCalled();
      expect(container.querySelector('[data-avatar-preview] img')?.getAttribute('src')).toBe(image);
      await click('[data-avatar-cancel]');
      expect(container.querySelector('[data-avatar-save]')).toBeNull();
      const frostArchivist = '[data-tilties-avatar="frost-archivist"]';
      const newImage = container.querySelector(`${frostArchivist} img`)?.getAttribute('src');
      expect(newImage).toMatch(/^data:image\/webp;base64,/u);
      await click(frostArchivist);
      await click('[data-avatar-save]');
      expect(saveImage).toHaveBeenCalledExactlyOnceWith(newImage);
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
      expect(
        container.querySelector('[data-avatar-preview] .bh-avatar-media-composed img'),
      ).not.toBeNull();
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
