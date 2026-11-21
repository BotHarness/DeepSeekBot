// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createChallenge } from '../../core/src/marketplace/altcha.js';
import { avatarDataUrl } from '../../market/test/avatar-fixtures.js';
import type { MarketplaceAvatarEdit } from '@botharness/host-protocol/marketplace-avatar';
import { buttonNamed, fieldNamed, typeInto } from './primitive-mocks.js';
import { BridgeCallError } from '../src/client/bridge.js';
import { zhTranslate as t } from '../src/client/locale.js';
import { MarketAvatars, MarketAvatarPublishDialog } from '../src/client/market-avatars.js';
import {
  BannerCropModal,
  PersonaBotAvatarCropModal,
} from '../src/client/personabot-avatar-crop.js';
import type { MarketplaceAvatarQuery } from '@botharness/host-protocol/marketplace-avatar';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives, shellPrimitives } = await import('./primitive-mocks.js');
  return { ...shellPrimitives(), ...dialogPrimitives() };
});

const image = avatarDataUrl('png');
const avatar = {
  id: 'avatar-a',
  imageUrl: 'https://market.test/avatara.png',
  name: 'Otter',
  description: 'River',
  tags: ['Blue'],
  author: { id: 'k7m2pq', name: 'Alice' },
  applyCount: 0,
};

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal(
    'URL',
    Object.assign(class extends URL {}, {
      createObjectURL: vi.fn(() => 'blob:crop'),
      revokeObjectURL: vi.fn(),
    }),
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ close: vi.fn() })),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function actionsFor() {
  return {
    marketplaceAccount: vi.fn(async () => ({
      signedIn: true,
      author: { ...avatar.author, avatar: null, termsAcceptedAt: '2026-11-21' },
    })),
    marketplaceAuthorSave: vi.fn(async () => ({
      ...avatar.author,
      avatar: null,
      termsAcceptedAt: '2026-11-21',
    })),
    marketplaceAvatarPublish: vi.fn(async () => avatar),
    marketplaceAvatarSource: vi.fn(async () => ({ image })),
    marketplaceAvatarTags: vi.fn(async () => [{ tag: 'blue', count: 2 }]),
    marketplaceAvatarMine: vi.fn(async () => ({ avatars: [{ ...avatar, applyCount: 4 }] })),
    marketplaceAvatarEdit: vi.fn(async (_id: string, patch: MarketplaceAvatarEdit) => ({
      ...avatar,
      applyCount: 4,
      ...patch,
    })),
    marketplaceAvatarDelete: vi.fn(async () => ({ deleted: true as const })),
    marketplaceAvatarList: vi.fn(async ({ cursor }: MarketplaceAvatarQuery = {}) =>
      cursor === undefined
        ? { avatars: [avatar], nextCursor: 'next' }
        : { avatars: [{ ...avatar, id: 'avatar-b', name: 'Bear' }], nextCursor: null },
    ),
    marketplaceAvatarDetail: vi.fn(async () => avatar),
    marketplaceChallenge: vi.fn(async () => {
      const number = 4;
      const challenge = await createChallenge({
        key: 'test',
        tier: 'default',
        now: new Date(),
        number,
      });
      return { ...challenge, maxnumber: number };
    }),
    marketplaceAvatarReport: vi.fn<(id: string, altcha: string, reason?: string) => Promise<void>>(
      async () => {},
    ),
    marketplaceAvatarApplyCandidates: vi.fn(async () => ({
      bots: [
        { slug: 'plain', displayName: 'Plain Bot', hasAppearance: false },
        { slug: 'editable', displayName: 'Editable Bot', hasAppearance: true, avatar: image },
      ],
    })),
    marketplaceAvatarApply: vi.fn(async () => ({ applied: true as const })),
  };
}

