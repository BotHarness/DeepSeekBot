import { expect, it, vi } from 'vitest';
import { createMemoryVisibility } from '../src/ui/chat/memory-visibility';

it('loads only intersecting native rectangles and unsubscribes once visible', () => {
  const stage = createMemoryVisibility(() => ({
    measureInWindow: (read) => read(0, 100, 400, 700),
  }));
  let y = 900;
  const visible = vi.fn();
  stage.observe({ measureInWindow: (read) => read(0, y, 400, 100) }, visible);
  expect(visible).not.toHaveBeenCalled();
  stage.notify();
  expect(visible).not.toHaveBeenCalled();
  y = 750;
  stage.notify();
  expect(visible).toHaveBeenCalledOnce();
  stage.notify();
  expect(visible).toHaveBeenCalledOnce();
});

it('ignores delayed native measurements after unmount and waits for a nonzero frame', () => {
  let height = 0;
  let deliver: (() => void) | undefined;
  const stage = createMemoryVisibility(() => ({
    measureInWindow: (read) => {
      deliver = () => read(0, 100, 400, height);
    },
  }));
  const visible = vi.fn();
  const stop = stage.observe({ measureInWindow: (read) => read(0, 100, 400, 100) }, visible);
  deliver?.();
  expect(visible).not.toHaveBeenCalled();
  height = 700;
  stage.notify();
  stop();
  deliver?.();
  expect(visible).not.toHaveBeenCalled();
});
