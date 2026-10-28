import { expect, it } from 'vitest';
import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

function recording(fail: readonly string[] = []) {
  const events: unknown[] = [];
  const call: BridgeCall = async (endpoint, payload) => {
    if (endpoint === 'telemetryEvent') {
      events.push(payload);
      return { ok: true, value: {} };
    }
    if (fail.includes(endpoint))
      return { ok: false, error: { code: 'refused', message: 'refused', details: {} } };
    if (endpoint === 'modelPresetApply') return { ok: true, value: { plan: { revision: 2 } } };
    if (endpoint === 'toolApprovalDecide') return { ok: true, value: { accepted: true } };
    return { ok: true, value: { revision: 1 } };
  };
  return { events, actions: createActions(call, createStore()) };
}

it('records a feature only after the Host accepts it, with the Web Client surface', async () => {
  const { events, actions } = recording();
  await actions.inheritModel('ada', 0);
  await actions.applyModelPreset('ada', 'preset-1');
  await actions.decideToolApproval('dm-ada', 'm1', 'allowed-always-exact');
  await Promise.resolve();
  expect(events).toEqual([
    { event: 'model:plan_update', properties: { via: 'inherit', surface: 'browser' } },
    { event: 'model:plan_update', properties: { via: 'preset', surface: 'browser' } },
    {
      event: 'activity:approval_submit',
      properties: { decision: 'allow_always', surface: 'browser' },
    },
  ]);
});

it('does not record a refused change', async () => {
  const { events, actions } = recording(['modelPlanInherit']);
  await expect(actions.inheritModel('ada', 0)).rejects.toThrow();
  await Promise.resolve();
  expect(events).toEqual([]);
});
