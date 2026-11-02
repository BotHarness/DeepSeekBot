// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
import { DeferredContent } from '../src/ui/primitives/deferred-content';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => vi.unstubAllGlobals());

describe('deferred page content', () => {
  it('commits the shell before mounting content and cancels pending work on dismissal', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.set(++id, callback);
      return id;
    });
    vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
    const frame = () => {
      const work = [...frames.values()];
      frames.clear();
      act(() => {
        for (const callback of work) callback(0);
      });
    };
    const view = document.createElement('div');
    const root = createRoot(view);
    let mounts = 0;
    function Content() {
      mounts++;
      return <span>Ready</span>;
    }
    act(() =>
      root.render(
        <DeferredContent fallback={<span>Skeleton</span>}>
          <Content />
        </DeferredContent>,
      ),
    );
    expect(view.textContent).toBe('Skeleton');
    expect(mounts).toBe(0);
    frame();
    expect(mounts).toBe(0);
    frame();
    expect(view.textContent).toBe('Ready');
    expect(mounts).toBe(1);
    act(() =>
      root.render(
        <DeferredContent key="another-host" fallback={<span>Skeleton</span>}>
          <Content />
        </DeferredContent>,
      ),
    );
    expect(view.textContent).toBe('Skeleton');
    act(() => root.unmount());
    expect(frames.size).toBe(0);
    expect(mounts).toBe(1);
  });
});
