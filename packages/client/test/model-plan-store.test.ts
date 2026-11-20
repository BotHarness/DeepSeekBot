import { expect, it, vi } from 'vitest';
import type { ModelPlanView } from '../src/client/bridge.js';
import {
  invalidateInheritedModelPlans,
  invalidateModelPlan,
  modelPlanOf,
  rememberModelPlan,
  subscribeModelPlans,
} from '../src/client/model-plan-store.js';

function plan(model: string, revision: number): ModelPlanView {
  return {
    revision,
    orchestrator: { provider: 'provider', model },
    sourcePresetId: '',
    sourcePresetName: '',
    appliedAt: '',
  };
}

it('keeps same-name Bot plans, revision ordering and invalidation within their Host actions', () => {
  const localActions = {};
  const remoteActions = {};
  const localChanged = vi.fn();
  const remoteChanged = vi.fn();
  const stopLocal = subscribeModelPlans(localChanged, localActions);
  const stopRemote = subscribeModelPlans(remoteChanged, remoteActions);
  try {
    rememberModelPlan('tob', plan('remote-model', 100), remoteActions);
    expect(remoteChanged).toHaveBeenCalledOnce();
    expect(localChanged).not.toHaveBeenCalled();
    expect(modelPlanOf('tob', localActions)).toBeUndefined();
    rememberModelPlan('tob', plan('local-model', 1), localActions);
    expect(modelPlanOf('tob', localActions)?.orchestrator.model).toBe('local-model');
    expect(modelPlanOf('tob', remoteActions)?.orchestrator.model).toBe('remote-model');
    rememberModelPlan('tob', plan('stale-remote', 99), remoteActions);
    expect(modelPlanOf('tob', remoteActions)?.revision).toBe(100);
    invalidateModelPlan('tob', remoteActions);
    expect(modelPlanOf('tob', remoteActions)).toBeUndefined();
    expect(modelPlanOf('tob', localActions)?.revision).toBe(1);
    rememberModelPlan('inherited', undefined, localActions);
    rememberModelPlan('inherited', undefined, remoteActions);
    invalidateInheritedModelPlans(remoteActions);
    expect(modelPlanOf('inherited', remoteActions)).toBeUndefined();
    expect(modelPlanOf('inherited', localActions)).toBeNull();
    expect(modelPlanOf('tob', localActions)?.revision).toBe(1);
    stopRemote();
    remoteChanged.mockClear();
    rememberModelPlan('tob', plan('new-remote', 101), remoteActions);
    expect(remoteChanged).not.toHaveBeenCalled();
  } finally {
    stopLocal();
    stopRemote();
  }
});
