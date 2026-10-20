// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Tooltip: ({
    label,
    delayMs,
    focusDelayMs,
    portal,
    children,
  }: {
    label: string | (() => string);
    delayMs?: number;
    focusDelayMs?: number;
    portal?: boolean;
    children: ReactNode;
  }) =>
    createElement(
      'span',
      {
        'data-tooltip': typeof label === 'function' ? label() : label,
        'data-delay': String(delayMs ?? 0),
        'data-focus-delay': String(focusDelayMs ?? 0),
        'data-portal': String(portal === true),
      },
      children,
    ),
}));

import { PanelHeader } from '../src/client/ds/panel-header.js';
import { InstantTooltipScope, Tooltip } from '../src/client/ds/tooltip.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const slowTooltip = (label: string) => (
  <Tooltip label={label} side="bottom" delayMs={500}>
    <button type="button" aria-label={label} />
  </Tooltip>
);

const tooltipOf = (label: string) =>
  host.querySelector(`[data-tooltip="${label}"]`) as HTMLElement | null;

describe('panel header action tooltips', () => {
  it('show at once on hover and keyboard focus inside a panel header action slot', () => {
    act(() =>
      root.render(
        createElement(PanelHeader, { label: 'Messages', action: slowTooltip('Sessions') }),
      ),
    );
    const tooltip = tooltipOf('Sessions');
    expect(tooltip?.dataset.delay).toBe('0');
    expect(tooltip?.dataset.focusDelay).toBe('0');
    expect(tooltip?.dataset.portal).toBe('true');
  });

  it('explain on the panel title that it drags and hides, instead of a native title', () => {
    act(() =>
      root.render(
        <PanelHeader
          label="Messages"
          onHide={() => {}}
          hideLabel="Close Messages"
          hideHint="Drag to move, click to hide the panel"
        />,
      ),
    );
    const tooltip = tooltipOf('Drag to move, click to hide the panel');
    expect(tooltip?.querySelector('[data-panel-hide]')?.getAttribute('aria-label')).toBe(
      'Close Messages',
    );
    expect(host.querySelector('[data-panel-label]')?.hasAttribute('title')).toBe(false);
  });

  it('keep the caller delay outside a header', () => {
    act(() => root.render(slowTooltip('Download')));
    expect(tooltipOf('Download')?.dataset.delay).toBe('500');
  });

  it('applies to header content portaled out of the slot by an explicit scope', () => {
    act(() => root.render(createElement(InstantTooltipScope, null, slowTooltip('New'))));
    expect(tooltipOf('New')?.dataset.delay).toBe('0');
  });
});

describe('tooltip source', () => {
  it('routes every client and plugin tooltip through the shared header-aware wrapper', () => {
    const repo = join(import.meta.dirname, '..', '..', '..');
    const roots = ['client', 'browser', 'computer'].map((name) =>
      join(repo, 'packages', name, 'src'),
    );
    const files = roots.flatMap((dir) =>
      readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
        .map((file) => join(dir, file)),
    );
    const direct = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return [
        ...source.matchAll(
          /import\s*\{([^}]*)\}\s*from\s*'@deepseek-ai\/dsh-client-ui-primitives'/g,
        ),
      ].some((match) =>
        match[1]!.split(',').some((name) => name.trim().split(/\s+as\s+/)[0] === 'Tooltip'),
      );
    });
    expect(direct.map((file) => relative(repo, file))).toEqual([
      'packages/client/src/client/ds/tooltip.tsx',
    ]);
  });
});
