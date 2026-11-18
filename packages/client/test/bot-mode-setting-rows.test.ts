// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { type Root } from 'react-dom/client';
import { type BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  return {
    ...(await import('./primitive-mocks.js')).shellPrimitives(),
  };
});

import { BotModePrefs, botModePrefsFace } from '../src/client/bot-mode-prefs.js';
import {
  AssignmentConcurrencyRow,
  AutoCollapseMessagesSetting,
  BotIconCard,
  BotIconSetting,
  DeveloperModeSetting,
  GroupAutoAcceptSetting,
  MotionSetting,
  SendKeySetting,
  SortSetting,
} from '../src/client/bot-mode-setting-rows.js';
import { buttonNamed, menuItem } from './primitive-mocks.js';
import { shortcutKeyLabel } from '../src/client/ds/kbd.js';
import { zhTranslate } from '../src/client/locale.js';

const t = zhTranslate;

it('offers an off-by-default folding switch that updates the shared message preference', () => {
  const prefs = new BotModePrefs();
  const markup = renderAndOpenMenus(
    createElement(AutoCollapseMessagesSetting, {
      ...botModePrefsFace(prefs),
      t,
      useBotModePrefs: (selector) => selector(prefs.source.getSnapshot()),
    }),
  );
  expect(markup).toContain('自动折叠长消息');
  const toggle = buttonNamed('自动折叠长消息');
  expect(toggle.getAttribute('aria-checked')).toBe('false');
  act(() => toggle.click());
  expect(prefs.source.getSnapshot().autoCollapseMessages).toBe(true);
});
const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});
function renderAndOpenMenus(node: ReactNode): string {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(node));
  const markup = container.innerHTML;
  return markup;
}

function snapshot(patch?: Partial<BotModePrefsSnapshot>): BotModePrefsSnapshot {
  return {
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    sendKey: 'enter' as const,
    autoCollapseMessages: false,
    showDeliveryReceipts: false,
    showDmAvatar: false,
    showOwnAvatar: false,
    streamReplies: false,
    sessionDetailLevel: 'standard',
    sessionCollapse: 'completion',
    sessionFoldedReplies: 'all',
    autoAcceptGroupInvites: true,
    assignmentConcurrencyLimit: 3,
    botHopLimit: 128,
    developerMode: false,
    showBotSessions: false,
    showApprovalReviewSessions: false,
    effectiveMotion: 'full',
    sortMode: 'updated',
    sortModes: {},
    mode: 'host',
    status: 'ready',
    ...patch,
  };
}

function renderSection(
  prefs: BotModePrefsSnapshot,
  setSortMode: (mode: string) => void = () => undefined,
  setMotionPreference: (preference: string) => void = () => undefined,
  setBotIcon: (icon: string) => void = () => undefined,
  setDeveloperMode: (enabled: boolean) => void = () => undefined,
  setAutoAcceptGroupInvites: (enabled: boolean) => void = () => undefined,
): string {
  const props = {
    t,
    useBotModePrefs: ((selector: (value: BotModePrefsSnapshot) => unknown) =>
      selector(prefs)) as never,
    setSortMode: setSortMode as never,
    setMotionPreference: setMotionPreference as never,
    setBotIcon: setBotIcon as never,
    setDeveloperMode: setDeveloperMode as never,
    setAutoAcceptGroupInvites: setAutoAcceptGroupInvites as never,
  } as never;
  return renderAndOpenMenus(
    createElement(
      Fragment,
      null,
      ...[
        BotIconSetting,
        MotionSetting,
        SortSetting,
        DeveloperModeSetting,
        GroupAutoAcceptSetting,
        AssignmentConcurrencyRow,
      ].map((row, index) => createElement(row, { key: index, ...(props as object) } as never)),
    ),
  );
}

function openMenu(label: string): HTMLElement {
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (trigger === null) throw new Error(`No menu trigger ${label}`);
  act(() => trigger.click());
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  if (menu === null) throw new Error(`No menu ${label}`);
  return menu;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});

