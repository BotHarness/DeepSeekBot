// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Input: (props: object) => createElement('input', props),
  Modal: ({
    open,
    onClose,
    title,
    headless,
    className,
    children,
  }: {
    open: boolean;
    onClose(): void;
    title: string;
    headless?: boolean;
    className?: string;
    children?: ReactNode;
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
              { key: item.id, role: 'menuitem', onClick: () => onSelect(item.id) },
              item.label,
            ),
          )
        : null,
    ),
}));

import {
  BotSettings,
  BotSettingsView,
  type BotSettingsSectionRow,
} from '../src/client/bot-settings.js';
import { zhTranslate } from '../src/client/locale.js';

const ROWS: readonly BotSettingsSectionRow[] = [
  { id: 'about', order: 70, label: '关于' },
  { id: 'general', order: 0, label: '通用' },
  { id: 'models', order: 10, label: '模型与运行' },
  { id: 'data-privacy', order: 50, label: '数据与隐私' },
];

let host: HTMLDivElement;
let root: Root;
let rendered: { id: string | undefined; close: (() => void) | undefined }[];

beforeEach(() => {
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

function mount(settings: BotSettings, rows: readonly BotSettingsSectionRow[] = ROWS): void {
  const sections = {
    getSnapshot: () => rows,
    subscribe: () => () => undefined,
  };
  act(() => {
    root.render(
      createElement(BotSettingsView, {
        botSettings: settings,
        sections,
        t: zhTranslate,
        renderSlot: ((_name: string, owner: { close(): void }, options?: { only?: string }) => {
          rendered.push({ id: options?.only, close: owner.close });
          return createElement('p', { 'data-section': options?.only }, `section:${options?.only}`);
        }) as never,
      }),
    );
  });
}

function navLabels(): string[] {
  return [...document.querySelectorAll('nav button')].map((button) => button.textContent ?? '');
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
  expect(navLabels()).toEqual(['通用', '模型与运行', '数据与隐私', '关于']);
  expect(current()).toBe('通用');
  expect(shownSection()).toBe('general');
  expect(document.querySelector('h2')?.textContent).toBe('通用');
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
  expect(settings.getSnapshot()).toEqual({ open: false, sectionId: 'models' });
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
  expect(document.querySelector('[data-menu="sections"]')?.getAttribute('data-selected')).toBe(
    'models',
  );

  act(() => {
    picker?.click();
  });
  expect(picker?.getAttribute('aria-expanded')).toBe('true');
  expect(
    [...document.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
  ).toEqual(['通用', '模型与运行', '数据与隐私', '关于']);
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
