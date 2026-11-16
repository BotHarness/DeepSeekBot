// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let member = false;
vi.mock('../src/client/team-state.js', () => ({ useTeamMember: () => member }));

vi.mock('../src/client/target-name.js', () => ({
  TargetName: ({ name }: { name: string }) => name,
}));
vi.mock('../src/client/settings-environment.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  EnvironmentSwitcher: ({
    here,
    remotes,
    value,
    onChange,
  }: {
    here: { hostId: string; name: string };
    remotes: { hostId: string; name: string }[];
    value: string;
    onChange(hostId: string): void;
  }) =>
    createElement(
      'div',
      { 'data-switcher': value },
      [here, ...remotes].map((option) =>
        createElement(
          'button',
          {
            key: option.hostId,
            'data-env': option.hostId,
            onClick: () => onChange(option.hostId),
          },
          option.name,
        ),
      ),
    ),
  RemoteEnvironmentSection: ({ hostId, section }: { hostId: string; section: string }) =>
    createElement('p', {
      'data-remote-models': hostId,
      'data-remote-section': section,
    }),
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: object) => createElement('input', props),
  Button: ({ children, onClick }: { children?: ReactNode; onClick?(): void }) =>
    createElement('button', { type: 'button', onClick }, children),
  Modal: ({
    open,
    onClose,
    title,
    headless,
    className,
    children,
    footer,
  }: {
    open: boolean;
    onClose(): void;
    title: string;
    headless?: boolean;
    className?: string;
    children?: ReactNode;
    footer?: ReactNode;
  }) =>
    open
      ? createElement(
          'div',
          { role: 'presentation' },
          createElement('button', { 'data-testid': 'mask', onClick: onClose }),
          createElement(
            'div',
            {
              role: 'dialog',
              'aria-label': title,
              'data-headless': headless ? 'true' : undefined,
              className,
            },
            children,
            footer,
          ),
        )
      : null,
  IconCloseOutlineRegular: () => null,
  IconChevronDownOutlineRegular: () => null,
  Menu: ({
    anchor,
    open,
    items,
    selectedId,
    onSelect,
  }: {
    anchor: ReactNode;
    open: boolean;
    items: { id: string; label: string }[];
    selectedId?: string;
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      { 'data-menu': 'sections', 'data-selected': selectedId },
      anchor,
      open
        ? items.map((item) =>
            createElement(
              'button',
              {
                key: item.id,
                role: 'menuitem',
                onClick: () => onSelect(item.id),
              },
              item.label,
            ),
          )
        : null,
    ),
}));

import {
  BOT_SETTINGS_SECTIONS,
  BotSettings,
  BotSettingsView,
  DEVICE_SETTINGS_SECTIONS,
  type BotSettingsSectionRow,
} from '../src/client/bot-settings.js';
import { hostSettingsDrafts } from '../src/client/host-settings-drafts.js';
import type { SettingsEnvironments } from '../src/client/settings-environment.js';
import { zhTranslate } from '../src/client/locale.js';

const ROWS: readonly BotSettingsSectionRow[] = [
  { id: 'about', order: 70, label: '关于' },
  { id: 'general', order: 0, label: '通用' },
  { id: 'models', order: 10, label: '模型与运行' },
  { id: 'data-privacy', order: 50, label: '数据与隐私' },
];

let host: HTMLDivElement;
let root: Root;
let rendered: {
  id: string | undefined;
  close: (() => void) | undefined;
  clientOnly?: boolean | undefined;
}[];

beforeEach(() => {
  member = false;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  rendered = [];
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
});

function mount(
  settings: BotSettings,
  rows: readonly BotSettingsSectionRow[] = ROWS,
  environments?: SettingsEnvironments,
): void {
  const sections = {
    getSnapshot: () => rows,
    subscribe: () => () => undefined,
  };
  act(() => {
    root.render(
      createElement(BotSettingsView, {
        botSettings: settings,
        sections,
        environments,
        t: zhTranslate,
        renderSlot: ((
          _name: string,
          owner: { close(): void; clientOnly?: boolean },
          options?: { only?: string },
        ) => {
          rendered.push({
            id: options?.only,
            close: owner.close,
            clientOnly: owner.clientOnly,
          });
          return createElement('p', { 'data-section': options?.only }, `section:${options?.only}`);
        }) as never,
      }),
    );
  });
}

