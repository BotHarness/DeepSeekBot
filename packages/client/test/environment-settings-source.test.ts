import { afterEach, describe, expect, it } from 'vitest';
import type { BridgeCall } from '../src/client/bridge.js';
import {
  localEnvironmentSettings,
  mountLocalEnvironmentSettings,
} from '../src/client/environment-settings-source.js';
import { modelSettingsResource, setModelRoute } from '../../../apps/mobile/src/host/model-settings.js';

const releases: (() => void)[] = [];
afterEach(() => { for (const release of releases.splice(0)) release(); });

describe('Environment settings local owner adapter', () => {
  it('uses the native owner and its observed revision without opening a remote connection', async () => {
    const calls: { method: string; args: Record<string, unknown> }[] = [];
    const route = { provider: 'deepseek', model: 'local' };
    const call: BridgeCall = async (method, args) => {
      calls.push({ method, args });
      return { ok: true, value: method === 'modelCatalog'
        ? { models: [{ ...route, providerName: 'DeepSeek', modelName: 'Local' }], default: route, defaultRevision: 7 }
        : { presets: [] } };
    };
    releases.push(mountLocalEnvironmentSettings(call, () => {}));
    const source = localEnvironmentSettings();
    expect(source).toBeDefined();
    if (source === undefined) return;
    const state = await modelSettingsResource(source.models, { kind: 'global' }).refresh();
    await setModelRoute(source.models, { kind: 'global' }, state, 'orchestrator', route);
    expect(calls.at(-1)).toEqual({ method: 'onboardingModel', args: {
      expectedRevision: 0, expectedDefaultRevision: 7, route, globalDefault: true,
    } });
  });

  it('preserves coded owner refusals and never falls back to another source', async () => {
    const call: BridgeCall = async () => ({ ok: false, error: { code: 'not-supported', message: 'Unavailable' } });
    releases.push(mountLocalEnvironmentSettings(call, () => {}));
    await expect(localEnvironmentSettings()?.models.call('modelPresetUpdate', { id: 'remote' }))
      .rejects.toMatchObject({ code: 'not-supported', message: 'Unavailable' });
  });

  it('releases only its own mounted adapter', () => {
    const call: BridgeCall = async () => ({ ok: true, value: {} });
    const first = mountLocalEnvironmentSettings(call, () => {});
    const second = mountLocalEnvironmentSettings(call, () => {});
    releases.push(first, second);
    const current = localEnvironmentSettings();
    first();
    expect(localEnvironmentSettings()).toBe(current);
    second();
    expect(localEnvironmentSettings()).toBeUndefined();
  });
});
