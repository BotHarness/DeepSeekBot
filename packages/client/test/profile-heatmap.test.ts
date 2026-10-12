// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconRefreshOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  Menu: () => null,
}));

import { zhTranslate } from '../src/client/locale.js';
import {
  botChartColor,
  botChartTones,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import {
  createProfileCardBuiltins,
  ProfileHeatmap,
  type HeatmapPage,
} from '../src/client/profile-cards-builtins.js';
import type { BotSummary } from '../src/client/store.js';

const TODAY = '2026-10-08';
let width = 600;
let root: Root;
let host: HTMLDivElement;

function dayOffset(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year!, month! - 1, date! + amount);
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, '0')}-${`${value.getDate()}`.padStart(2, '0')}`;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('bh-profile-heat-scroll') ? width : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const grid = this.classList.contains('bh-profile-heat-grid')
        ? this
        : this.querySelector('.bh-profile-heat-grid');
      return grid === null ? 0 : (grid.children.length / 7) * 12 - 2;
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

function weeks(): number {
  return host.querySelectorAll('.bh-profile-heat-cell').length / 7;
}

it('fills the width, loads older weeks while scrolling back and stops at creation', async () => {
  width = 600;
  const firstDay = dayOffset('2026-10-05', -119 * 7);
  const loadOlder = vi.fn(async (before: string): Promise<HeatmapPage> => ({
    counts: new Map([[dayOffset(before, -3), 4]]),
  }));
  await act(async () =>
    root.render(
      createElement(ProfileHeatmap, {
        counts: new Map([[TODAY, 2]]),
        label: 'Events',
        today: TODAY,
        firstDay,
        loadOlder,
        t: zhTranslate,
      }),
    ),
  );
  expect(loadOlder).toHaveBeenCalledTimes(1);
  expect(loadOlder).toHaveBeenLastCalledWith(dayOffset('2026-10-05', -25 * 7), 50);
  expect(weeks()).toBe(76);
  const older = dayOffset(dayOffset('2026-10-05', -25 * 7), -3);
  expect(host.querySelector(`[data-day="${older}"]`)?.getAttribute('data-level')).toBe('2');

  const scroller = host.querySelector<HTMLElement>('.bh-profile-heat-scroll')!;
  await act(async () => {
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(loadOlder).toHaveBeenCalledTimes(2);
  expect(weeks()).toBe(120);
  expect(host.querySelector(`[data-day="${dayOffset(firstDay, -1)}"]`)).toBeNull();
  await act(async () => {
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(loadOlder).toHaveBeenCalledTimes(2);
});

it('fits the popover width without loading or scrolling', async () => {
  width = 200;
  const loadOlder = vi.fn();
  await act(async () =>
    root.render(
      createElement(ProfileHeatmap, {
        counts: new Map(),
        label: 'Events',
        today: TODAY,
        compact: true,
        loadOlder,
        t: zhTranslate,
      }),
    ),
  );
  expect(weeks()).toBe(20);
  expect(host.querySelector('.bh-profile-heat')?.getAttribute('data-compact')).toBe('true');
  expect(loadOlder).not.toHaveBeenCalled();
});

it('shows the per-reason breakdown in the cell tooltip', async () => {
  width = 300;
  await act(async () =>
    root.render(
      createElement(ProfileHeatmap, {
        counts: new Map([[TODAY, 3]]),
        details: new Map([[TODAY, ['私聊 · 2', '群里 @ · 1']]]),
        label: 'Events',
        today: TODAY,
        t: zhTranslate,
      }),
    ),
  );
  await act(async () => host.querySelector<HTMLElement>(`[data-day="${TODAY}"]`)!.focus());
  const tip = host.querySelector('[role="tooltip"]')!;
  expect(tip.textContent).toContain(TODAY);
  expect([...tip.querySelectorAll('.bh-profile-tip-line')].map((line) => line.textContent)).toEqual(
    ['私聊 · 2', '群里 @ · 1'],
  );
});

const LIGHT = REFERENCE_SURFACES.light.background;
const DARK = REFERENCE_SURFACES.dark.background;
const heat = (): HTMLElement => host.querySelector<HTMLElement>('.bh-profile-heat')!;
const heatColor = (): string => heat().style.getPropertyValue('--bh-bot-color');
const levels = (): string[] =>
  [...host.querySelectorAll('.bh-profile-heat-cell')].map(
    (cell) => `${cell.getAttribute('data-day')}:${cell.getAttribute('data-level')}`,
  );

it('uses the Bot color for intensity without changing any level, and keeps zero neutral', async () => {
  width = 300;
  const counts = new Map([
    [TODAY, 9],
    [dayOffset(TODAY, -1), 1],
    [dayOffset(TODAY, -2), 3],
  ]);
  const show = (identityColor?: string) =>
    act(async () =>
      root.render(
        createElement(ProfileHeatmap, {
          counts,
          label: 'Events',
          today: TODAY,
          ...(identityColor === undefined ? {} : { identityColor }),
          t: zhTranslate,
        }),
      ),
    );
  await show();
  const neutral = levels();
  expect(heatColor()).toBe('');
  expect(heat().hasAttribute('data-bot-scale-source')).toBe(false);

  for (const source of ['#e2b04a', '#1d1b22', '#ffffff', '#2f9e8f']) {
    await show(source);
    expect(levels()).toEqual(neutral);
    expect(heatColor()).toBe(botChartColor(source, LIGHT));
    expect(heat().dataset['botScaleSource']).toBe(source);
  }
  expect(new Set(neutral.map((entry) => entry.split(':')[1])).size).toBeGreaterThanOrEqual(4);
  const zero = host.querySelector<HTMLElement>(`[data-day="${dayOffset(TODAY, -3)}"]`)!;
  expect(zero.getAttribute('data-level')).toBe('0');
  expect(zero.getAttribute('style')).toBeNull();

  document.body.setAttribute('data-ds-dark-theme', '');
  await act(async () => new Promise((done) => setTimeout(done, 0)));
  expect(heatColor()).toBe(botChartColor('#2f9e8f', DARK));
  await show('#1d1b22');
  expect(heatColor()).toBe(botChartColor('#1d1b22', DARK));
  expect(heatColor()).not.toBe('#1d1b22');
  document.body.removeAttribute('data-ds-dark-theme');
  await act(async () => new Promise((done) => setTimeout(done, 0)));
  expect(heatColor()).toBe('#1d1b22');

  await show();
  expect(heatColor()).toBe('');
  expect(levels()).toEqual(neutral);
});

it('gives the event and Memory activity cards the saved Bot Primary Color', async () => {
  width = 300;
  const bot = (primaryColor?: BotSummary['primaryColor']): BotSummary => ({
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '2026-10-01T00:00:00Z',
    avatar: '/api/botharness/bot-avatar?slug=ada&v=1',
    ...(primaryColor === undefined ? {} : { primaryColor }),
  });
  const cards = createProfileCardBuiltins(zhTranslate).filter((card) =>
    ['event-activity', 'memory-activity'].includes(card.id),
  );
  expect(cards).toHaveLength(2);
  const show = (summary: BotSummary, compact: boolean) =>
    act(async () =>
      root.render(
        createElement(
          'div',
          null,
          ...cards.map((card) =>
            createElement(
              'section',
              { key: card.id, 'data-card': card.id },
              card.render({ bot: summary, activity: undefined, t: zhTranslate, compact }),
            ),
          ),
        ),
      ),
    );
  const colors = (): string[] =>
    [...host.querySelectorAll<HTMLElement>('.bh-profile-heat')].map((element) =>
      element.style.getPropertyValue('--bh-bot-color'),
    );
  for (const compact of [false, true]) {
    await show(bot({ mode: 'custom', color: '#1d1b22' }), compact);
    expect(colors()).toEqual(['#1d1b22', '#1d1b22']);
    await show(bot({ mode: 'custom', color: '#e2b04a' }), compact);
    const gold = botChartColor('#e2b04a', LIGHT);
    expect(colors()).toEqual([gold, gold]);
    await show(bot(), compact);
    expect(new Set(colors()).size).toBe(1);
    expect(colors()[0]).not.toBe(gold);
    expect(colors()[0]).not.toBe('');
  }
});

it('draws the popover token chart in the Bot tones and leaves the breakdown by model alone', async () => {
  const card = createProfileCardBuiltins(zhTranslate).find((item) => item.id === 'token-usage')!;
  const bot = (color: string): BotSummary => ({
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '2026-10-01T00:00:00Z',
    primaryColor: { mode: 'custom', color },
  });
  const show = (summary: BotSummary) =>
    act(async () =>
      root.render(
        card.render({ bot: summary, activity: undefined, t: zhTranslate, compact: true }),
      ),
    );
  const tones = (): unknown =>
    JSON.parse(host.querySelector('[data-usage-tones]')!.getAttribute('data-usage-tones')!);
  await show(bot('#e2b04a'));
  expect(tones()).toEqual(botChartTones('#e2b04a', LIGHT));
  await show(bot('#1d1b22'));
  expect(tones()).toEqual(botChartTones('#1d1b22', LIGHT));
  document.body.setAttribute('data-ds-dark-theme', '');
  await show(bot('#e2b04a'));
  await show(bot('#1d1b22'));
  expect(tones()).toEqual(botChartTones('#1d1b22', DARK));
  document.body.removeAttribute('data-ds-dark-theme');
});