function navLabels(): string[] {
  return [...document.querySelectorAll('nav button')].map((button) => button.textContent ?? '');
}

function groupHeadings(): string[] {
  return [...document.querySelectorAll('nav [role="group"]')].map(
    (group) =>
      document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent ?? '',
  );
}

function groupOf(label: string): string | undefined {
  const button = [...document.querySelectorAll('nav button')].find(
    (item) => item.textContent === label,
  );
  const group = button?.closest('[role="group"]');
  return (
    document.getElementById(group?.getAttribute('aria-labelledby') ?? '')?.textContent ?? undefined
  );
}

async function click(selector: string): Promise<void> {
  await act(async () => {
    document.querySelector<HTMLButtonElement>(selector)?.click();
  });
}

function remoteEnvironments(): SettingsEnvironments & { unpair(): void } {
  const listeners = new Set<() => void>();
  let snapshot = {
    hosts: [{ host: { hostId: 'studio', hostName: 'Studio' } }],
    avatars: new Map(),
    tab: '',
  } as unknown as ReturnType<SettingsEnvironments['getSnapshot']>;
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    client: () => undefined,
    notifications: {} as SettingsEnvironments['notifications'],
    unpair: () => {
      snapshot = { ...snapshot, hosts: [] };
      for (const listener of listeners) listener();
    },
  };
}

function fullRows(): BotSettingsSectionRow[] {
  return Object.values(BOT_SETTINGS_SECTIONS).map((id, order) => ({
    id,
    order,
    label: id,
  }));
}

function current(): string | null {
  return document.querySelector('nav [aria-current="page"]')?.textContent ?? null;
}

function shownSection(): string | null {
  return document.querySelector('[data-section]')?.getAttribute('data-section') ?? null;
}

it('stays closed until opened and lists sections in order', () => {
  const settings = new BotSettings();
  mount(settings);
  expect(document.querySelector('[role="dialog"]')).toBeNull();

  act(() => {
    settings.open();
  });
  const dialog = document.querySelector('[role="dialog"]');
  expect(dialog?.getAttribute('aria-label')).toBe('Bot 设置');
  expect(dialog?.getAttribute('data-headless')).toBe('true');
  expect(navLabels()).toEqual(['通用', '模型与运行', '本应用中的外观', '数据与隐私', '关于']);
  expect(current()).toBe('通用');
  expect(shownSection()).toBe('general');
  expect(document.querySelector('h2')?.textContent).toBe('通用');
});

it('leads every sidebar section with its own glyph and keeps the label as the name', () => {
  const settings = new BotSettings();
  const ids = [...Object.values(BOT_SETTINGS_SECTIONS), 'computer', 'browser'];
  mount(
    settings,
    ids.map((id, order) => ({ id, order, label: id })),
  );
  act(() => {
    settings.open('general');
  });
  const buttons = [...document.querySelectorAll('nav button')];
  expect(buttons.map((button) => button.textContent)).toEqual([
    ...ids.filter((id) => DEVICE_SETTINGS_SECTIONS.has(id)),
    ...ids
      .filter((id) => !DEVICE_SETTINGS_SECTIONS.has(id))
      .flatMap((id) => (id === 'models' ? [id, '本应用中的外观'] : [id])),
  ]);
  const glyphs = buttons.map((button) => {
    const icon = button.firstElementChild;
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(icon?.querySelector('svg')).not.toBeNull();
    return icon?.innerHTML;
  });
  expect(new Set(glyphs).size).toBe(ids.length + 1);
  expect(current()).toBe('general');
});

it('gives a plugin section without a mapped glyph the generic settings glyph', () => {
  const settings = new BotSettings();
  mount(settings, [...ROWS, { id: 'some-plugin', order: 80, label: '插件' }]);
  act(() => {
    settings.open('some-plugin');
  });
  expect(document.querySelector('nav [aria-current="page"] svg')).not.toBeNull();
});

