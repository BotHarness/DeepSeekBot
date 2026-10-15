import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  menus: [] as Array<Record<string, unknown>>,
  switches: [] as Array<Record<string, unknown>>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconChevronDownOutlineRegular: stub,
    Input: stub,
    Button: stub,
    Switch: (props: Record<string, unknown>) => {
      captured.switches.push(props);
      return null;
    },
    Menu: (props: Record<string, unknown>) => {
      captured.menus.push(props);
      return props['anchor'];
    },
  };
});

import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import {
  AssignmentConcurrencyRow,
  BotIconCard,
  BotIconSetting,
  DeveloperModeSetting,
  GroupAutoAcceptSetting,
  MotionSetting,
  SendKeySetting,
  SortSetting,
} from '../src/client/bot-mode-setting-rows.js';
import { shortcutKeyLabel } from '../src/client/ds/kbd.js';
import { zh, zhTranslate, type BotHarnessKey } from '../src/client/locale.js';

const t = zhTranslate;

function snapshot(patch?: Partial<BotModePrefsSnapshot>): BotModePrefsSnapshot {
  return {
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    sendKey: 'enter' as const,
    autoAcceptGroupInvites: true,
    assignmentConcurrencyLimit: 3,
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
  return renderToStaticMarkup(
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

function lastMenu(): Record<string, unknown> {
  const found = captured.menus.at(-1);
  if (found === undefined) throw new Error('menu not rendered');
  return found;
}

function menuWithItem(id: string): Record<string, unknown> {
  const found = captured.menus.find((menu) =>
    ((menu['items'] as readonly Record<string, unknown>[] | undefined) ?? []).some(
      (item) => item['id'] === id,
    ),
  );
  if (found === undefined) throw new Error(`menu with ${id} not rendered`);
  return found;
}

function motionMenu(): Record<string, unknown> {
  return menuWithItem('system');
}

function iconMenu(): Record<string, unknown> {
  return menuWithItem('mascot');
}

beforeEach(() => {
  captured.menus.length = 0;
  captured.switches.length = 0;
});

describe('Bot mode setting rows', () => {
  it('renders the native developer switch and sends its next value', () => {
    const setDeveloperMode = vi.fn();
    const markup = renderSection(snapshot(), undefined, undefined, undefined, setDeveloperMode);
    expect(markup).toContain('开发者模式');
    expect(captured.switches[0]).toMatchObject({
      checked: false,
      label: '开发者模式',
    });
    (captured.switches[0]?.['onChange'] as (enabled: boolean) => void)(true);
    expect(setDeveloperMode).toHaveBeenCalledWith(true);
  });

  it('renders the row copy and the selected mode from the shared store', () => {
    const markup = renderSection(snapshot({ sortMode: 'manual' }));

    expect(markup).toContain('Bot 列表排序');
    expect(markup).toContain('设置 Bot 模式列表的默认排序方式');
    expect(markup).toContain('手动排序');
    expect(markup).toContain('aria-haspopup="menu"');
    expect(lastMenu()['selectedId']).toBe('manual');
    expect(
      (lastMenu()['items'] as readonly Record<string, unknown>[]).map((item) => item['id']),
    ).toEqual(['updated', 'manual']);
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
    expect(motionMenu()['selectedId']).toBe('system');
    expect(
      (motionMenu()['items'] as readonly Record<string, unknown>[]).map((item) => item['id']),
    ).toEqual(['system', 'reduce', 'full']);

    const onSelect = motionMenu()['onSelect'] as (id: string) => void;
    onSelect('full');
    expect(setMotionPreference).toHaveBeenCalledWith('full');

    setMotionPreference.mockClear();
    onSelect('unrelated');
    expect(setMotionPreference).not.toHaveBeenCalled();
  });

  it('writes through the shared policy when an option is picked', () => {
    const setSortMode = vi.fn();
    renderSection(snapshot(), setSortMode);

    const onSelect = lastMenu()['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    onSelect('unrelated');
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
      label: 'DeepSeekBot 简约',
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
  const control = captured.switches.find((item) => item['label'] === '自动接受入群邀请')!;
  expect(control).toMatchObject({ checked: true, disabled: false });
  (control['onChange'] as (enabled: boolean) => void)(false);
  expect(set).toHaveBeenCalledWith(false);
});

describe('send key setting', () => {
  function renderSendKey(apple: boolean, sendKey: 'enter' | 'mod-enter', setSendKey = vi.fn()) {
    const markup = renderToStaticMarkup(
      createElement(SendKeySetting, {
        t,
        apple,
        useBotModePrefs: ((selector: (value: BotModePrefsSnapshot) => unknown) =>
          selector(snapshot({ sendKey }))) as never,
        setSendKey: setSendKey as never,
      } as never),
    );
    const items = (
      menuWithItem('mod-enter')['items'] as readonly {
        id: string;
        label: unknown;
      }[]
    ).map((item) => ({
      id: item.id,
      markup: renderToStaticMarkup(createElement(Fragment, null, item.label as never)),
    }));
    return { markup, items, setSendKey };
  }

  it('shows symbol keycaps with Command on Apple platforms', () => {
    const { markup, items } = renderSendKey(true, 'mod-enter');
    expect(markup).toContain('<kbd title="Command"');
    expect(markup).not.toContain('Ctrl');
    expect(items.map((item) => item.id)).toEqual(['enter', 'mod-enter']);
    expect(items[0]?.markup).toMatch(/>↵<\/kbd>.*发送.*>⇧<\/kbd>.*>↵<\/kbd>.*换行/u);
    expect(items[1]?.markup).toMatch(/>⌘<\/kbd>.*>↵<\/kbd>.*发送.*>↵<\/kbd>.*换行/u);
    expect(items.some((item) => item.markup.includes('Enter<'))).toBe(false);
  });

  it('shows Ctrl on other platforms and writes the picked key', () => {
    const { items, setSendKey } = renderSendKey(false, 'enter');
    expect(items[1]?.markup).toMatch(/>Ctrl<\/kbd>.*>↵<\/kbd>.*发送/u);
    expect(items[1]?.markup).not.toContain('⌘');
    const onSelect = menuWithItem('mod-enter')['onSelect'] as (id: string) => void;
    onSelect('mod-enter');
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
