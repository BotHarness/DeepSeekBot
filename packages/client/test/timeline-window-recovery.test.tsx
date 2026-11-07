// @vitest-environment jsdom
import { act, createElement, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useTimelineWindow } from '../src/client/timeline-window.js';

it('retains a measurable report group when changing heights leaves the viewport outside cached bounds', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 300,
    bottom: 100,
    width: 300,
    height: 100,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
    window.setTimeout(() => callback(performance.now()), 16),
  );
  function ReportTimeline() {
    const timeline = useTimelineWindow(['report'], new Set());
    const mount = useCallback(
      (node: HTMLDivElement | null) => {
        if (node) node.scrollTop = 5000;
        timeline.rootRef(node);
      },
      [timeline.rootRef],
    );
    return createElement(
      'div',
      { ref: mount },
      timeline.runs.map((run) =>
        run.kind === 'gap'
          ? createElement('div', { key: 'gap', 'data-gap': '', style: { height: run.height } })
          : createElement(
              'div',
              { key: 'report', ref: timeline.blockRef('report'), 'data-group-key': 'report' },
              'Synthetic report',
            ),
      ),
    );
  }
  try {
    await act(async () => root.render(createElement(ReportTimeline)));
    await act(async () => vi.advanceTimersByTime(64));
    expect(container.querySelector('[data-group-key="report"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  }
});