it('opens a requested section and falls back to General for an unknown id', () => {
  const settings = new BotSettings();
  mount(settings);
  act(() => {
    settings.open('data-privacy');
  });
  expect(current()).toBe('数据与隐私');
  expect(shownSection()).toBe('data-privacy');

  act(() => {
    settings.close();
    settings.open('no-such-section');
  });
  expect(current()).toBe('通用');
  expect(shownSection()).toBe('general');
});

it('falls back to the first section when General is not registered', () => {
  const settings = new BotSettings();
  mount(
    settings,
    ROWS.filter((row) => row.id !== 'general'),
  );
  act(() => {
    settings.open('missing');
  });
  expect(current()).toBe('模型与运行');
});

it('switches sections from the sidebar and reopens at the last section viewed', () => {
  const settings = new BotSettings();
  mount(settings);
  act(() => {
    settings.open();
  });
  const about = [...document.querySelectorAll('nav button')].find(
    (button) => button.textContent === '关于',
  );
  act(() => {
    (about as HTMLButtonElement).click();
  });
  expect(shownSection()).toBe('about');

  act(() => {
    settings.close();
  });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  act(() => {
    settings.open();
  });
  expect(current()).toBe('关于');

  const fresh = new BotSettings();
  act(() => {
    settings.close();
  });
  mount(fresh);
  act(() => {
    fresh.open();
  });
  expect(current()).toBe('通用');
});

it('closes from the close button, the mask, and the section itself', () => {
  const settings = new BotSettings();
  mount(settings);
  const isOpen = () => document.querySelector('[role="dialog"]') !== null;

  act(() => {
    settings.open();
  });
  const close = document.querySelector<HTMLButtonElement>('button[aria-label="关闭"]');
  act(() => {
    close?.click();
  });
  expect(isOpen()).toBe(false);

  act(() => {
    settings.open();
  });
  act(() => {
    document.querySelector<HTMLButtonElement>('[data-testid="mask"]')?.click();
  });
  expect(isOpen()).toBe(false);

  act(() => {
    settings.open();
  });
  act(() => {
    rendered.at(-1)?.close?.();
  });
  expect(isOpen()).toBe(false);
});

it('notifies subscribers only on change', () => {
  const settings = new BotSettings();
  const listener = vi.fn();
  settings.subscribe(listener);
  settings.open('models');
  settings.open('models');
  settings.close();
  settings.close();
  expect(listener).toHaveBeenCalledTimes(2);
  expect(settings.getSnapshot()).toMatchObject({
    open: false,
    sectionId: 'models',
    pairPhone: false,
  });
});

function frameWidth(narrow: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: narrow && query.includes('max-width'),
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

it('renders only the rail in wide frames', () => {
  frameWidth(false);
  const settings = new BotSettings();
  mount(settings);
  act(() => {
    settings.open();
  });
  expect(document.querySelector('nav')).not.toBeNull();
  expect(document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')).toBeNull();
  expect(document.querySelector('[data-modal-autofocus]')?.textContent).toBe('通用');
  vi.unstubAllGlobals();
});

it('renders only a section dropdown in narrow frames and switches sections from it', () => {
  frameWidth(true);
  const settings = new BotSettings();
  mount(settings);
  act(() => {
    settings.open('models');
  });
  expect(document.querySelector('nav')).toBeNull();
  expect(document.querySelector('h2')).toBeNull();
  const picker = document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]');
  expect(picker?.textContent).toBe('模型与运行');
  expect(picker?.hasAttribute('data-modal-autofocus')).toBe(true);
  expect(picker?.getAttribute('aria-haspopup')).toBe('menu');
  expect(picker?.getAttribute('aria-label')).toBe('Bot 设置分区：模型与运行');

  act(() => {
    picker?.click();
  });
  expect(picker?.getAttribute('aria-expanded')).toBe('true');
  expect(
    document
      .querySelector('[role="dialog"]')
      ?.contains(document.querySelector('[data-pointer-menu]')),
  ).toBe(true);
  expect(document.querySelector('[data-menu="sections"]')?.getAttribute('data-selected')).toBe(
    'models',
  );
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
  ).toEqual(['通用', '模型与运行', '本应用中的外观', '数据与隐私', '关于']);
  const about = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
    (item) => item.textContent === '关于',
  );
  act(() => {
    about?.click();
  });
  expect(shownSection()).toBe('about');
  expect(
    document.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.textContent,
  ).toBe('关于');
  expect(document.querySelector('[role="menuitem"]')).toBeNull();
  vi.unstubAllGlobals();
});

