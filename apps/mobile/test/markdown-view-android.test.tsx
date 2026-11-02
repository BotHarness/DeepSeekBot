// @vitest-environment jsdom
import { act, Children, isValidElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const { copied, textBodies } = vi.hoisted(() => ({ copied: vi.fn(), textBodies: [] as string[] }));
vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  const flatten = (children: ReactNode): string =>
    Children.toArray(children)
      .map((child) =>
        isValidElement<{ children?: ReactNode }>(child)
          ? flatten(child.props.children)
          : String(child),
      )
      .join('');
  return {
    ...shim,
    Text: (props: { children?: ReactNode; accessibilityRole?: string; onPress?: () => void }) => {
      textBodies.push(flatten(props.children));
      return (
        <span role={props.accessibilityRole} onClick={props.onPress}>
          {props.children}
        </span>
      );
    },
  };
});
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('react-native-enriched-markdown', () => ({
  EnrichedMarkdownText: ({
    markdown,
    onLinkPress,
  }: {
    markdown: string;
    onLinkPress(event: { url: string }): void;
  }) => (
    <pre data-testid="native-markdown" onClick={() => onLinkPress({ url: 'docs/native.md' })}>
      {markdown}
    </pre>
  ),
}));
vi.mock('../src/ui/chat/message-menu', () => ({ copyMessage: copied }));

import { MarkdownView } from '../src/ui/markdown-view.android';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let cleanup = () => {};
afterEach(() => {
  cleanup();
  textBodies.length = 0;
  copied.mockClear();
});

async function render(source: string, streaming = false, onOpenLink?: (url: string) => void) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanup = () => {
    act(() => root.unmount());
    container.remove();
  };
  await act(async () =>
    root.render(
      <MarkdownView
        source={source}
        streaming={streaming}
        selectable={false}
        {...(onOpenLink ? { onOpenLink } : {})}
      />,
    ),
  );
  return {
    container,
    update: async (next: string) => {
      await act(async () =>
        root.render(
          <MarkdownView
            source={next}
            streaming={streaming}
            selectable={false}
            {...(onOpenLink ? { onOpenLink } : {})}
          />,
        ),
      );
    },
  };
}

it('uses the supplied link owner for prose, table and native fallback blocks', async () => {
  const open = vi.fn();
  const { container } = await render(
    '[Guide](docs/setup.md)\n\n| Docs |\n|---|\n| [Table](docs/table.md) |\n\n![Image](https://example.com/image.png)',
    false,
    open,
  );
  for (const link of container.querySelectorAll<HTMLElement>('[role="link"]'))
    await act(async () => link.click());
  await act(async () =>
    container.querySelector<HTMLElement>('[data-testid="native-markdown"]')!.click(),
  );
  expect(open.mock.calls).toEqual([['docs/setup.md'], ['docs/table.md'], ['docs/native.md']]);
});

it('preserves prose, entities, emoji, links, lists, quotes and exact code-copy content', async () => {
  const code = 'const x = "<&amp;>";';
  const source =
    '# Title\n\nHello **world** &amp; 👨‍👩‍👧‍👦 [link](https://example.com)  \nnext\n\n3. first\n4. second\n\n> quote\n\n```ts\n' +
    code +
    '\n```';
  const { container } = await render(source);
  expect(container.querySelector('[data-testid="native-markdown"]')).toBeNull();
  expect(container.textContent).toContain('Hello world & 👨‍👩‍👧‍👦 link\nnext');
  expect(container.textContent).toContain('3.first4.second');
  expect(container.textContent).toContain('quote');
  expect(container.querySelector('[role="link"]')?.textContent).toBe('link');
  const copy = container.querySelector<HTMLButtonElement>(`button[aria-label="${t.copy}"]`)!;
  await act(async () => copy.click());
  expect(copied).toHaveBeenCalledWith(code);
});

it('updates the streaming tail without rerendering already completed text blocks', async () => {
  const { container, update } = await render('First **complete** paragraph.\n\nChanging', true);
  textBodies.length = 0;
  await update('First **complete** paragraph.\n\nChanging text🙂');
  expect(container.textContent).toContain('First complete paragraph.');
  expect(container.textContent).toContain('Changing text🙂');
  expect(textBodies.some((body) => body.includes('First'))).toBe(false);
});

it('renders tables synchronously and keeps the rich image path', async () => {
  const table = '| A | B |\n|---|---|\n| 1 | 2 |\n\n';
  const { container } = await render(table + '![alt](https://example.com/image.png)');
  const native = [...container.querySelectorAll('[data-testid="native-markdown"]')];
  expect(native).toHaveLength(1);
  expect(native[0]?.textContent).toContain('![alt]');
  expect(container.textContent).toContain('AB12');
});

it('keeps document references resolved in the synchronous prose path', async () => {
  const { container } = await render('[Read][ref]\n\n[ref]: https://example.com');
  expect(container.querySelector('[data-testid="native-markdown"]')).toBeNull();
  expect(container.querySelector('[role="link"]')?.textContent).toBe('Read');
});

it('keeps task-list checkboxes and their text without falling back or duplicating markers', async () => {
  const { container } = await render('- [x] done\n- [ ] pending');
  expect(container.querySelector('[data-testid="native-markdown"]')).toBeNull();
  expect(container.textContent).toBe('☑done☐pending');
});

it('preserves native-only spoiler and admonition semantics', async () => {
  const { container } = await render('||hidden||\n\n> [!NOTE]\n> Read this');
  expect(container.querySelectorAll('[data-testid="native-markdown"]')).toHaveLength(2);
});

it.each([true, false])(
  'renders the original mixed reply tail after a delayed append (streaming=%s)',
  async (streaming) => {
    const { default: body } = await import('./fixtures/markdown-tail.json');
    const prefix = body.slice(0, body.indexOf('\n最后一段'));
    const { container, update } = await render('', streaming);
    for (let end = 80; end < prefix.length; end += 80) await update(prefix.slice(0, end));
    await update(prefix);
    expect(container.textContent).toContain('第 40 行');
    expect(container.textContent).not.toContain('REPLAY_COMPLETE');
    await update(body);
    expect(container.textContent).toContain('最后一段：REPLAY_COMPLETE。');
  },
);
