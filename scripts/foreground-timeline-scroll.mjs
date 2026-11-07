import assert from 'node:assert/strict';

export function summarizeForegroundScroll(samples, observation) {
  const intervals = [...observation.rafIntervalsMs].sort((left, right) => left - right);
  const at = (quantile) =>
    intervals[Math.min(intervals.length - 1, Math.floor(intervals.length * quantile))];
  return {
    scope:
      'Sampled foreground native-wheel geometry and rAF diagnostics; not proof of zero jumps, presented FPS or installed-native acceptance',
    correctnessPass:
      samples.length > 0 &&
      samples.every(
        (sample) => sample.visible && sample.focused && sample.gapPixels === 0 && sample.anchor,
      ) &&
      observation.trustedWheels > 0 &&
      observation.untrustedWheels === 0 &&
      intervals.length > 0 &&
      observation.gapFrames === 0 &&
      !observation.truncated,
    trustedWheels: observation.trustedWheels,
    untrustedWheels: observation.untrustedWheels,
    raf: { count: intervals.length, medianMs: at(0.5), p95Ms: at(0.95), maxMs: intervals.at(-1) },
    samples,
    observation,
  };
}

export async function observeForegroundTimelineScroll(page, tracePath) {
  await page.bringToFront();
  await page.waitForFunction(() => document.visibilityState === 'visible' && document.hasFocus());
  const body = await page.$('.bh-chat-body');
  assert.ok(body, 'The actual conversation must be mounted.');
  const bounds = await body.boundingBox();
  assert.ok(bounds?.width && bounds.height, 'The conversation must have visible geometry.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.evaluate(() => {
    const pane = document.querySelector('.bh-chat-body');
    const state = {
      rafIntervalsMs: [],
      trustedWheels: 0,
      untrustedWheels: 0,
      truncated: false,
      last: 0,
      gapFrames: 0,
      maxGapPixels: 0,
    };
    const wheel = (event) => {
      state[event.isTrusted ? 'trustedWheels' : 'untrustedWheels']++;
    };
    const frame = (now) => {
      const viewport = pane.getBoundingClientRect();
      const gapPixels = [...pane.querySelectorAll('.bh-timeline-gap')].reduce((total, node) => {
        const bounds = node.getBoundingClientRect();
        return (
          total +
          Math.max(0, Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top))
        );
      }, 0);
      if (gapPixels > 0) state.gapFrames++;
      state.maxGapPixels = Math.max(state.maxGapPixels, gapPixels);
      if (state.last) {
        if (state.rafIntervalsMs.length < 4000) state.rafIntervalsMs.push(now - state.last);
        else state.truncated = true;
      }
      state.last = now;
      state.frameId = requestAnimationFrame(frame);
    };
    pane.addEventListener('wheel', wheel, { passive: true });
    state.frameId = requestAnimationFrame(frame);
    window.__bhForegroundScroll = state;
    window.__bhStopForegroundScroll = () => {
      cancelAnimationFrame(state.frameId);
      pane.removeEventListener('wheel', wheel);
      delete window.__bhStopForegroundScroll;
      delete window.__bhForegroundScroll;
      return state;
    };
  });
  let tracing = false;
  const samples = [];
  let observation;
  try {
    await page.tracing.start({
      path: tracePath,
      categories: [
        'devtools.timeline',
        'disabled-by-default-devtools.timeline.frame',
        'cc',
        'viz',
        'benchmark',
      ],
    });
    tracing = true;
    for (const deltaY of [-450, -450, -450, -450, 450, 450, 450, 450]) {
      await page.mouse.wheel({ deltaY });
      await new Promise((resolve) => setTimeout(resolve, 250));
      samples.push(
        await page.$eval('.bh-chat-body', (pane) => {
          const viewport = pane.getBoundingClientRect();
          const gapPixels = [...pane.querySelectorAll('.bh-timeline-gap')].reduce((total, node) => {
            const bounds = node.getBoundingClientRect();
            return (
              total +
              Math.max(
                0,
                Math.min(bounds.bottom, viewport.bottom) - Math.max(bounds.top, viewport.top),
              )
            );
          }, 0);
          const anchor = [...pane.querySelectorAll('[data-message-id]')].find((node) => {
            const bounds = node.getBoundingClientRect();
            return bounds.bottom > viewport.top && bounds.top < viewport.bottom;
          });
          return {
            visible: document.visibilityState === 'visible',
            focused: document.hasFocus(),
            gapPixels,
            scrollTop: pane.scrollTop,
            scrollHeight: pane.scrollHeight,
            anchor: anchor
              ? {
                  id: anchor.getAttribute('data-message-id'),
                  offset: anchor.getBoundingClientRect().top - viewport.top,
                }
              : null,
          };
        }),
      );
    }
  } finally {
    try {
      observation = await page.evaluate(() => window.__bhStopForegroundScroll());
    } finally {
      if (tracing) await page.tracing.stop();
    }
  }
  return { ...summarizeForegroundScroll(samples, observation), trace: tracePath };
}
