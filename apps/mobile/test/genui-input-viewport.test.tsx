// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const keyboard = vi.hoisted(() => ({ visible: false, show: () => {}, remove: vi.fn() }));
vi.mock('react-native', () => ({
  Keyboard: {
    isVisible: () => keyboard.visible,
    addListener: (_event: string, callback: () => void) => {
      keyboard.show = callback;
      return { remove: keyboard.remove };
    },
  },
}));
import { inputRevealDelta, useGenuiInputViewport } from '../src/ui/chat/genui-input-viewport';
import type { ComposerInput } from '../src/ui/chat/composer';
import type { ViewInstance } from 'react-native';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => vi.unstubAllGlobals());

describe('embedded input visibility', () => {
  it.each([
    [150, 50, 120, 400, 0],
    [350, 100, 120, 400, 50],
    [90, 50, 120, 400, -30],
    [150, 500, 120, 400, 30],
    [150, 50, 400, 120, 0],
  ])('reveals input %s + %s within %s–%s', (top, height, start, end, delta) => {
    expect(inputRevealDelta(top, height, start, end)).toBe(delta);
  });

  it('waits for the keyboard, measures above the actual composer, and retires focus on blur or exit', () => {
    keyboard.visible = false;
    keyboard.remove.mockClear();
    let frame: (() => void) | undefined;
    vi.stubGlobal('requestAnimationFrame', (run: () => void) => {
      frame = run;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {
      frame = undefined;
    });
    const flush = () => {
      const run = frame;
      frame = undefined;
      act(() => run?.());
    };
    const reveal = vi.fn();
    const composer = {
      current: {
        measureInWindow: (run: Parameters<ComposerInput['measureInWindow']>[0]) =>
          run(0, 420, 300, 44),
      },
    };
    const node: Pick<ViewInstance, 'measureInWindow'> = {
      measureInWindow: (run) => run(0, 300, 300, 500),
    };
    let enabled = true;
    let scope = 'host-a:channel-a';
    let focus!: ReturnType<typeof useGenuiInputViewport>;
    function Probe() {
      focus = useGenuiInputViewport(composer, reveal, 120, enabled, scope);
      return null;
    }
    const root = createRoot(document.createElement('div'));
    act(() => root.render(<Probe />));
    focus(node, { top: 100, height: 60 });
    flush();
    expect(reveal).not.toHaveBeenCalled();
    keyboard.visible = true;
    keyboard.show();
    flush();
    expect(reveal).toHaveBeenLastCalledWith(48);
    reveal.mockClear();
    focus(node, undefined);
    keyboard.show();
    flush();
    expect(reveal).not.toHaveBeenCalled();
    focus(node, { top: 100, height: 60 });
    scope = 'host-b:channel-b';
    act(() => root.render(<Probe />));
    flush();
    expect(reveal).not.toHaveBeenCalled();
    focus(node, { top: 100, height: 60 });
    enabled = false;
    act(() => root.render(<Probe />));
    flush();
    expect(reveal).not.toHaveBeenCalled();
    expect(keyboard.remove).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });
});