it('submits keyword search, combines it with a counted tag and shows the filtered empty state', async () => {
  const actions = actionsFor();
  await act(async () =>
    root.render(
      createElement(MarketAvatars, { actions, t, publishing: false, onClosePublish: vi.fn() }),
    ),
  );
  const search = host.querySelector('input[type="search"]');
  expect(search).toBeInstanceOf(HTMLInputElement);
  if (!(search instanceof HTMLInputElement)) throw new Error('Missing avatar search');
  expect(search.getAttribute('aria-label')).toBe(t('market.avatar.search.label'));
  await typeInto(search, ' river ');
  expect(actions.marketplaceAvatarList).toHaveBeenCalledTimes(1);
  await act(async () =>
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({ q: 'river' });
  const chip = buttonNamed('blue2', host);
  await act(async () => chip.click());
  expect(chip.getAttribute('aria-pressed')).toBe('true');
  expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({ q: 'river', tag: 'blue' });
  await act(async () => buttonNamed(t('market.loadMore'), host).click());
  expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({
    q: 'river',
    tag: 'blue',
    cursor: 'next',
  });
  actions.marketplaceAvatarList.mockResolvedValueOnce({ avatars: [], nextCursor: null });
  await act(async () => buttonNamed(t('market.topics.all'), host).click());
  expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({ q: 'river' });
  expect(host.textContent).toContain(t('market.avatar.search.empty'));
  expect(host.textContent).not.toContain(avatar.name);
});

it('shows the selected Avatar ranking, keeps tag filters and restores the browse grid', async () => {
  const actions = actionsFor();
  actions.marketplaceAvatarList.mockImplementation(async ({ sort } = {}) => ({
    avatars: sort === 'rising' ? [] : [{ ...avatar, name: sort ?? avatar.name }],
    nextCursor: null,
  }));
  await act(async () =>
    root.render(
      createElement(MarketAvatars, { actions, t, publishing: false, onClosePublish: vi.fn() }),
    ),
  );
  expect(host.textContent).toContain(avatar.name);
  await act(async () => buttonNamed('blue2', host).click());
  const tabs = host.querySelector<HTMLElement>('[role="tablist"]');
  if (tabs === null) throw new Error('Missing Avatar ranking tabs');
  expect(tabs.closest('.bh-market-browse')?.querySelector('input[type="search"]')).toBeInstanceOf(
    HTMLInputElement,
  );
  for (const sort of ['hot', 'new', 'rising'] as const) {
    const tab = buttonNamed(t(`market.section.${sort}`), tabs);
    await act(async () => tab.click());
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({ sort, tag: 'blue' });
    if (sort !== 'rising') expect(host.textContent).toContain(sort);
  }
  expect(host.textContent).toContain(t('market.avatar.search.empty'));
  await act(async () => buttonNamed(t('market.topics.all'), host).click());
  expect(host.textContent).toContain(t('market.avatar.ranking.empty'));
  await act(async () => buttonNamed(t('market.avatar.ranking.all'), tabs).click());
  expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({});
  expect(host.textContent).toContain(avatar.name);
});

async function loadSource(width: number, height: number) {
  const preview = document.querySelector('img[src="blob:crop"]');
  if (!(preview instanceof HTMLImageElement)) throw new Error('Missing crop preview');
  Object.defineProperties(preview, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  });
  await act(async () => preview.dispatchEvent(new Event('load')));
}

function mockCanvas() {
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    Object.assign(Object.create(null), { drawImage }),
  );
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(image);
  return { drawImage, encode };
}

it.each([
  ['Bot Avatar', PersonaBotAvatarCropModal],
  ['banner', BannerCropModal],
] as const)('applies the shared crop layout to the %s editor', async (_name, CropModal) => {
  const props = {
    file: new File(['source'], 'crop.png', { type: 'image/png' }),
    t,
    onClose: vi.fn(),
    onSave: vi.fn(async () => true),
  };
  const layout = () => {
    const preview = document.querySelector('img[src="blob:crop"]');
    const viewport = preview?.parentElement;
    const frame = viewport?.parentElement;
    if (!preview || !viewport || !frame) throw new Error('Missing crop viewport');
    return [frame.className, viewport.className, preview.className];
  };
  await act(async () =>
    root.render(createElement(PersonaBotAvatarCropModal, { ...props, marketplace: true })),
  );
  const marketplaceLayout = layout();
  expect(marketplaceLayout).not.toEqual([
    'bh-group-avatar-crop',
    'bh-group-avatar-crop-viewport',
    '',
  ]);
  await act(async () => root.render(createElement(CropModal, props)));
  expect(layout()).toEqual(marketplaceLayout);
});

it.each([
  [320, 1000, 320],
  [1200, 900, 512],
])('crops a %i × %i file to a %i px square', async (width, height, side) => {
  const { drawImage, encode } = mockCanvas();
  const save = vi.fn(async () => true);
  await act(async () =>
    root.render(
      createElement(PersonaBotAvatarCropModal, {
        marketplace: true,
        file: new File(['source'], 'avatar.png', { type: 'image/png' }),
        t,
        onSave: save,
        onClose: vi.fn(),
      }),
    ),
  );
  await loadSource(width, height);
  await act(async () => buttonNamed(t('profile.avatar.crop.save')).click());
  expect(drawImage).toHaveBeenCalledOnce();
  expect(encode.mock.contexts[0]).toMatchObject({ width: side, height: side });
  expect(encode).toHaveBeenCalledWith('image/png');
  expect(save).toHaveBeenCalledWith(image);
});

