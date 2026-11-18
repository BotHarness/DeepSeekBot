// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  Button: (props: { children?: ReactNode }) => createElement('button', null, props.children),
  IconCloseOutlineRegular: () => null,
}));

import { openTooltip } from './primitive-mocks.js';
import { BugReportEntry } from '../src/client/bug-report-entry.js';
import { MobileAppsEntry } from '../src/client/mobile-apps.js';
import { en, zhTranslate } from '../src/client/locale.js';

const t = ((key: keyof typeof en) => en[key] ?? key) as unknown as typeof zhTranslate;

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.setItem('botharness/mobile-apps/seen', '1');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
});

it.each([
  ['Mobile app', () => createElement(MobileAppsEntry, { t }), en['mobileApps.open']],
  ['Report a problem', () => createElement(BugReportEntry, { t }), en['bugReport.open']],
])('portals the %s rail tooltip out of the clipped rail', async (_name, render, label) => {
  act(() => root.render(render()));
  const anchor = host.querySelector<HTMLElement>('button')!;
  const tip = await openTooltip(anchor);
  expect(tip.textContent).toBe(label);
  expect(anchor.getAttribute('aria-describedby')).toBe(tip.id);
  expect(host.contains(tip)).toBe(false);
});
