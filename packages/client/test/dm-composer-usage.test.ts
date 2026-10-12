// @vitest-environment jsdom
import { act, createElement, createRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronRightOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import {
  botChartColor,
  botNameColor,
  REFERENCE_SURFACES,
} from '../src/client/bot-primary-color.js';
import type { ProfileSessionUsage } from '../src/client/bridge.js';
import { DmComposerUsagePopover } from '../src/client/dm-composer-usage.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BotSummary } from '../src/client/store.js';

const LIGHT = REFERENCE_SURFACES.light.background;
const DARK = REFERENCE_SURFACES.dark.background;
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  document.body.removeAttribute('data-ds-dark-theme');
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const usage = {
  slug: 'ada',
  rows: [
    { sessionId: 's1', role: 'orchestrator', label: 'Main', status: 'ready', totalTokens: 300 },
    { sessionId: 's2', role: 'assignment', label: 'Research', status: 'ready', totalTokens: 100 },
    {
      sessionId: 's3',
      role: 'assignment',
      label: 'Gone',
      status: 'unavailable',
      totalTokens: null,
    },
  ],
} as unknown as ProfileSessionUsage;

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

async function show(summary: BotSummary) {
  const actions = { profileSessionUsage: vi.fn(async () => usage) } as unknown as BridgeActions;
  await act(async () =>
    root.render(
      createElement(DmComposerUsagePopover, {
        bot: summary,
        channelId: 'dm-ada',
        actions,
        activity: undefined,
        t: zhTranslate,
        trigger: createRef<HTMLButtonElement>() as never,
        onClose: () => undefined,
        onDetails: () => undefined,
      }),
    ),
  );
  await act(async () => new Promise((done) => setTimeout(done, 0)));
}
const name = () => document.querySelector<HTMLElement>('.bh-composer-usage-total > span')!;
const meters = () => [...document.querySelectorAll<HTMLElement>('.bh-composer-usage-meter')];

it('shows the Bot name and session share meters in the saved Bot Primary Color', async () => {
  await show(bot({ mode: 'custom', color: '#e2b04a' }));
  expect(name().textContent).toBe('Ada');
  expect(name().dataset['botNameColor']).toBe(botNameColor('#e2b04a', LIGHT));
  expect(meters()).toHaveLength(2);
  expect(meters().map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['75', '25']);
  expect(meters().map((meter) => meter.querySelector('span')!.style.width)).toEqual(['75%', '25%']);
  for (const meter of meters())
    expect(meter.style.getPropertyValue('--bh-bot-color')).toBe(botChartColor('#e2b04a', LIGHT));

  document.body.setAttribute('data-ds-dark-theme', '');
  await act(async () => new Promise((done) => setTimeout(done, 0)));
  expect(name().dataset['botNameColor']).toBe(botNameColor('#e2b04a', DARK));
  for (const meter of meters())
    expect(meter.style.getPropertyValue('--bh-bot-color')).toBe(botChartColor('#e2b04a', DARK));
  document.body.removeAttribute('data-ds-dark-theme');
  await act(async () => new Promise((done) => setTimeout(done, 0)));

  await show(bot({ mode: 'custom', color: '#1d1b22' }));
  expect(name().dataset['botNameColor']).toBe('#1d1b22');
  for (const meter of meters())
    expect(meter.style.getPropertyValue('--bh-bot-color')).toBe('#1d1b22');
  expect(meters().map((meter) => meter.getAttribute('aria-valuenow'))).toEqual(['75', '25']);
});
