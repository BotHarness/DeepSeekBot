import { useCallback, useRef } from 'react';

const KEEP_RENDERED_VIEWPORTS = 1.5;

export class OffscreenBlocks {
  readonly root: HTMLElement;
  readonly #blocks = new Set<HTMLElement>();
  readonly #resize: ResizeObserver | undefined;
  #width: number;
  #frame: number | undefined;

  constructor(root: HTMLElement) {
    this.root = root;
    this.#width = root.clientWidth;
    root.addEventListener('scroll', this.onScroll, { passive: true });
    this.#resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => {
            if (root.clientWidth !== this.#width) {
              this.#width = root.clientWidth;
              this.reveal();
            }
            this.schedule();
          });
    this.#resize?.observe(root);
  }

  observe(block: HTMLElement): void {
    this.#blocks.add(block);
    this.schedule();
  }

  readonly onScroll = (): void => {
    this.update();
  };

  readonly schedule = (): void => {
    if (this.#frame !== undefined) return;
    this.#frame = window.requestAnimationFrame(() => {
      this.#frame = undefined;
      this.update();
    });
  };

  update(): void {
    const keep = this.root.clientHeight * KEEP_RENDERED_VIEWPORTS;
    const top = this.root.scrollTop - keep;
    const bottom = this.root.scrollTop + this.root.clientHeight + keep;
    const rootTop = this.root.getBoundingClientRect().top - this.root.scrollTop;
    for (const block of this.#blocks) {
      if (!block.isConnected) {
        this.#blocks.delete(block);
        continue;
      }
      const offscreen = block.dataset['offscreen'] !== undefined;
      const bounds = block.getBoundingClientRect();
      const blockTop = bounds.top - rootTop;
      const near = blockTop < bottom && blockTop + bounds.height > top;
      if (near && offscreen) {
        delete block.dataset['offscreen'];
      } else if (!near && !offscreen && bounds.height > 0) {
        block.style.setProperty('contain-intrinsic-block-size', `${bounds.height}px`);
        block.dataset['offscreen'] = '';
      }
    }
  }

  reveal(): void {
    for (const block of this.#blocks) delete block.dataset['offscreen'];
    this.schedule();
  }

  disconnect(): void {
    if (this.#frame !== undefined) window.cancelAnimationFrame(this.#frame);
    this.#frame = undefined;
    this.root.removeEventListener('scroll', this.onScroll);
    this.#resize?.disconnect();
    for (const block of this.#blocks) delete block.dataset['offscreen'];
    this.#blocks.clear();
  }
}

export function insideOffscreenBlock(element: Element): boolean {
  return element.closest('[data-offscreen]') !== null;
}

export function revealOffscreen<T extends Element>(element: T): T {
  const block = element.closest<HTMLElement>('[data-offscreen]');
  if (block !== null) delete block.dataset['offscreen'];
  return element;
}

export function useOffscreenBlocks(): (block: HTMLElement | null) => void {
  const tracker = useRef<OffscreenBlocks | undefined>(undefined);
  return useCallback((block: HTMLElement | null) => {
    const root = block?.parentElement;
    if (block === null || root == null || typeof window.requestAnimationFrame !== 'function')
      return;
    if (tracker.current?.root !== root) {
      tracker.current?.disconnect();
      tracker.current = new OffscreenBlocks(root);
    }
    tracker.current.observe(block);
  }, []);
}

export function observeVisibility(
  node: Element,
  onChange: (visible: boolean) => void,
): (() => void) | undefined {
  if (typeof IntersectionObserver === 'undefined') return undefined;
  const observer = new IntersectionObserver((entries) =>
    onChange(entries.some((entry) => entry.isIntersecting)),
  );
  const block = node.closest<HTMLElement>('.bh-message-block');
  if (block === null || typeof MutationObserver === 'undefined') {
    observer.observe(node);
    return () => observer.disconnect();
  }
  let observing = false;
  const apply = (): void => {
    const offscreen = block.dataset['offscreen'] !== undefined;
    if (offscreen === !observing) return;
    observing = !offscreen;
    if (observing) {
      observer.observe(node);
    } else {
      observer.unobserve(node);
      onChange(false);
    }
  };
  const marks = new MutationObserver(apply);
  marks.observe(block, { attributes: true, attributeFilter: ['data-offscreen'] });
  apply();
  return () => {
    marks.disconnect();
    observer.disconnect();
  };
}