it('searches another page and focuses the matching setting after navigation', () => {
  const settings = new BotSettings();
  const rows = [
    { id: 'general', order: 0, label: '通用' },
    { id: 'appearance', order: 5, label: '界面设置' },
  ];
  act(() => {
    root.render(
      createElement(BotSettingsView, {
        botSettings: settings,
        sections: { getSnapshot: () => rows, subscribe: () => () => {} },
        t: zhTranslate,
        renderSlot: ((_name: string, _owner: unknown, options: { only: string }) =>
          createElement(
            'div',
            { role: 'group', 'aria-labelledby': 'gap-title' },
            createElement(
              'div',
              { id: 'gap-title' },
              options.only === 'appearance' ? '面板间距' : '新手教程',
            ),
          )) as never,
      }),
    );
    settings.open();
  });
  const input = document.querySelector<HTMLInputElement>('input')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '间距');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const result = document.querySelector<HTMLButtonElement>('.bh-settings-search-results button')!;
  expect(result.textContent).toContain('面板间距');
  act(() => result.click());
  expect(settings.getSnapshot().sectionId).toBe('appearance');
  expect(document.activeElement?.getAttribute('data-settings-highlight')).toBe('');
  expect(input.value).toBe('');
});

it('routes the phone entry to Connections while keeping ordinary settings independent', () => {
  const settings = new BotSettings();
  settings.open('pair-phone');
  expect(settings.getSnapshot()).toMatchObject({
    open: true,
    sectionId: 'devices',
    pairPhone: true,
  });
  settings.close();
  settings.open('devices');
  expect(settings.getSnapshot()).toMatchObject({
    open: true,
    sectionId: 'devices',
    pairPhone: false,
  });
  settings.select('general');
  expect(settings.getSnapshot()).toMatchObject({
    sectionId: 'general',
    pairPhone: false,
  });
});

it('opens Connections outside the settings sidebar and passes the phone intent to its shared surface', () => {
  const settings = new BotSettings();
  mount(settings, [...ROWS, { id: 'devices', order: 45, label: '连接' }]);
  act(() => settings.open('pair-phone'));
  expect(shownSection()).toBe('devices');
  expect(document.querySelector('nav')).toBeNull();
  act(() => rendered.at(-1)!.close!());
  expect(settings.getSnapshot().open).toBe(false);
});

it('returns to ordinary settings after closing the standalone Connections dialog', () => {
  const settings = new BotSettings();
  settings.open('pair-phone');
  settings.close();
  settings.open();
  expect(settings.getSnapshot()).toMatchObject({
    open: true,
    sectionId: 'general',
    pairPhone: false,
  });
});

it('limits App preferences navigation and section mounting to Client-local owners', () => {
  const settings = new BotSettings();
  const ids = [...Object.values(BOT_SETTINGS_SECTIONS), 'unclassified-plugin'];
  mount(
    settings,
    ids.map((id, order) => ({ id, order, label: id })),
  );
  act(() => settings.openClientPreferences());
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('本应用偏好');
  expect(navLabels()).toEqual(['appearance', 'notifications', 'shortcuts', 'companions']);
  expect(shownSection()).toBe('appearance');
  expect(rendered.at(-1)).toMatchObject({ id: 'appearance', clientOnly: true });
  act(() => settings.select('models'));
  expect(shownSection()).toBe('appearance');
  act(() => settings.select('voice'));
  expect(shownSection()).toBe('appearance');
  act(() => settings.select('notifications'));
  expect(rendered.at(-1)).toMatchObject({
    id: 'notifications',
    clientOnly: true,
  });
  act(() => settings.open('models'));
  expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Bot 设置');
  expect(navLabels()).toContain('voice');
  expect(groupHeadings()).toEqual(['此设备', '本机']);
  expect(shownSection()).toBe('models');
  expect(rendered.at(-1)).toMatchObject({ id: 'models', clientOnly: false });
});

