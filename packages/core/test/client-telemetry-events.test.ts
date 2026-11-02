import { Context } from '@deepseek-ai/cordis';
import { describe, expect, it, vi } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { registerBridge } from '../src/bridge/rpc.js';

function methodsWith(capture = vi.fn(), mark = vi.fn()) {
  const onboarding = {
    enter: vi.fn(async () => ({ profileId: 'p', tutorial: 'active', completed: false })),
  };
  const methods = createBridgeMethods({
    telemetry: { status: vi.fn(), setPreference: vi.fn(), capture },
    activeDay: { mark },
    onboarding,
  } as unknown as Parameters<typeof createBridgeMethods>[0]);
  return { methods, capture, mark };
}

describe('client telemetry events', () => {
  it('captures registered client events with only their known properties', () => {
    const { methods, capture } = methodsWith();
    expect(
      methods.telemetryEvent({
        event: 'onboarding:intro_view',
        properties: { surface: 'browser', extra: 'drop me' },
      }).ok,
    ).toBe(true);
    expect(
      methods.telemetryEvent({
        event: 'onboarding:intro_dismiss',
        properties: { step: 'model', via: 'skip' },
      }).ok,
    ).toBe(true);
    expect(
      methods.telemetryEvent({ event: 'onboarding:model_save', properties: { is_advanced: true } })
        .ok,
    ).toBe(true);
    expect(capture.mock.calls).toEqual([
      ['onboarding:intro_view', { surface: 'browser' }],
      ['onboarding:intro_dismiss', { step: 'model', via: 'skip' }],
      ['onboarding:model_save', { is_advanced: true }],
    ]);
  });

  it('captures Marketplace section and digest events with their entry point', () => {
    const { methods, capture } = methodsWith();
    expect(methods.telemetryEvent({ event: 'marketplace:section_view' }).ok).toBe(true);
    expect(
      methods.telemetryEvent({
        event: 'marketplace:bot_open',
        properties: { entry: 'rising', step: 'install' },
      }).ok,
    ).toBe(true);
    expect(
      methods.telemetryEvent({ event: 'marketplace:digest_open', properties: { entry: 'archive' } })
        .ok,
    ).toBe(true);
    expect(
      methods.telemetryEvent({
        event: 'marketplace:bot_open',
        properties: { entry: 'R_kgDO', step: 'detail' },
      }).ok,
    ).toBe(false);
    expect(capture.mock.calls).toEqual([
      ['marketplace:section_view', {}],
      ['marketplace:bot_open', { entry: 'rising', step: 'install' }],
      ['marketplace:digest_open', { entry: 'archive' }],
    ]);
  });

  it('rejects unknown events, Host-only events and invalid values without capturing', () => {
    const { methods, capture } = methodsWith();
    expect(methods.telemetryEvent({ event: 'anything' }).ok).toBe(false);
    expect(methods.telemetryEvent({ event: 'intro_shown' }).ok).toBe(false);
    expect(methods.telemetryEvent({ event: 'app:host_start' }).ok).toBe(false);
    expect(
      methods.telemetryEvent({
        event: 'onboarding:intro_step_view',
        properties: { step: 'secret' },
      }).ok,
    ).toBe(false);
    expect(
      methods.telemetryEvent({ event: 'onboarding:model_save', properties: { is_advanced: 'yes' } })
        .ok,
    ).toBe(false);
    expect(capture).not.toHaveBeenCalled();
  });

  it('marks the day active when the Web Client enters Bot mode', () => {
    const { methods, capture, mark } = methodsWith();
    expect(
      methods.telemetryEvent({
        event: 'app:bot_mode_enter',
        properties: { surface: 'desktop_app' },
      }).ok,
    ).toBe(true);
    expect(capture).toHaveBeenCalledWith('app:bot_mode_enter', { surface: 'desktop_app' });
    expect(mark).toHaveBeenCalledWith('bot_mode_enter', 'desktop_app');
  });

  it('records each tutorial action as its own event but not plain reads', async () => {
    const { methods, capture } = methodsWith();
    await methods.onboarding({});
    await methods.onboarding({ action: 'skip' });
    await methods.onboarding({ action: 'continue' });
    expect(capture.mock.calls).toEqual([
      ['onboarding:tutorial_skip'],
      ['onboarding:tutorial_resume'],
    ]);
  });

  it('accepts the Web Client wire shape at the Gateway signature', () => {
    const { methods, capture } = methodsWith();
    const service = registerBridge(new Context(), methods);
    const source = Function.prototype.toString.call(service.telemetryEvent);
    expect(source.slice(source.indexOf('(') + 1, source.indexOf(')')).replace(/\s*=.*$/u, '')).toBe(
      'event, properties',
    );
    service.telemetryEvent('marketplace:bot_open', { entry: 'hot', step: 'detail' });
    expect(capture).toHaveBeenCalledWith('marketplace:bot_open', { entry: 'hot', step: 'detail' });
  });
});
