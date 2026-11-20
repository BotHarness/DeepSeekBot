import { describe, expect, it, vi } from 'vitest';
import { installTimelineActivity, timelineActivityPlan } from '../perf-timeline-activity.mjs';

describe('explicit timeline animation measurement protocol', () => {
  it('preserves the legacy idle-only animation rather than relabelling old runs', () => {
    expect(timelineActivityPlan({ animate: true })).toEqual({
      protocol: 'timeline-idle-v1',
      phase: 'after-scroll',
    });
    expect(timelineActivityPlan({})).toEqual({ protocol: 'timeline-idle-v1', phase: 'none' });
  });

  it('requires actual headed foreground scrolling for the new animated-scroll protocol', () => {
    expect(
      timelineActivityPlan({
        animate: true,
        animateScroll: true,
        foregroundScroll: true,
        headed: true,
      }),
    ).toEqual({ protocol: 'timeline-animated-scroll-v2', phase: 'before-scroll' });
  });

  it.each([
    { animate: false, foregroundScroll: true, headed: true },
    { animate: true, foregroundScroll: false, headed: true },
    { animate: true, foregroundScroll: true, headed: false },
  ])('refuses a misleading animated-scroll label: %j', (options) => {
    expect(() => timelineActivityPlan({ ...options, animateScroll: true })).toThrow(
      '--animate-scroll requires',
    );
  });

  it('waits for a live animation before allowing scroll measurement', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn().mockResolvedValue(undefined),
    };
    await installTimelineActivity(page);
    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(page.waitForFunction).toHaveBeenCalledOnce();
    expect(page.evaluate.mock.invocationCallOrder[0]).toBeLessThan(
      page.waitForFunction.mock.invocationCallOrder[0],
    );
  });

  it('retains startup failure instead of recording an inactive animation', async () => {
    const page = {
      evaluate: async () => undefined,
      waitForFunction: async () => {
        throw new Error('Animation did not start');
      },
    };
    await expect(installTimelineActivity(page)).rejects.toThrow('Animation did not start');
  });

  it('does not add a new wait to the legacy idle-only timing path', async () => {
    const page = {
      evaluate: vi.fn().mockResolvedValue(undefined),
      waitForFunction: vi.fn(),
    };
    await installTimelineActivity(page, { waitUntilRunning: false });
    expect(page.evaluate).toHaveBeenCalledOnce();
    expect(page.waitForFunction).not.toHaveBeenCalled();
  });
});
