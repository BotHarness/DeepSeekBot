// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { store } from '../src/client/store.js';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconCloseFill14: stub,
    IconEditOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconTriangleRightFill14: stub,
    IconTrashOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    Input: stub,
    Menu: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { createBotPanelEntry } from '../src/client/bot-sidebar.js';
import { zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';

const useBotModePrefs = ((selector: (value: BotModePrefsSnapshot) => unknown) =>
  selector({
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    autoAcceptGroupInvites: true,
    assignmentConcurrencyLimit: 3,
    developerMode: false,
    showBotSessions: false,
    effectiveMotion: 'full',
    sortMode: 'updated',
    sortModes: {},
    mode: 'host',
    status: 'ready',
  })) as never;

const t = zhTranslate as unknown as BotHarnessTranslate;
const openSettings = () => undefined;

describe('bot panel entry', () => {
  it('renders the chosen mark in both states', () => {
    const entry = createBotPanelEntry(
      () => undefined,
      () => undefined,
      async () => undefined,
    );
    const inactive = renderToStaticMarkup(
      createElement(entry, { size: 16, active: false, useBotModePrefs, openSettings, t }),
    );
    const active = renderToStaticMarkup(
      createElement(entry, { size: 16, active: true, useBotModePrefs, openSettings, t }),
    );

    expect(inactive).toContain('bh-bot-icon');
    expect(active).toContain('bh-bot-icon');
    expect(inactive).toContain('data-wide="true"');
    expect(inactive).not.toContain('bh-panel-glyph-hit');
  });
});

it('keeps notification states and active-mode navigation distinct', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const nav = document.createElement('nav');
  const native = document.createElement('button');
  nav.append(native);
  document.body.append(nav);
  const exit = vi.fn();
  const open = vi.fn();
  const settings = vi.fn();
  const entry = createBotPanelEntry(exit, open, async () => undefined);
  const root = createRoot(native);
  const render = async (size: number, active: boolean) => {
    await act(async () => {
      root.render(
        createElement(entry, { size, active, useBotModePrefs, openSettings: settings, t }),
      );
    });
  };
  try {
    await act(async () => {
      store.setHumanInbox({ unreadCount: 126, hasAction: true });
      store.select({ kind: 'inbox' });
    });
    await render(16, true);
    let chip = nav.querySelector<HTMLElement>('.bh-panel-activity')!;
    const actions = native.querySelector('.bh-panel-actions')!;
    expect(chip.parentElement).toBe(actions);
    expect(actions.querySelector('.bh-panel-gear')).not.toBeNull();
    expect(chip.dataset['unread']).toBe('true');
    expect(chip.querySelector('.bh-human-inbox-count')?.textContent?.trim()).toBe('99+');
    expect(chip.getAttribute('aria-label')).toContain('126');
    expect(chip.querySelector('.bh-human-inbox-notification-dot')).toBeNull();
    chip.click();
    expect(open).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    nav.querySelector<HTMLElement>('.bh-panel-gear')!.click();
    expect(settings).toHaveBeenCalledOnce();
    expect(exit).not.toHaveBeenCalled();
    native.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(exit).toHaveBeenCalledOnce();
    native.querySelector<HTMLElement>('.bh-panel-glyph')!.click();
    expect(exit).toHaveBeenCalledTimes(2);
    chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(open).toHaveBeenCalledTimes(2);
    expect(exit).toHaveBeenCalledTimes(2);
    await render(24, true);
    chip = nav.querySelector<HTMLElement>('.bh-panel-activity')!;
    expect(chip.parentElement).toBe(nav);
    expect(native.querySelector('.bh-panel-actions')).toBeNull();
    expect(chip.querySelector('.bh-human-inbox-count')).toBeNull();
    expect(chip.querySelector('.bh-human-inbox-notification-dot')).not.toBeNull();
    expect(chip.getAttribute('aria-label')).toContain('126');
    await render(24, false);
    expect(chip.tabIndex).toBe(-1);
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    expect(chip.querySelector('.bh-human-inbox-notification-dot')).toBeNull();
    await render(16, false);
    chip = nav.querySelector<HTMLElement>('.bh-panel-activity')!;
    expect(chip.parentElement).toBe(native.querySelector('.bh-panel-actions'));
    expect(native.querySelector('.bh-panel-gear')).toBeNull();
    expect(chip.querySelector('.bh-human-inbox-count')?.textContent?.trim()).toBe('99+');
    expect(chip.tabIndex).toBe(0);
    expect(chip.hasAttribute('aria-hidden')).toBe(false);
    await render(24, true);
    await act(async () => {
      store.setHumanInbox({ unreadCount: 0, hasAction: false });
    });
    expect(chip.querySelector('.bh-human-inbox-notification-dot')).toBeNull();
    await act(async () => {
      store.setHumanInbox({ unreadCount: 0, hasAction: true });
    });
    await render(16, true);
    chip = nav.querySelector<HTMLElement>('.bh-panel-activity')!;
    expect(chip.querySelector('.bh-human-inbox-count')).toBeNull();
    expect(chip.querySelector('.bh-human-inbox-notification-dot')).toBeNull();
    expect(chip.getAttribute('aria-label')).toContain(zhTranslate('humanInbox.action'));
    expect(chip.tabIndex).toBe(0);
    await render(16, false);
    expect(chip.dataset['active']).toBe('false');
    expect(chip.tabIndex).toBe(-1);
    expect(chip.getAttribute('aria-hidden')).toBe('true');
    await render(24, true);
    expect(nav.querySelectorAll('.bh-panel-activity')).toHaveLength(1);
    chip = nav.querySelector<HTMLElement>('.bh-panel-activity')!;
    expect(chip.dataset['wide']).toBe('false');
    expect(chip.tabIndex).toBe(0);
    expect(chip.hasAttribute('aria-hidden')).toBe(false);
    expect(chip.querySelector('.bh-human-inbox-count')).toBeNull();
    expect(chip.querySelector('.bh-human-inbox-notification-dot')).not.toBeNull();
    chip.click();
    expect(open).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => {
      root.unmount();
      store.setHumanInbox({ unreadCount: 0, hasAction: false });
      store.select(undefined);
    });
    expect(nav.querySelector('.bh-panel-activity')).toBeNull();
    expect(native.style.gridRow).toBe('');
    nav.remove();
  }
});