it('intersects member access with Client preferences for navigation, search and direct section requests', () => {
  member = true;
  const settings = new BotSettings();
  mount(
    settings,
    Object.values(BOT_SETTINGS_SECTIONS).map((id, order) => ({
      id,
      order,
      label: id,
    })),
  );
  act(() => settings.openClientPreferences());
  expect(navLabels()).toEqual(['appearance', 'notifications', 'shortcuts']);
  for (const id of ['team', 'models', 'companions']) {
    act(() => settings.select(id));
    expect(shownSection()).toBe('appearance');
  }
  const input = document.querySelector<HTMLInputElement>('input');
  if (!input) throw Error('Settings search missing');
  for (const query of ['团队', '伙伴', '模型']) {
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.querySelectorAll('.bh-settings-search-results button')).toHaveLength(0);
  }
});

it('lists device preferences under This device and Host options under the current Host', () => {
  const settings = new BotSettings();
  mount(
    settings,
    Object.values(BOT_SETTINGS_SECTIONS).map((id, order) => ({
      id,
      order,
      label: id,
    })),
  );
  act(() => settings.open('appearance'));
  expect(groupHeadings()).toEqual(['此设备', '本机']);
  for (const id of ['appearance', 'notifications', 'shortcuts', 'companions'])
    expect(groupOf(id)).toBe('此设备');
  for (const id of ['account', 'general', 'models', 'team', 'about'])
    expect(groupOf(id)).toBe('本机');
  expect(document.querySelector('[data-switcher]')).toBeNull();
  expect(document.querySelector('[data-settings-scope]')).toBeNull();
});

it('switches the Host group to a remote Host from the top-right switcher and keeps device sections', async () => {
  const settings = new BotSettings();
  mount(
    settings,
    Object.values(BOT_SETTINGS_SECTIONS).map((id, order) => ({
      id,
      order,
      label: id,
    })),
    remoteEnvironments(),
  );
  act(() => settings.open('models'));
  expect(document.querySelector('[data-switcher]')?.getAttribute('data-switcher')).toBe('local');
  expect(document.querySelector('[data-settings-scope]')?.textContent).toBe('保存在 本机');
  await click('[data-env="studio"]');
  expect(document.querySelector('[data-switcher]')?.getAttribute('data-switcher')).toBe('studio');
  expect(groupHeadings()).toEqual(['此设备', 'Studio']);
  expect(navLabels()).toEqual([
    'appearance',
    'notifications',
    'shortcuts',
    'companions',
    '模型',
    '自动审批',
    '提示词',
    '语音',
    '本应用中的外观',
    '通知',
    'Token 用量',
    '存储空间',
    '连接',
  ]);
  expect(current()).toBe('模型');
  expect(document.querySelector('[data-remote-models]')?.getAttribute('data-remote-models')).toBe(
    'studio',
  );
  expect(document.querySelector('[data-settings-scope]')?.textContent).toBe('保存在 Studio');

  await click('[data-settings-section="appearance"]');
  expect(shownSection()).toBe('appearance');
  expect(document.querySelector('[data-settings-scope]')?.textContent).toBe('只保存在这台设备');

  await click('[data-settings-section="environment-storage"]');
  expect(document.querySelector('[data-remote-section]')?.getAttribute('data-remote-section')).toBe(
    'environment-storage',
  );
  expect(document.querySelector('[data-settings-scope]')?.textContent).toBe('保存在 Studio');

  await click('[data-settings-section="environment-notifications"]');
  expect(document.querySelector('[data-settings-scope]')?.textContent).toBe('只保存在这台设备');

  await click('[data-settings-section="environment-models"]');
  await click('[data-env="local"]');
  expect(groupHeadings()).toEqual(['此设备', '本机']);
  expect(shownSection()).toBe('models');
});