it('refuses a crop when either source dimension is under 256 px', async () => {
  const save = vi.fn(async () => true);
  await act(async () =>
    root.render(
      createElement(PersonaBotAvatarCropModal, {
        marketplace: true,
        file: new File(['source'], 'avatar.png', { type: 'image/png' }),
        t,
        onSave: save,
        onClose: vi.fn(),
      }),
    ),
  );
  await loadSource(1200, 255);
  expect(document.body.textContent).toContain(t('market.avatar.tooSmall'));
  expect(buttonNamed(t('profile.avatar.crop.save')).disabled).toBe(true);
  expect(save).not.toHaveBeenCalled();
});

it('loads a stored 256 px Avatar and refuses zoom that takes the crop below 256 px', async () => {
  const { encode } = mockCanvas();
  const actions = actionsFor();
  await act(async () =>
    root.render(
      createElement(MarketAvatarPublishDialog, {
        actions,
        avatarSource: 'otter',
        t,
        onClose: vi.fn(),
        onPublished: vi.fn(),
      }),
    ),
  );
  expect(actions.marketplaceAvatarSource).toHaveBeenCalledExactlyOnceWith('otter');
  await loadSource(256, 256);
  const zoom = fieldNamed(t('profile.avatar.crop.zoom'));
  const save = buttonNamed(t('profile.avatar.crop.save'));
  expect(save.disabled).toBe(false);
  await typeInto(zoom, '1.05');
  expect(document.body.textContent).toContain(t('market.avatar.tooSmall'));
  expect(save.disabled).toBe(true);
  await act(async () => save.click());
  expect(encode).not.toHaveBeenCalled();
  await typeInto(zoom, '1');
  await act(async () => save.click());
  expect(encode.mock.contexts[0]).toMatchObject({ width: 256, height: 256 });
  expect(document.querySelector('[data-market-avatar-preview]')).not.toBeNull();
});

it('encodes a zoomed Marketplace crop at its cropped source size', async () => {
  const { encode } = mockCanvas();
  await act(async () =>
    root.render(
      createElement(PersonaBotAvatarCropModal, {
        file: new File(['source'], 'avatar.png', { type: 'image/png' }),
        marketplace: true,
        t,
        onClose: vi.fn(),
        onSave: vi.fn(async () => true),
      }),
    ),
  );
  await loadSource(800, 640);
  await typeInto(fieldNamed(t('profile.avatar.crop.zoom')), '2');
  await act(async () => buttonNamed(t('profile.avatar.crop.save')).click());
  expect(encode.mock.contexts[0]).toMatchObject({ width: 320, height: 320 });
});

