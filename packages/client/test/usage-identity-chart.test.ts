// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import {
  botChartTones,
  CHART_CONTRAST,
  contrastRatio,
  parseColor,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  UsageChart,
  UsageToneLegend,
  type UsageSummary,
} from '../src/client/model-usage-charts.js';

const row = (key: string, identityColor?: string, tokens = 100): UsageSummary => ({
  key,
  label: key,
  inputTokens: tokens * 0.3,
  cacheReadTokens: tokens * 0.5,
  cacheWriteTokens: 0,
  outputTokens: tokens * 0.2,
  totalTokens: tokens,
  ...(identityColor === undefined ? {} : { identityColor }),
});
const rgb = (value: string) => parseColor(value)!.rgb;
const LIGHT = REFERENCE_SURFACES.light.background;
const DARK = REFERENCE_SURFACES.dark.background;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  document.body.removeAttribute('data-ds-dark-theme');
  await act(async () => root.unmount());
  container.remove();
});

const show = (rows: UsageSummary[], kind: 'model' | 'daily' = 'model') =>
  act(async () =>
    root.render(createElement(UsageChart, { rows, kind, label: 'Bots', t: zhTranslate })),
  );
const fills = (key: string): string[] =>
  [...container.querySelectorAll<SVGRectElement>('rect')]
    .filter((rect) => rect.getAttribute('data-ts-key')?.endsWith(`:${key}`))
    .map((rect) => rect.getAttribute('fill')!);
const series = (key: string): string[] =>
  [...container.querySelectorAll<SVGRectElement>('rect')]
    .filter((rect) => rect.getAttribute('data-ts-key')?.endsWith(`:${key}`))
    .map(
      (rect) =>
        /:(cached|uncached|output|unclassified):/u.exec(rect.getAttribute('data-ts-key')!)![1]!,
    );

it('derives readable, ordered tones from one source and keeps gray sources gray', () => {
  for (const source of ['#e2b04a', '#1d1b22', '#ffffff', '#9a9a9a', '#fff6b3', '#0000ff'])
    for (const background of [LIGHT, DARK]) {
      const tones = botChartTones(source, background);
      expect(
        contrastRatio(rgb(tones.cached), rgb(background)),
        `${source} on ${background}`,
      ).toBeGreaterThanOrEqual(CHART_CONTRAST);
      const distance = (tone: string) => contrastRatio(rgb(tone), rgb(background));
      expect(distance(tones.cached)).toBeGreaterThan(distance(tones.uncached));
      expect(distance(tones.uncached)).toBeGreaterThan(distance(tones.output));
      expect(distance(tones.output)).toBeGreaterThan(1);
    }
  for (const source of ['#000000', '#ffffff', '#9a9a9a'])
    for (const tone of Object.values(botChartTones(source, LIGHT))) {
      const [red, green, blue] = rgb(tone);
      expect(Math.max(red, green, blue) - Math.min(red, green, blue)).toBeLessThanOrEqual(1);
    }
});

it('paints each Bot row in its own color with cached, other input and output in that order', async () => {
  await show([row('ada', '#e2b04a'), row('bea', '#1d1b22'), row('twin', '#1d1b22')]);
  const ada = botChartTones('#e2b04a', LIGHT);
  const bea = botChartTones('#1d1b22', LIGHT);
  expect(series('ada')).toEqual(['cached', 'uncached', 'output']);
  expect(fills('ada')).toEqual([ada.cached, ada.uncached, ada.output]);
  expect(fills('bea')).toEqual([bea.cached, bea.uncached, bea.output]);
  expect(fills('twin')).toEqual(fills('bea'));
  expect(new Set(fills('ada')).size).toBe(3);

  await show([row('bea', '#1d1b22', 900), row('ada', '#e2b04a', 5)]);
  expect(fills('ada')).toEqual([ada.cached, ada.uncached, ada.output]);
  expect(fills('bea')).toEqual([bea.cached, bea.uncached, bea.output]);
  await show([row('ada', '#e2b04a')]);
  expect(fills('ada')).toEqual([ada.cached, ada.uncached, ada.output]);
});

it('keeps unclassified usage neutral and shows every token category that has data', async () => {
  const unknown: UsageSummary = {
    ...row('gap', '#e2b04a'),
    inputTokens: null,
    cacheReadTokens: null,
    cacheWriteTokens: null,
    outputTokens: null,
  };
  await show([row('ada', '#e2b04a'), unknown]);
  expect(series('gap')).toEqual(['unclassified']);
  expect(Object.values(botChartTones('#e2b04a', LIGHT))).not.toContain(fills('gap')[0]);
  expect(series('ada')).toEqual(['cached', 'uncached', 'output']);
});

it('re-derives the tones for the dark theme from the same sources', async () => {
  await show([row('ada', '#e2b04a'), row('bea', '#1d1b22')]);
  const light = fills('bea');
  document.body.setAttribute('data-ds-dark-theme', '');
  await show([row('ada', '#e2b04a'), row('bea', '#1d1b22')]);
  await show([row('bea', '#1d1b22'), row('ada', '#e2b04a')]);
  const dark = botChartTones('#1d1b22', DARK);
  expect(fills('bea')).toEqual([dark.cached, dark.uncached, dark.output]);
  expect(fills('bea')).not.toEqual(light);
  expect(contrastRatio(rgb(fills('bea')[0]!), rgb(DARK))).toBeGreaterThanOrEqual(CHART_CONTRAST);
});

it('leaves charts without Bot identity on their token-type colors', async () => {
  await show([row('model-a'), row('model-b')]);
  expect(container.querySelector('.bh-usage-identity-chart')).toBeNull();
  const model = fills('model-a');
  await show([row('2026-10-12', '#e2b04a')], 'daily');
  expect(container.querySelector('.bh-usage-identity-chart')).toBeNull();
  expect(fills('2026-10-12')).toEqual(model);
  expect(Object.values(botChartTones('#e2b04a', LIGHT))).not.toContain(model[0]);
});

it('labels the tone levels with the token categories', async () => {
  await act(async () => root.render(createElement(UsageToneLegend, { t: zhTranslate })));
  expect(
    [...container.querySelectorAll('i[data-tone]')].map((item) => item.getAttribute('data-tone')),
  ).toEqual(['cached', 'uncached', 'output']);
  expect(container.textContent).toContain(zhTranslate('profile.usage.cacheRead'));
  expect(container.textContent).toContain(zhTranslate('profile.usage.otherInput'));
  expect(container.textContent).toContain(zhTranslate('profile.tokens.output'));
});
