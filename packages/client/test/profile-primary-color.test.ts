// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { dialogPrimitives } = await import('./primitive-mocks.js');
  const stub = () => null;
  return {
    ...dialogPrimitives(),
    Tooltip: ({ children }: PropsWithChildren) => children,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    IconShareOutlineRegular: stub,
    Menu: stub,
    Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import {
  botNameColor,
  contrastRatio,
  parseColor,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import { zhTranslate } from '../src/client/locale.js';
import { PrimaryColorModal } from '../src/client/primary-color-editor.js';
import { ProfileHeader } from '../src/client/profile-header.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';
import { seededAvatarFor } from '../../core/src/bots/avatar-appearance.js';
import { fallbackPrimaryColor } from '../../core/src/bots/primary-color.js';
import { buttonNamed, dialog, fieldNamed, typeInto } from './primitive-mocks.js';

const AT = '2026-10-12T00:00:00Z';
const CHANNEL: ChannelSummary = {
  id: 'dm-ada',
  type: 'dm',
  name: 'Ada',
  members: ['ada'],
  createdAt: AT,
  updatedAt: AT,
};
const HAIR = seededAvatarFor('Ada', undefined).hairColor;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function bot(patch: Partial<BotSummary> = {}): BotSummary {
  return {
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: AT,
    ...patch,
  };
}

async function open(summary: BotSummary, setBotPrimaryColor = vi.fn(async () => true)) {
  const onClose = vi.fn();
  await act(async () =>
    root.render(
      createElement(PrimaryColorModal, {
        bot: summary,
        channel: CHANNEL,
        actions: { setBotPrimaryColor } as Pick<BridgeActions, 'setBotPrimaryColor'>,
        t: zhTranslate,
        onClose,
      }),
    ),
  );
  return { onClose, setBotPrimaryColor };
}

const one = <T extends Element>(selector: string): T => {
  const found = host.querySelector<T>(selector);
  expect(found, selector).not.toBeNull();
  return found!;
};
const click = (selector: string) => act(async () => one<HTMLElement>(selector).click());
const button = (label: string) => buttonNamed(label, dialog());
const pane = (theme: 'light' | 'dark') => one<HTMLElement>(`[data-preview-theme="${theme}"]`);
const mode = () => one('[role="radiogroup"]').getAttribute('data-primary-color-mode');
const hex = () => fieldNamed(zhTranslate('profile.primaryColor.hex'));

function expectReadable(theme: 'light' | 'dark', source: string) {
  const surface = REFERENCE_SURFACES[theme].background;
  const name = pane(theme).getAttribute('data-name-color')!;
  expect(name).toBe(botNameColor(source, surface));
  expect(contrastRatio(parseColor(name)!.rgb, parseColor(surface)!.rgb)).toBeGreaterThanOrEqual(
    4.5,
  );
  expect(pane(theme).style.getPropertyValue('--bh-primary-preview-swatch')).toBe(source);
}

it('starts on Automatic, explains the hair source and previews both themes', async () => {
  await open(bot());
  expect(mode()).toBe('automatic');
  expect(one('[data-primary-color-source]').getAttribute('data-primary-color-source')).toBe('hair');
  expect(host.querySelector('[data-primary-color-preset]')).toBeNull();
  for (const theme of ['light', 'dark'] as const) {
    expectReadable(theme, HAIR);
    expect(pane(theme).querySelector('[data-preview="author"]')?.textContent).toBe('Ada');
    expect(pane(theme).querySelector('[data-preview="mention"]')?.textContent).toBe('@Ada');
    expect(pane(theme).querySelector('[data-preview="chart"]')).not.toBeNull();
    expect(pane(theme).querySelector('.bh-persona-avatar')).not.toBeNull();
  }
});

it('explains the fixed fallback for an uploaded image without asking for a color', async () => {
  await open(bot({ avatar: '/api/botharness/bot-avatar?slug=ada&v=1' }));
  expect(mode()).toBe('automatic');
  expect(one('[data-primary-color-source]').getAttribute('data-primary-color-source')).toBe(
    'fallback',
  );
  expectReadable('light', fallbackPrimaryColor('ada'));
});

it('previews a Custom draft locally and saves it only on Save', async () => {
  const { onClose, setBotPrimaryColor } = await open(bot());
  await click('[data-primary-color-choice="custom"]');
  expect(mode()).toBe('custom');
  expectReadable('light', HAIR);
  await click('[data-primary-color-preset="#f4f1ec"]');
  expectReadable('light', '#f4f1ec');
  expectReadable('dark', '#f4f1ec');
  expect(hex().value).toBe('#f4f1ec');

  await typeInto(hex(), '#12');
  expect(hex().getAttribute('aria-invalid')).toBe('true');
  expect(dialog().textContent).toContain(zhTranslate('profile.primaryColor.hexInvalid'));
  expect(button('保存').disabled).toBe(true);
  await typeInto(hex(), '0F0');
  expect(hex().hasAttribute('aria-invalid')).toBe(false);
  expectReadable('dark', '#00ff00');
  await typeInto(hex(), '#1D1B22');
  expectReadable('dark', '#1d1b22');
  expect(setBotPrimaryColor).not.toHaveBeenCalled();

  await act(async () => button('保存').click());
  expect(setBotPrimaryColor).toHaveBeenCalledExactlyOnceWith('dm-ada', {
    mode: 'custom',
    color: '#1d1b22',
  });
  expect(onClose).toHaveBeenCalledOnce();
});

it('leaves saved data alone on Cancel and on an unchanged Save', async () => {
  const { onClose, setBotPrimaryColor } = await open(bot());
  await click('[data-primary-color-choice="custom"]');
  await click('[data-primary-color-preset="#d9475a"]');
  await act(async () => button('取消').click());
  expect(onClose).toHaveBeenCalledOnce();
  await click('[data-primary-color-choice="automatic"]');
  await act(async () => button('保存').click());
  expect(setBotPrimaryColor).not.toHaveBeenCalled();
});

it('keeps the draft and reports a failed Save', async () => {
  const setBotPrimaryColor = vi.fn(async () => false);
  const { onClose } = await open(bot(), setBotPrimaryColor);
  await click('[data-primary-color-choice="custom"]');
  await click('[data-primary-color-preset="#3f8fd0"]');
  await act(async () => button('保存').click());
  expect(setBotPrimaryColor).toHaveBeenCalledOnce();
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog().querySelector('[role="alert"]')?.textContent).toBe(
    zhTranslate('profile.primaryColor.failed'),
  );
  expect(mode()).toBe('custom');
  expectReadable('light', '#3f8fd0');
  expect(button('保存').disabled).toBe(false);
});

it('opens a saved Custom color and resets to the current Avatar source', async () => {
  const { setBotPrimaryColor } = await open(
    bot({ primaryColor: { mode: 'custom', color: '#000000' } }),
  );
  expect(mode()).toBe('custom');
  expectReadable('dark', '#000000');
  await click('[data-primary-color-choice="automatic"]');
  expectReadable('dark', HAIR);
  await act(async () => button('保存').click());
  expect(setBotPrimaryColor).toHaveBeenCalledExactlyOnceWith('dm-ada', { mode: 'automatic' });
});

it('offers the setting in the Avatar area for pixel and uploaded-image Bots alike', async () => {
  for (const [summary, source] of [
    [bot(), 'hair'],
    [bot({ avatar: '/api/botharness/bot-avatar?slug=ada&v=1' }), 'fallback'],
    [bot({ primaryColor: { mode: 'custom', color: '#000000' } }), 'custom'],
  ] as const) {
    await act(async () =>
      root.render(
        createElement(ProfileHeader, {
          key: source,
          bot: summary,
          channel: CHANNEL,
          actions: { loadPartLibrary: async () => [] } as unknown as BridgeActions,
          t: zhTranslate,
          onDelete: () => undefined,
        }),
      ),
    );
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => buttonNamed(zhTranslate('profile.avatar.change')).click());
    const row = one('[role="dialog"] div[data-primary-color-source]');
    expect(row.getAttribute('data-primary-color-source')).toBe(source);
    await act(async () => buttonNamed(zhTranslate('profile.primaryColor.edit'), row).click());
    expect(
      document.querySelector(
        `[role="dialog"][aria-label="${zhTranslate('profile.primaryColor.title')}"] [role="radiogroup"]`,
      ),
    ).not.toBeNull();
  }
});
