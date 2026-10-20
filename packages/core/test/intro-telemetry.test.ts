import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';

function methodsWith(capture = vi.fn()) {
  const onboarding = {
    enter: vi.fn(async () => ({ profileId: 'p', tutorial: 'active', completed: false })),
  };
  const methods = createBridgeMethods({
    telemetry: { status: vi.fn(), setPreference: vi.fn(), capture },
    onboarding,
  } as unknown as Parameters<typeof createBridgeMethods>[0]);
  return { methods, capture };
}

describe('intro and tutorial telemetry', () => {
  it('captures allow-listed intro events with only their known fields', () => {
    const { methods, capture } = methodsWith();
    expect(methods.introEvent({ event: 'intro_shown', extra: 'drop me' }).ok).toBe(true);
    expect(methods.introEvent({ event: 'intro_dismissed', step: 'model', via: 'skip' }).ok).toBe(
      true,
    );
    expect(methods.introEvent({ event: 'intro_model_saved', advanced: true }).ok).toBe(true);
    expect(capture.mock.calls).toEqual([
      ['intro_shown', {}],
      ['intro_dismissed', { step: 'model', via: 'skip' }],
      ['intro_model_saved', { advanced: true }],
    ]);
  });

  it('rejects unknown events and values without capturing', () => {
    const { methods, capture } = methodsWith();
    expect(methods.introEvent({ event: 'anything' }).ok).toBe(false);
    expect(methods.introEvent({ event: 'intro_step_viewed', step: 'secret' }).ok).toBe(false);
    expect(methods.introEvent({ event: 'intro_model_saved', advanced: 'yes' }).ok).toBe(false);
    expect(methods.introEvent({ event: 'intro_step_viewed', step: ['welcome'] }).ok).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('records tutorial actions but not plain reads', async () => {
    const { methods, capture } = methodsWith();
    await methods.onboarding({});
    await methods.onboarding({ action: 'skip' });
    expect(capture.mock.calls).toEqual([['tutorial_action', { action: 'skip' }]]);
  });
});
