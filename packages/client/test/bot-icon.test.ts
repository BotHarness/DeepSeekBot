import { describe, expect, it } from 'vitest';

import { BOT_GLYPH_SVG, botBackdropUri, botIconMarkup } from '../src/client/bot-icon.js';
import { findBotNavCell, installBotNavIcon, isBotNavLabel } from '../src/client/bot-icon-nav.js';

describe('bot icon markup', () => {
  it('serves the mascot as palette-matched artwork', () => {
    const light = botIconMarkup('mascot', 'light');
    const dark = botIconMarkup('mascot', 'dark');
    expect(light).toContain('<img');
    expect(light).toContain('data:image/png;base64,');
    expect(dark).toContain('data:image/png;base64,');
    expect(dark).not.toBe(light);
  });

  it('serves the simple variant as its own palette-matched artwork', () => {
    const light = botIconMarkup('simple', 'light');
    const dark = botIconMarkup('simple', 'dark');
    expect(light).toContain('<img');
    expect(light).toContain('data:image/png;base64,');
    expect(dark).not.toBe(light);
    expect(light).not.toBe(botIconMarkup('mascot', 'light'));
  });

  it('keeps a backdrop per variant and falls back to the mascot', () => {
    expect(botBackdropUri('simple')).not.toBe(botBackdropUri('mascot'));
    expect(botBackdropUri('blob')).toBe(botBackdropUri('mascot'));
    expect(botBackdropUri('bot')).toBe(botBackdropUri('mascot'));
  });

  it('generates one deterministic blob', () => {
    const first = botIconMarkup('blob', 'light');
    expect(first).toContain('<svg');
    expect(botIconMarkup('blob', 'dark')).toBe(first);
  });

  it('falls back to the vendored glyph for the generic bot mark', () => {
    expect(botIconMarkup('bot', 'light')).toBe(BOT_GLYPH_SVG);
    expect(BOT_GLYPH_SVG).toContain('stroke="currentColor"');
  });
});

describe('bot nav label matching', () => {
  it('matches the localized section label and ignores everything else', () => {
    const labels = ['Bot 设置', 'Bot settings'];
    expect(isBotNavLabel('Bot 设置', labels)).toBe(true);
    expect(isBotNavLabel('  Bot settings  ', labels)).toBe(true);
    expect(isBotNavLabel('通用设置', labels)).toBe(false);
    expect(isBotNavLabel('', labels)).toBe(false);
    expect(isBotNavLabel(null, labels)).toBe(false);
    expect(isBotNavLabel(undefined, labels)).toBe(false);
  });
});

describe('settings nav tagging', () => {
  interface FakeElement {
    tagName: string;
    childElementCount: number;
    className: string;
    innerHTML: string;
    firstChild: FakeElement | null;
    textContent: string;
    attributes: Record<string, string>;
    classList: {
      add(name: string): void;
      remove(name: string): void;
      has(name: string): boolean;
      contains(name: string): boolean;
    };
    clicks: number;
    click(): void;
    getAttribute(name: string): string | null;
    style: { cssText: string; display: string };
    children: FakeElement[];
    firstElementChild: FakeElement | null;
    setAttribute(name: string, value: string): void;
    insertBefore(node: FakeElement, before: FakeElement | null): void;
    removed?: boolean;
    remove(): void;
    querySelectorAll(selector: string): FakeElement[];
    querySelector(selector: string): FakeElement | null;
  }

  function fakeClassList(): FakeElement['classList'] {
    const names = new Set<string>();
    return {
      add: (name) => names.add(name),
      remove: (name) => names.delete(name),
      has: (name) => names.has(name),
      contains: (name) => names.has(name),
    };
  }

  function fakeElement(tagName: string, textContent = ''): FakeElement {
    const children: FakeElement[] = [];
    const element: FakeElement = {
      tagName,
      textContent,
      childElementCount: 0,
      className: '',
      innerHTML: '',
      firstChild: null,
      attributes: {},
      clicks: 0,
      click() {
        element.clicks += 1;
      },
      getAttribute(name) {
        return element.attributes[name] ?? null;
      },
      style: { cssText: '', display: '' },
      get children() {
        return children.filter((child) => child.removed !== true);
      },
      get firstElementChild() {
        return children.find((child) => child.removed !== true) ?? null;
      },
      classList: fakeClassList(),
      setAttribute(name, value) {
        element.attributes[name] = value;
      },
      insertBefore(node) {
        children.unshift(node);
        element.firstChild = children[0] ?? null;
        element.childElementCount = children.length;
      },
      remove() {
        element.removed = true;
      },
      querySelectorAll(selector) {
        const live = children.filter((child) => child.removed !== true);
        return selector === ':scope > span' ? live.filter((child) => child.tagName === 'span') : [];
      },
      querySelector(selector) {
        const wanted = selector.replace(':scope > .', '');
        return (
          children.find((child) => child.className === wanted && child.removed !== true) ?? null
        );
      },
    };
    return element;
  }

  function fakeNavCell(label: string): FakeElement {
    const cell = fakeElement('button');
    cell.insertBefore(fakeElement('svg'), null);
    cell.insertBefore(fakeElement('span', label), null);
    return cell;
  }

  it('tags only the matching cell, inserts the mark, and cleans up', () => {
    const bot = fakeNavCell('Bot 设置');
    const general = fakeNavCell('通用设置');
    const document = {
      body: fakeElement('body'),
      createElement: (tagName: string) => fakeElement(tagName),
      querySelectorAll: (selector: string) => (selector === 'button' ? [general, bot] : []),
      querySelector: () => null,
    };
    const dispose = installBotNavIcon({
      labels: () => ['Bot 设置'],
      markup: () => '<img src="data:image/png;base64,AAAA" />',
      root: document as never,
    });

    expect(bot.classList.has('bh-bot-nav')).toBe(true);
    expect(general.classList.has('bh-bot-nav')).toBe(false);
    const box = bot.querySelector(':scope > .bh-bot-nav-icon');
    expect(box?.innerHTML).toContain('data:image/png;base64');
    expect(box?.attributes['aria-hidden']).toBe('true');
    expect(box?.style.cssText).toContain('width:16px');
    const glyph = bot.children.find((child) => child.tagName === 'svg');
    expect(glyph?.style.display).toBe('none');

    dispose();
    expect(bot.classList.has('bh-bot-nav')).toBe(false);
    expect(bot.querySelector(':scope > .bh-bot-nav-icon')).toBeNull();
  });
  it('finds the Bot nav cell by label', () => {
    const bot = fakeNavCell('Bot 设置');
    const general = fakeNavCell('通用设置');
    const trigger = fakeElement('button');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    const document = {
      body: fakeElement('body'),
      createElement: (tagName: string) => fakeElement(tagName),
      querySelectorAll: (selector: string) => (selector === 'button' ? [general, bot] : []),
      querySelector: (selector: string) =>
        selector === 'button[aria-haspopup="dialog"]' ? trigger : null,
    };

    expect(findBotNavCell(document as never, ['Bot 设置'])).toBe(bot);
    expect(findBotNavCell(document as never, ['Bot settings'])).toBeUndefined();
  });
});