it('publishes the displayed crop under the confirmed author and keeps the key when retrying', async () => {
  mockCanvas();
  const actions = actionsFor();
  actions.marketplaceAvatarPublish.mockRejectedValueOnce(new Error('Connection lost'));
  const published = vi.fn();
  await act(async () =>
    root.render(
      createElement(MarketAvatarPublishDialog, {
        actions,
        t,
        onClose: vi.fn(),
        onPublished: published,
      }),
    ),
  );
  expect(document.body.textContent).toContain(
    t('market.avatar.author', { name: 'Alice', id: 'k7m2pq' }),
  );
  expect(document.body.textContent).toContain(t('market.avatar.publicNotice'));
  const file = document.querySelector('input[type="file"]');
  if (!(file instanceof HTMLInputElement)) throw new Error('Missing file picker');
  Object.defineProperty(file, 'files', {
    value: [new File(['source'], 'avatar.png', { type: 'image/png' })],
  });
  await act(async () => file.dispatchEvent(new Event('change', { bubbles: true })));
  await loadSource(256, 256);
  await act(async () => buttonNamed(t('profile.avatar.crop.save')).click());
  expect(document.querySelector('[data-market-avatar-preview] img')?.getAttribute('src')).toBe(
    image,
  );
  const submit = buttonNamed(t('market.avatar.publish'));
  expect(submit.disabled).toBe(true);
  const name = fieldNamed(t('market.direct.name'));
  const tags = fieldNamed(t('market.direct.tags'));
  await typeInto(name, '💡'.repeat(41));
  expect(submit.disabled).toBe(true);
  await typeInto(name, ' Otter ');
  await typeInto(tags, 'a,b,c,d,e,f');
  expect(submit.disabled).toBe(true);
  await typeInto(tags, 'x'.repeat(25));
  expect(submit.disabled).toBe(true);
  await typeInto(tags, ' Blue , blue ');
  const description = document.querySelector('textarea');
  if (description === null) throw new Error('Missing description field');
  const setDescription = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value',
  )?.set;
  await act(async () => {
    setDescription?.call(description, 'x'.repeat(161));
    description.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(submit.disabled).toBe(true);
  await act(async () => {
    setDescription?.call(description, 'River');
    description.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
  await act(async () => submit.click());
  expect(actions.marketplaceAvatarPublish).toHaveBeenCalledTimes(2);
  const [first, second] = actions.marketplaceAvatarPublish.mock.calls;
  expect(first).toEqual([
    {
      name: 'Otter',
      description: 'River',
      tags: ['Blue'],
      image,
      confirm: true,
      requestKey: expect.any(String),
      expectedAuthorId: 'k7m2pq',
    },
  ]);
  expect(second).toEqual(first);
  expect(published).toHaveBeenCalledWith(avatar);
});

it('paginates the grid and opens the Avatar hero and tags', async () => {
  const actions = actionsFor();
  await act(async () =>
    root.render(
      createElement(MarketAvatars, { actions, publishing: false, onClosePublish: vi.fn(), t }),
    ),
  );
  expect(document.body.textContent).not.toContain(t('market.avatar.publish'));
  expect(actions.marketplaceAccount).not.toHaveBeenCalled();
  let finishPage = () => {};
  const pendingPage = new Promise<void>((resolve) => {
    finishPage = resolve;
  });
  actions.marketplaceAvatarList.mockImplementationOnce(async () => {
    await pendingPage;
    return { avatars: [{ ...avatar, id: 'avatar-b', name: 'Bear' }], nextCursor: null };
  });
  await act(async () => buttonNamed(t('market.loadMore')).click());
  expect(buttonNamed(t('market.loadingMore')).disabled).toBe(true);
  expect(actions.marketplaceAvatarList).toHaveBeenLastCalledWith({ cursor: 'next' });
  await act(async () => finishPage());
  expect(buttonNamed(t('market.detail.open', { name: 'Bear' }))).toBeTruthy();
  await act(async () => buttonNamed(t('market.detail.open', { name: 'Otter' })).click());
  expect(actions.marketplaceAvatarDetail).toHaveBeenCalledWith('avatar-a');
  expect(host.querySelector('.bh-market-hero-name .bh-market-owner')?.textContent).toBe(
    'Alice #k7m2pq',
  );
  expect(host.querySelector('.bh-market-hero .bh-market-meta')?.textContent).toContain(
    t('market.applyCount', { count: 0 }),
  );
  expect(host.querySelector('.bh-market-hero [data-tone="neutral"]')?.textContent).toBe('Blue');
});

it('lists Apply Counts, edits text and confirms deletion in My Avatars', async () => {
  const actions = actionsFor();
  await act(async () =>
    root.render(
      createElement(MarketAvatars, {
        actions,
        publishing: false,
        managing: true,
        onClosePublish: vi.fn(),
        t,
      }),
    ),
  );
  const row = () => document.querySelector('[data-market-mine-avatar="avatar-a"]');
  expect(row()?.textContent).toContain(t('market.applyCount', { count: 4 }));
  await act(async () => buttonNamed(t('market.avatar.mine.editLabel', { name: 'Otter' })).click());
  expect(document.querySelector('[role="dialog"] input[type="file"]')).toBeNull();
  const name = fieldNamed(t('market.direct.name'));
  expect(name.value).toBe('Otter');
  await act(async () => typeInto(name, 'A'.repeat(41)));
  expect(buttonNamed(t('market.avatar.mine.save')).disabled).toBe(true);
  await act(async () => typeInto(name, 'Seal'));
  await act(async () => buttonNamed(t('market.avatar.mine.save')).click());
  expect(actions.marketplaceAvatarEdit).toHaveBeenCalledWith('avatar-a', { name: 'Seal' });
  expect(row()?.textContent).toContain('Seal');
  await act(async () => buttonNamed(t('market.mine.deleteLabel', { name: 'Seal' })).click());
  expect(document.body.textContent).toContain(t('market.avatar.mine.deleteBody'));
  expect(actions.marketplaceAvatarDelete).not.toHaveBeenCalled();
  await act(async () => buttonNamed(t('market.mine.deleteConfirm')).click());
  expect(actions.marketplaceAvatarDelete).toHaveBeenCalledWith('avatar-a');
  expect(document.body.textContent).toContain(t('market.avatar.mine.empty'));
});

it('explains when applying from an already open Avatar detail fails after deletion', async () => {
  const actions = actionsFor();
  actions.marketplaceAvatarApply.mockRejectedValue(new BridgeCallError('avatar-not-found', 'gone'));
  await act(async () =>
    root.render(
      createElement(MarketAvatars, {
        actions,
        publishing: false,
        onClosePublish: vi.fn(),
        t,
      }),
    ),
  );
  await act(async () => buttonNamed(t('market.detail.open', { name: 'Otter' })).click());
  await act(async () => buttonNamed(t('market.avatar.apply')).click());
  await act(async () => buttonNamed('Plain Bot').click());
  const dialog = document.querySelector('[role="dialog"]');
  const apply = Array.from(dialog?.querySelectorAll('button') ?? []).find(
    (button) => button.textContent === t('market.avatar.apply'),
  );
  await act(async () => apply?.click());
  expect(actions.marketplaceAvatarApply).toHaveBeenCalledWith('avatar-a', 'plain');
  expect(dialog?.textContent).toContain(t('market.avatar.notFound'));
});

it('applies only to a Bot returned by the Host and warns before replacing an editable Appearance', async () => {
  const actions = actionsFor();
  await act(async () =>
    root.render(
      createElement(MarketAvatars, { actions, publishing: false, onClosePublish: vi.fn(), t }),
    ),
  );
  await act(async () => buttonNamed(t('market.detail.open', { name: 'Otter' })).click());
  await act(async () => buttonNamed(t('market.avatar.apply')).click());
  const dialog = document.querySelector('[role="dialog"]');
  if (!(dialog instanceof HTMLElement)) throw new Error('Expected the Bot picker');
  const apply = Array.from(dialog.querySelectorAll('button')).find(
    (button) => button.textContent === t('market.avatar.apply'),
  );
  expect(apply?.disabled).toBe(true);
  expect(actions.marketplaceAvatarApplyCandidates).toHaveBeenCalledTimes(1);
  expect(
    Array.from(
      dialog.querySelectorAll('[data-market-avatar-apply-option]'),
      (button) => button.textContent,
    ),
  ).toEqual(['Plain Bot', 'Editable Bot']);
  await act(async () => buttonNamed('Plain Bot').click());
  expect(dialog.textContent).not.toContain(t('market.avatar.applyWarning'));
  await act(async () => buttonNamed('Editable Bot').click());
  expect(dialog.textContent).toContain(t('market.avatar.applyWarning'));
  expect(actions.marketplaceAvatarApply).not.toHaveBeenCalled();
  actions.marketplaceAvatarDetail.mockResolvedValue({ ...avatar, applyCount: 1 });
  await act(async () => apply?.click());
  expect(actions.marketplaceAvatarApply).toHaveBeenCalledWith('avatar-a', 'editable');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.textContent).toContain(t('market.avatar.applied', { name: 'Editable Bot' }));
  expect(host.querySelector('.bh-market-hero .bh-market-meta')?.textContent).toContain(
    t('market.applyCount', { count: 1 }),
  );
});

it('reports the opened Avatar through the shared challenge and report panel', async () => {
  const actions = actionsFor();
  await act(async () =>
    root.render(
      createElement(MarketAvatars, { actions, publishing: false, onClosePublish: vi.fn(), t }),
    ),
  );
  await act(async () => buttonNamed(t('market.detail.open', { name: 'Otter' })).click());
  await act(async () => buttonNamed(t('market.report.open')).click());
  const report = host.querySelector('[data-market-report="open"]')?.textContent;
  expect(report).toContain(t('market.avatar.report.title'));
  expect(report).toContain(t('market.avatar.report.hint'));
  const textarea = host.querySelector('textarea');
  if (textarea === null) throw new Error('Missing report reason field');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      textarea,
      '  spam  ',
    );
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    buttonNamed(t('market.report.send')).click();
    await vi.waitFor(() => {
      expect(actions.marketplaceAvatarReport).toHaveBeenCalledWith(
        'avatar-a',
        expect.any(String),
        'spam',
      );
    });
  });
  expect(actions.marketplaceChallenge).toHaveBeenCalledOnce();
  expect(host.querySelector('[data-market-report="done"]')?.textContent).toContain(
    t('market.report.doneTitle'),
  );
});