it('asks before leaving a remote Host with unsaved model changes', async () => {
  const settings = new BotSettings();
  mount(
    settings,
    Object.values(BOT_SETTINGS_SECTIONS).map((id, order) => ({
      id,
      order,
      label: id,
    })),
    remoteEnvironments(),
  );
  act(() => settings.open('models'));
  await click('[data-env="studio"]');
  let dirty = true;
  const discard = vi.fn(() => {
    dirty = false;
  });
  const release = hostSettingsDrafts.register('studio', {
    dirty: () => dirty,
    save: async () => true,
    discard,
  });
  try {
    await act(async () => {
      document.querySelector<HTMLButtonElement>('[data-env="local"]')?.click();
    });
    expect(document.body.textContent).toContain('保存并切换');
    expect(document.querySelector('[data-remote-models]')).not.toBeNull();
    const discardButton = [...document.querySelectorAll('button')].find(
      (button) => button.textContent === '放弃更改',
    );
    await act(async () => {
      discardButton?.click();
    });
    expect(discard).toHaveBeenCalledOnce();
    expect(document.querySelector('[data-remote-models]')).toBeNull();
    expect(shownSection()).toBe('models');
  } finally {
    release();
  }
});

it('returns to the local Host when a local page is opened directly while a remote is selected', async () => {
  const settings = new BotSettings();
  mount(settings, fullRows(), remoteEnvironments());
  act(() => settings.open('models'));
  await click('[data-env="studio"]');
  expect(shownSection()).toBeNull();
  act(() => settings.close());
  act(() => settings.open('voice'));
  expect(document.querySelector('[data-switcher]')?.getAttribute('data-switcher')).toBe('local');
  expect(shownSection()).toBe('voice');
});

it('keeps a selected remote Host open after it leaves the paired list', async () => {
  const settings = new BotSettings();
  const environments = remoteEnvironments();
  mount(settings, fullRows(), environments);
  act(() => settings.open('models'));
  await click('[data-env="studio"]');
  const release = hostSettingsDrafts.register('studio', {
    dirty: () => true,
    save: async () => true,
    discard: () => undefined,
  });
  try {
    act(() => environments.unpair());
    expect(document.querySelector('[data-remote-models]')?.getAttribute('data-remote-models')).toBe(
      'studio',
    );
    expect(document.querySelector('[data-switcher]')?.getAttribute('data-switcher')).toBe('studio');
    expect(hostSettingsDrafts.hasDirty('studio')).toBe(true);
    await click('[data-env="local"]');
    expect(document.body.textContent).toContain('保存并切换');
    expect(document.querySelector('[data-remote-models]')).not.toBeNull();
  } finally {
    release();
  }
});

it('drops an open unsaved-changes prompt when Settings closes from elsewhere', async () => {
  const settings = new BotSettings();
  mount(settings, fullRows(), remoteEnvironments());
  act(() => settings.open('models'));
  await click('[data-env="studio"]');
  const release = hostSettingsDrafts.register('studio', {
    dirty: () => true,
    save: async () => true,
    discard: () => undefined,
  });
  try {
    await click('[data-env="local"]');
    expect(document.body.textContent).toContain('保存并切换');
    act(() => settings.close());
    act(() => settings.open('appearance'));
    expect(document.body.textContent).not.toContain('保存并切换');
  } finally {
    release();
  }
});

it('opens a chosen Host from outside the dialog and returns to this Host when asked', () => {
  const settings = new BotSettings();
  mount(settings, fullRows(), remoteEnvironments());
  act(() => settings.openHost({ hostId: 'studio', hostName: 'Studio' }));
  expect(document.querySelector('[data-switcher]')?.getAttribute('data-switcher')).toBe('studio');
  expect(document.querySelector('[data-remote-section]')?.getAttribute('data-remote-section')).toBe(
    'environment-models',
  );
  act(() => settings.close());
  act(() => settings.openHost());
  expect(document.querySelector('[data-switcher]')?.getAttribute('data-switcher')).toBe('local');
  expect(shownSection()).toBe('models');
});