describe('Bot mode setting rows', () => {
  it('renders the native developer switch and sends its next value', () => {
    const setDeveloperMode = vi.fn();
    const markup = renderSection(snapshot(), undefined, undefined, undefined, setDeveloperMode);
    expect(markup).toContain('开发者模式');
    const toggle = buttonNamed('开发者模式');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    act(() => toggle.click());
    expect(setDeveloperMode).toHaveBeenCalledWith(true);
  });

  it('renders the row copy and the selected mode from the shared store', () => {
    const markup = renderSection(snapshot({ sortMode: 'manual' }));

    expect(markup).toContain('Bot 列表排序');
    expect(markup).toContain('设置 Bot 模式列表的默认排序方式');
    expect(markup).toContain('手动排序');
    expect(markup).toContain('aria-haspopup="menu"');
    const menu = openMenu(t('sort.menu.label'));
    expect(menu.querySelector('[data-selected]')?.textContent).toBe(t('sort.manual'));
    expect([...menu.querySelectorAll('[role=menuitem]')].map((item) => item.textContent)).toEqual([
      t('sort.updated'),
      t('sort.manual'),
    ]);
  });

  it('renders and writes the three-state motion preference with its effective preview', () => {
    const setMotionPreference = vi.fn();
    const markup = renderSection(
      snapshot({ motionPreference: 'system', effectiveMotion: 'reduce' }),
      () => undefined,
      setMotionPreference,
    );

    expect(markup).toContain('界面动效');
    expect(markup).toContain('跟随系统');
    expect(markup).toContain('当前已减少动效');
    const tabs = [
      ...document.querySelectorAll<HTMLButtonElement>('[aria-label="动效偏好"] [role="tab"]'),
    ];
    expect(tabs.map((tab) => tab.id)).toEqual([
      'bh-motion-preference-system',
      'bh-motion-preference-reduce',
      'bh-motion-preference-full',
    ]);
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true');
    act(() => tabs[2]?.click());
    expect(setMotionPreference).toHaveBeenCalledWith('full');
  });

  it('writes through the shared policy when an option is picked', () => {
    const setSortMode = vi.fn();
    renderSection(snapshot(), setSortMode);

    openMenu(t('sort.menu.label'));
    act(() => menuItem(t('sort.manual')).click());
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    openMenu(t('sort.menu.label'));
    act(() => menuItem(t('sort.updated')).click());
    expect(setSortMode).not.toHaveBeenCalled();
  });

  it('surfaces the memory-mode caveat instead of pretending persistence', () => {
    const markup = renderSection(snapshot({ status: 'unavailable', mode: 'memory' }));

    expect(markup).toContain('仅当前会话生效，不会保存');
    expect(markup).not.toContain('设置 Bot 模式列表的默认排序方式');
  });
  it('selects a mark when its card is activated', () => {
    const setBotIcon = vi.fn();
    const card = BotIconCard({
      option: 'simple',
      label: 'Tobs 简约',
      selected: false,
      onSelect: setBotIcon,
    });
    (card.props as { onClick: () => void }).onClick();
    expect(setBotIcon).toHaveBeenCalledWith('simple');
  });

  it('renders one card per Bot mark and writes the picked one', () => {
    const setBotIcon = vi.fn();
    const markup = renderSection(snapshot({ botIcon: 'blob' }), undefined, undefined, setBotIcon);
    expect(markup).toContain('Bot 图标');
    expect(markup).toContain('生成形象');
    expect(markup).toContain('role="radiogroup" aria-label="Bot 图标"');
    const cards = [...markup.matchAll(/<button[^>]*role="radio"[^>]*>/g)].map((m) => m[0]);
    expect(cards).toHaveLength(4);
    expect(cards.filter((card) => card.includes('aria-checked="true"'))).toHaveLength(1);
  });
});

it('shows default Group auto-accept and writes its native switch', () => {
  const set = vi.fn();
  const markup = renderSection(snapshot(), undefined, undefined, undefined, undefined, set);
  expect(markup).toContain('自动接受入群邀请');
  const control = buttonNamed('自动接受入群邀请');
  expect(control.getAttribute('aria-checked')).toBe('true');
  expect(control.disabled).toBe(false);
  act(() => control.click());
  expect(set).toHaveBeenCalledWith(false);
});

describe('send key setting', () => {
  function renderSendKey(apple: boolean, sendKey: 'enter' | 'mod-enter', setSendKey = vi.fn()) {
    const markup = renderAndOpenMenus(
      createElement(SendKeySetting, {
        t,
        apple,
        useBotModePrefs: ((selector: (value: BotModePrefsSnapshot) => unknown) =>
          selector(snapshot({ sendKey }))) as never,
        setSendKey: setSendKey as never,
      } as never),
    );
    const menu = openMenu(t('sendKey.row.title'));
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].map((item) => ({
      id: item.querySelector<HTMLElement>('[data-send-key]')?.dataset.sendKey,
      markup: item.innerHTML,
      element: item,
    }));
    return { markup, items, setSendKey };
  }

  it('shows symbol keycaps with Command on Apple platforms', () => {
    const { markup, items } = renderSendKey(true, 'mod-enter');
    expect(markup).toContain('<kbd title="Command"');
    expect(markup).not.toContain('Ctrl');
    expect(items.map((item) => item.id)).toEqual(['enter', 'shift-enter', 'mod-enter']);
    expect(items[0]?.markup).toMatch(/>↵<\/kbd>.*发送.*>⇧<\/kbd>.*>↵<\/kbd>.*换行/u);
    expect(items[2]?.markup).toMatch(/>⌘<\/kbd>.*>↵<\/kbd>.*发送.*>↵<\/kbd>.*换行/u);
    expect(items[1]?.markup).toMatch(/>⇧<\/kbd>.*>↵<\/kbd>.*发送.*>↵<\/kbd>.*换行/u);
    expect(items.some((item) => item.markup.includes('Enter<'))).toBe(false);
  });

  it('shows Ctrl on other platforms and writes the picked key', () => {
    const { items, setSendKey } = renderSendKey(false, 'enter');
    expect(items[2]?.markup).toMatch(/>Ctrl<\/kbd>.*>↵<\/kbd>.*发送/u);
    expect(items[2]?.markup).not.toContain('⌘');
    act(() => items[2]!.element.click());
    expect(setSendKey).toHaveBeenCalledWith('mod-enter');
  });

  it('maps shortcut keys to platform symbols', () => {
    expect(['Mod', 'Alt', 'Shift', 'Enter', '/'].map((key) => shortcutKeyLabel(key, true))).toEqual(
      ['⌘', '⌥', '⇧', '↵', '/'],
    );
    expect(['Mod', 'Alt', 'Shift', 'Enter'].map((key) => shortcutKeyLabel(key, false))).toEqual([
      'Ctrl',
      'Alt',
      '⇧',
      '↵',
    ]);
  });
});
