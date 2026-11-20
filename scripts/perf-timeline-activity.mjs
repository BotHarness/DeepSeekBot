import assert from 'node:assert/strict';

export function timelineActivityPlan({ animate, animateScroll, foregroundScroll, headed }) {
  assert.ok(
    !animateScroll || (animate && foregroundScroll && headed),
    '--animate-scroll requires --animate, --foreground-scroll and --headed',
  );
  return animateScroll
    ? { protocol: 'timeline-animated-scroll-v2', phase: 'before-scroll' }
    : { protocol: 'timeline-idle-v1', phase: animate ? 'after-scroll' : 'none' };
}

export async function installTimelineActivity(page, { waitUntilRunning = true } = {}) {
  await page.evaluate(() => {
    const style = document.createElement('style');
    style.textContent =
      '@keyframes perf-bob{from{transform:translateY(0)}to{transform:translateY(6px)}}' +
      '.perf-animated{position:fixed;right:24px;bottom:24px;width:16px;height:16px;' +
      'border-radius:50%;background:currentColor;animation:perf-bob .6s ease-in-out infinite alternate}';
    document.head.append(style);
    const node = document.createElement('div');
    node.className = 'perf-animated';
    document.body.append(node);
  });
  if (waitUntilRunning)
    await page.waitForFunction(() =>
      document
        .querySelector('.perf-animated')
        ?.getAnimations()
        .some((animation) => animation.playState === 'running' && animation.currentTime !== null),
    );
}
