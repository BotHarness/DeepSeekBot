// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronLeftOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
}));
import { MemoryImageView, MemoryImageDiff } from '../src/client/memory-image-view.js';
import type { MemoryImage } from '../src/client/bridge.js';
import type { BotHarnessTranslate } from '../src/client/locale.js';
const t: BotHarnessTranslate = (key) => key;
const image: MemoryImage = {
  source: 'index',
  status: 'ready',
  revision: 'a'.repeat(64),
  width: 40,
  height: 30,
  size: 100,
};
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});
function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
}
describe('Memory PNG presentation', () => {
  it('binds a lazy image and its download/enlargement to the same owner, path and version', async () => {
    mount();
    await act(async () =>
      root.render(<MemoryImageView slug="ada" path="notes/a.png" image={image} t={t} />),
    );
    const img = host.querySelector('img')!;
    expect(img.getAttribute('loading')).toBe('lazy');
    const url = new URL(img.src);
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      slug: 'ada',
      path: 'notes/a.png',
      source: 'index',
      revision: image.revision,
    });
    expect(host.querySelector('a')?.href).toBe(img.src);
    await act(async () => {
      img.dispatchEvent(new Event('load'));
      host.querySelector('button')!.click();
    });
    expect(document.querySelector('[role="dialog"] img')?.getAttribute('src')).toBe(
      img.getAttribute('src'),
    );
  });
  it('renders absence separately from a failed side, and resets load failures for a new revision', async () => {
    mount();
    await act(async () =>
      root.render(<MemoryImageDiff slug="ada" path="a.png" images={{ after: image }} t={t} />),
    );
    expect(host.textContent).toContain('memory.image.before');
    expect(host.textContent).toContain('memory.image.after');
    expect(host.textContent).toContain('memory.image.absent');
    await act(async () => host.querySelector('img')!.dispatchEvent(new Event('error')));
    expect(host.textContent).toContain('memory.image.loadFailed');
    expect(host.querySelector('img')).toBeNull();
    await act(async () =>
      root.render(
        <MemoryImageDiff
          slug="ada"
          path="a.png"
          images={{ after: { ...image, revision: 'b'.repeat(64) } }}
          t={t}
        />,
      ),
    );
    expect(host.querySelector('img')).not.toBeNull();
  });
  it('shows an over-limit result without requesting image bytes', async () => {
    mount();
    await act(async () =>
      root.render(
        <MemoryImageView
          slug="ada"
          path="a.png"
          image={{ source: 'worktree', status: 'too-large' }}
          t={t}
        />,
      ),
    );
    expect(host.textContent).toContain('memory.image.too-large');
    expect(host.querySelector('img')).toBeNull();
  });
  it('waits for intersection before creating an image request', async () => {
    let reveal: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          reveal = () => callback([{ isIntersecting: true }]);
        }
        observe() {}
        disconnect = disconnect;
      },
    );
    try {
      mount();
      await act(async () =>
        root.render(<MemoryImageView slug="ada" path="a.png" image={image} t={t} />),
      );
      expect(host.querySelector('img')).toBeNull();
      await act(async () => reveal?.());
      expect(host.querySelector('img')).not.toBeNull();
      expect(disconnect).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
