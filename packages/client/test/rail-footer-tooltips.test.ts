// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: { children?: ReactNode }) => createElement('button', null, props.children),
  IconCloseOutlineRegular: () => null,
  Tooltip: (props: { label: string; portal?: boolean; children?: ReactNode }) =>
    createElement(
      'span',
      { 'data-tooltip': props.label, 'data-portal': props.portal ? 'true' : 'false' },
      props.children,
    ),
}));

import { DiagnosticLogsEntry } from '../src/client/diagnostic-logs-entry.js';
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

// The control rail clips its overflow, so a rail tooltip only shows when it
// renders under document.body.
it.each([
  ['Mobile app', () => createElement(MobileAppsEntry, { t }), en['mobileApps.open']],
  ['Diagnostic logs', () => createElement(DiagnosticLogsEntry, { t }), en['panel.diagnosticLogs']],
])('portals the %s rail tooltip out of the clipped rail', (_name, render, label) => {
  act(() => root.render(render()));
  const tip = host.querySelector(`[data-tooltip="${label}"]`)!;
  expect(tip).not.toBeNull();
  expect(tip.getAttribute('data-portal')).toBe('true');
});
