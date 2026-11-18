// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  IconChevronDownOutlineRegular: () => null,
}));

import { openTooltip, hoverTooltip } from './primitive-mocks.js';
import { PanelHeader } from '../src/client/ds/panel-header.js';
import { InstantTooltipScope, Tooltip } from '../src/client/ds/tooltip.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const slowTooltip = (label: string) => (
  <Tooltip label={label} side="bottom" delayMs={500}>
    <button type="button" aria-label={label} />
  </Tooltip>
);

const popup = () => document.querySelector<HTMLElement>('[role="tooltip"]');
const trigger = (label: string) => host.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;

describe('panel header action tooltips', () => {
  it('show at once on hover and keyboard focus inside a panel header action slot', async () => {
    act(() =>
      root.render(
        createElement(PanelHeader, { label: 'Messages', action: slowTooltip('Sessions') }),
      ),
    );
    await hoverTooltip(trigger('Sessions'), vi.advanceTimersByTimeAsync);
    expect(popup()?.textContent).toBe('Sessions');
    expect(host.contains(popup())).toBe(false);
    await act(async () =>
      trigger('Sessions').dispatchEvent(
        new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }),
      ),
    );
    await openTooltip(trigger('Sessions'));
    expect(trigger('Sessions').getAttribute('aria-describedby')).toBe(popup()?.id);
  });

  it('explain on the panel title that it drags and hides, instead of a native title', async () => {
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
    const anchor = host.querySelector<HTMLElement>('[data-panel-hide]')!;
    expect(anchor.getAttribute('aria-label')).toBe('Close Messages');
    await openTooltip(anchor);
    expect(popup()?.textContent).toBe('Drag to move, click to hide the panel');
    expect(host.querySelector('[data-panel-label]')?.hasAttribute('title')).toBe(false);
  });

  it('keep the caller delay outside a header', async () => {
    act(() => root.render(slowTooltip('Download')));
    await hoverTooltip(trigger('Download'), vi.advanceTimersByTimeAsync, 499);
    expect(popup()).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(popup()?.textContent).toBe('Download');
  });

  it('applies to header content portaled out of the slot by an explicit scope', async () => {
    act(() => root.render(createElement(InstantTooltipScope, null, slowTooltip('New'))));
    await hoverTooltip(trigger('New'), vi.advanceTimersByTimeAsync);
    expect(popup()?.textContent).toBe('New');
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
    expect(direct.map((file) => relative(repo, file))).toEqual([]);
  });
});
