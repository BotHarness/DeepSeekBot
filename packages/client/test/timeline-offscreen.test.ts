// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import {
  OffscreenBlocks,
  insideOffscreenBlock,
  observeVisibility,
  revealOffscreen,
} from '../src/client/timeline-offscreen.js';

function rect(top: number, height: number): DOMRect {
  return {
    top,
    height,
    bottom: top + height,
    left: 0,
    right: 100,
    width: 100,
    x: 0,
    y: top,
  } as DOMRect;
}

function timeline(heights: number[], scrollTop: number, viewport = 100) {
  const root = document.createElement('div');
  Object.defineProperty(root, 'clientHeight', { value: viewport });
  root.scrollTop = scrollTop;
  root.getBoundingClientRect = () => rect(0, viewport);
  let y = 0;
  const blocks = heights.map((height) => {
    const block = document.createElement('div');
    block.className = 'bh-message-block';
    const top = y;
    block.getBoundingClientRect = () => rect(top - root.scrollTop, height);
    y += height;
    root.append(block);
    return block;
  });
  document.body.append(root);
  return { root, blocks };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('skips blocks beyond one and a half viewports and keeps their measured height', () => {
  const { root, blocks } = timeline([100, 100, 100, 100, 100, 100], 300);
  const tracker = new OffscreenBlocks(root);
  for (const block of blocks) tracker.observe(block);
  tracker.update();

  expect(blocks.map((block) => block.dataset['offscreen'] !== undefined)).toEqual([
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
  expect(blocks[0]!.style.getPropertyValue('contain-intrinsic-block-size')).toBe('100px');
  expect(insideOffscreenBlock(blocks[0]!)).toBe(true);
  const message = document.createElement('p');
  blocks[0]!.append(message);
  expect(revealOffscreen(message)).toBe(message);
  expect(blocks[0]!.dataset['offscreen']).toBeUndefined();

  tracker.update();
  expect(blocks[0]!.dataset['offscreen']).toBe('');

  root.scrollTop = 0;
  root.dispatchEvent(new Event('scroll'));
  expect(blocks[0]!.dataset['offscreen']).toBeUndefined();
  expect(blocks[5]!.dataset['offscreen']).toBe('');

  blocks[4]!.remove();
  root.scrollTop = 300;
  root.dispatchEvent(new Event('scroll'));
  expect(blocks[3]!.dataset['offscreen']).toBeUndefined();
  expect(blocks[4]!.dataset['offscreen']).toBe('');

  tracker.disconnect();
  expect(
    blocks.some((block) => block.isConnected && block.dataset['offscreen'] !== undefined),
  ).toBe(false);
});

it('does not observe an avatar while its block is offscreen', async () => {
  const observed = new Set<Element>();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe(target: Element) {
        observed.add(target);
      }
      unobserve(target: Element) {
        observed.delete(target);
      }
      disconnect() {
        observed.clear();
      }
    },
  );
  const { blocks } = timeline([100], 0);
  const avatar = document.createElement('span');
  blocks[0]!.append(avatar);
  const changes: boolean[] = [];
  const stop = observeVisibility(avatar, (visible) => changes.push(visible));
  expect(observed.has(avatar)).toBe(true);

  blocks[0]!.dataset['offscreen'] = '';
  await Promise.resolve();
  expect(observed.has(avatar)).toBe(false);
  expect(changes).toEqual([false]);

  delete blocks[0]!.dataset['offscreen'];
  await Promise.resolve();
  expect(observed.has(avatar)).toBe(true);
  stop?.();
  expect(observed.size).toBe(0);
});
