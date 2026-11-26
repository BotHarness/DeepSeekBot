// @vitest-environment jsdom
import { act, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { ChipTabs } from '../src/client/ds/chip-tabs.js';

let host: HTMLDivElement;
let root: Root;

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

function Sections(): ReactElement {
  const [value, setValue] = useState<'bots' | 'skills' | 'apps'>('bots');
  return (
    <>
      <ChipTabs
        id="sections"
        value={value}
        label="Sections"
        options={[
          { value: 'bots', label: 'Bots', icon: <svg data-icon="bot" /> },
          { value: 'skills', label: 'Skills', icon: <svg data-icon="sparkles" /> },
          { value: 'apps', label: 'Apps', icon: <svg data-icon="plug" />, disabled: true },
        ]}
        onChange={setValue}
      />
      <output>{value}</output>
    </>
  );
}

const tabs = () => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')];

it('renders icon and label chips as a tablist with roving focus', () => {
  act(() => root.render(<Sections />));
  const list = host.querySelector('[role="tablist"]');
  expect(list?.getAttribute('aria-label')).toBe('Sections');
  expect(tabs().map((tab) => tab.textContent)).toEqual(['Bots', 'Skills', 'Apps']);
  expect(tabs()[0]?.querySelector('[aria-hidden="true"] svg')?.getAttribute('data-icon')).toBe(
    'bot',
  );
  expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1, -1]);
  expect(tabs()[0]?.getAttribute('aria-controls')).toBe('sections-bots-panel');
});

it('moves selection with arrow keys, skipping disabled chips', () => {
  act(() => root.render(<Sections />));
  act(() => {
    tabs()[0]?.focus();
    tabs()[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(host.querySelector('output')?.textContent).toBe('skills');
  expect(document.activeElement).toBe(tabs()[1]);
  act(() => {
    tabs()[1]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  });
  expect(host.querySelector('output')?.textContent).toBe('bots');
  expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
});

it('selects a chip on click', () => {
  act(() => root.render(<Sections />));
  act(() => tabs()[1]?.click());
  expect(host.querySelector('output')?.textContent).toBe('skills');
  expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
});

it('turns a vertical wheel into horizontal scrolling when the row overflows', () => {
  act(() => root.render(<Sections />));
  const list = host.querySelector<HTMLDivElement>('[role="tablist"]')!;
  Object.defineProperty(list, 'scrollWidth', { value: 400 });
  Object.defineProperty(list, 'clientWidth', { value: 200 });
  act(() => {
    list.dispatchEvent(new WheelEvent('wheel', { deltaY: 60, bubbles: true }));
  });
  expect(list.scrollLeft).toBe(60);
});
