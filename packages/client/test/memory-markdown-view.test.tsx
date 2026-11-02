// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronLeftOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
}));
import { MemoryMarkdownView, MemoryMarkdownDiff } from '../src/client/memory-markdown-view.js';
import type { MemoryMarkdown } from '../src/client/bridge.js';
import type { BotHarnessTranslate } from '../src/client/locale.js';
const t: BotHarnessTranslate = (key, values) => key + (values?.name ? ` ${values.name}` : '');
const documentVersion: MemoryMarkdown = {
  source: 'a'.repeat(40),
  revision: 'b'.repeat(64),
  body: '# Field note\n\n**Strong** and `code`.\n\n| Item | Value |\n| --- | --- |\n| Image | ![Chart][chart] |\n\n[chart]: ../chart.png\n\n![Remote](https://example.invalid/remote.png)\n\n![Unsafe](file:///private/x.png)\n\n<script>alert(1)</script>',
  status: 'ready',
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
const fetchMock = vi.fn();
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  vi.stubGlobal('fetch', fetchMock);
  Object.assign(URL, {
    createObjectURL: vi.fn(() => 'blob:local-chart'),
    revokeObjectURL: vi.fn(),
  });
  fetchMock
    .mockReset()
    .mockResolvedValue({ ok: true, blob: async () => new Blob(['png'], { type: 'image/png' }) });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = async (version = documentVersion) =>
  act(async () =>
    root.render(<MemoryMarkdownView slug="atlas" path="notes/a.md" document={version} t={t} />),
  );
describe('rendered Memory Markdown', () => {
  it('renders real Markdown semantics and reference images without executing HTML or requesting external images', async () => {
    await render();
    expect(host.querySelector('h1')?.textContent).toBe('Field note');
    expect(host.querySelector('strong')?.textContent).toBe('Strong');
    expect(host.querySelector('table')).not.toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const query = new URL(fetchMock.mock.calls[0]![0], 'http://localhost').searchParams;
    expect(Object.fromEntries(query)).toMatchObject({
      slug: 'atlas',
      path: 'notes/a.md',
      source: documentVersion.source,
      revision: documentVersion.revision,
      reference: '../chart.png',
    });
    expect(host.querySelector('img')?.src).toBe('blob:local-chart');
    expect(host.querySelectorAll('img')).toHaveLength(1);
    const external = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.startsWith('memory.markdown.loadExternal'),
    )!;
    await act(async () => external.click());
    const image = host.querySelector('img[src="https://example.invalid/remote.png"]')!;
    expect(image.getAttribute('crossorigin')).toBe('anonymous');
    expect(image.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('waits for visibility and aborts and discards a late response when the selected revision changes', async () => {
    const reveals: (() => void)[] = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          reveals.push(() => callback([{ isIntersecting: true }]));
        }
        observe() {}
        disconnect() {}
      },
    );
    let finish: ((value: unknown) => void) | undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => reveals[0]!());
    const signal = fetchMock.mock.calls[0]![1].signal as AbortSignal;
    await render({ ...documentVersion, revision: 'c'.repeat(64) });
    expect(signal.aborted).toBe(true);
    await act(async () => finish!({ ok: true, blob: async () => new Blob(['obsolete']) }));
    expect(host.querySelector('img')).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
  it('shows coded local failure and retries, then releases its temporary image on exit', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { code: 'memory-image-missing' } }),
    });
    await render();
    expect(host.textContent).toContain('memory.image.missing');
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'memory.markdown.retry')!
        .click(),
    );
    expect(host.querySelector('img')?.src).toBe('blob:local-chart');
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('load')));
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe('blob:local-chart');
    await act(async () => root.render(null));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-chart');
  });
  it('distinguishes an absent side from an unavailable document', async () => {
    await act(async () =>
      root.render(
        <MemoryMarkdownDiff
          slug="atlas"
          path="a.md"
          markdown={{ after: { ...documentVersion, status: 'too-large', body: '' } }}
          t={t}
        />,
      ),
    );
    expect(host.textContent).toContain('memory.image.before');
    expect(host.textContent).toContain('memory.image.absent');
    expect(host.textContent).toContain('memory.markdown.unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
