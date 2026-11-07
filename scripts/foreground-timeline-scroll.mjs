import assert from 'node:assert/strict';

export function fittingWindowBounds(screen) {
  assert.ok(
    [screen.availLeft, screen.availTop, screen.availWidth, screen.availHeight].every(
      Number.isFinite,
    ) &&
      screen.availWidth > 0 &&
      screen.availHeight > 0,
    'Invalid native display geometry.',
  );
  return {
    left: Math.round(screen.availLeft),
    top: Math.round(screen.availTop),
    width: Math.min(1440, Math.floor(screen.availWidth)),
    height: Math.min(900, Math.floor(screen.availHeight)),
  };
}

export function assertNativeViewport(geometry) {
  const { screen, windowBounds: bounds } = geometry;
  fittingWindowBounds(screen);
  assert.ok(
    [
      geometry.innerWidth,
      geometry.innerHeight,
      geometry.outerWidth,
      geometry.outerHeight,
      geometry.devicePixelRatio,
      bounds.width,
      bounds.height,
    ].every((value) => Number.isFinite(value) && value > 0) &&
      geometry.innerWidth <= geometry.outerWidth &&
      geometry.innerHeight <= geometry.outerHeight &&
      geometry.outerWidth <= bounds.width + 1 &&
      geometry.outerHeight <= bounds.height + 1 &&
      bounds.left >= screen.availLeft &&
      bounds.top >= screen.availTop &&
      bounds.left + bounds.width <= screen.availLeft + screen.availWidth + 1 &&
      bounds.top + bounds.height <= screen.availTop + screen.availHeight + 1,
    'The native viewport must fit its actual on-screen window; emulation is not foreground evidence.',
  );
}

export async function calibrateNativeViewport(page) {
  await page.setViewport(null);
  const cdp = await page.createCDPSession();
  try {
    const screen = await page.evaluate(() => ({
      availLeft: window.screen.availLeft,
      availTop: window.screen.availTop,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
    }));
    const { windowId } = await cdp.send('Browser.getWindowForTarget');
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
    const desired = fittingWindowBounds(screen);
    await cdp.send('Browser.setWindowBounds', { windowId, bounds: desired });
    await page.waitForFunction(
      ({ width, height }) =>
        Math.abs(window.outerWidth - width) <= 1 && Math.abs(window.outerHeight - height) <= 1,
      {},
      desired,
    );
    const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
    const geometry = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      outerWidth: window.outerWidth,
      outerHeight: window.outerHeight,
      devicePixelRatio: window.devicePixelRatio,
    }));
    const result = { ...geometry, screen, windowBounds: bounds };
    assertNativeViewport(result);
    return result;
  } finally {
    await cdp.detach();
  }
}

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
