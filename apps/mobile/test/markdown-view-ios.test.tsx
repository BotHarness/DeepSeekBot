// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const { rendered } = vi.hoisted(() => ({ rendered: [] as string[] }));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-enriched-markdown', () => ({
  EnrichedMarkdownText: ({ markdown }: { markdown: string }) => {
    rendered.push(markdown);
    return <pre data-testid="native-markdown">{markdown}</pre>;
  },
}));

import { MarkdownView } from '../src/ui/markdown-view';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let cleanup = () => {};
afterEach(() => {
  cleanup();
  rendered.length = 0;
});

async function render(source: string, streaming: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  const show = (next: string, live: boolean) =>
    act(async () =>
      root.render(<MarkdownView source={next} streaming={live} selectable={false} />),
    );
  await show(source, streaming);
  return { container, show };
}

const natives = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-testid="native-markdown"]')].map(
    (node) => node.textContent,
  );

it('re-renders only the open tail block while a reply streams', async () => {
  const head = '# Title\n\nFirst paragraph.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n';
  const { container, show } = await render(`${head}Tail **bo`, true);
  expect(natives(container)).toEqual([
    '# Title\n\n',
    'First paragraph.\n\n',
    '| a | b |\n| - | - |\n| 1 | 2 |\n\n',
    'Tail **bo**',
  ]);
  rendered.length = 0;
  await show(`${head}Tail **bold** and more`, true);
  expect(rendered).toEqual(['Tail **bold** and more']);
});

it('renders a finished reply as one native document', async () => {
  const source = '# Title\n\nFirst paragraph.\n\nTail **bold**';
  const { container, show } = await render(source, true);
  expect(natives(container)).toHaveLength(3);
  await show(source, false);
  expect(natives(container)).toEqual([source]);
});
