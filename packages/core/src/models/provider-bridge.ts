import { invalidInput } from '../bridge/method-utils.js';
export { invalidInput } from '../bridge/method-utils.js';
import type {
  ModelProviderRemoval,
  ModelProviderSave,
  ModelProvidersView,
} from '@botharness/host-client/model-providers';
import type { BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import { EngineRefusal } from '../engines/engine-session.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { ModelPresetError } from './presets.js';
import { TeamError } from '../team/error.js';
import {
  addModelProviderInput,
  editModelProviderInput,
  removeModelProviderInput,
  ModelProviderError,
  type ModelProviders,
} from './providers.js';

export interface ModelProviderBridgeMethods {
  modelProviders(payload: unknown): Promise<BridgeResult<ModelProvidersView>>;
  modelProviderAdd(payload: unknown): Promise<BridgeResult<ModelProviderSave>>;
  modelProviderEdit(payload: unknown): Promise<BridgeResult<ModelProviderSave>>;
  modelProviderRemove(payload: unknown): Promise<BridgeResult<ModelProviderRemoval>>;
}

export function modelFailure(error: unknown): BridgeResult<never> {
  if (error instanceof ModelPresetError)
    return { ok: false, error: { code: error.code, message: error.message } };
  if (error instanceof EngineRefusal)
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.references === undefined
          ? {}
          : { details: { references: [...error.references] } }),
      },
    };
  if (error instanceof TeamError)
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.code,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  return invalidInput(error instanceof Error ? error.message : String(error));
}

export function canManageModelSources(
  human: HumanContext,
  team: BridgeMethodsDeps['team'],
): boolean {
  return (
    human.caller !== 'bot' &&
    (team === undefined
      ? human.humanId === OWNER_HUMAN_CONTEXT.humanId
      : team.isOwner(human) || team.roles.permissions(human).includes('modelSources.manage'))
  );
}

export function requireModelSources(human: HumanContext, team: BridgeMethodsDeps['team']): void {
  if (canManageModelSources(human, team)) return;
  throw new TeamError('permission-required', undefined, { permission: 'modelSources.manage' });
}

export function createModelProviderBridge(
  human: HumanContext,
  deps: Pick<BridgeMethodsDeps, 'team' | 'modelProviders'>,
): ModelProviderBridgeMethods {
  const authorize = () => requireModelSources(human, deps.team);
  async function modelProviderOperation<T>(
    run: (providers: ModelProviders) => Promise<T>,
  ): Promise<BridgeResult<T>> {
    try {
      authorize();
      if (!deps.modelProviders) throw new ModelProviderError('provider-unavailable');
      return { ok: true, value: await run(deps.modelProviders) };
    } catch (error) {
      if (error instanceof TeamError) return modelFailure(error);
      const code = error instanceof ModelProviderError ? error.code : 'provider-write-failed';
      return {
        ok: false,
        error: {
          code,
          message: code,
          ...(error instanceof ModelProviderError && error.uses.length > 0
            ? { details: { references: error.uses } }
            : {}),
        },
      };
    }
  }
  return {
    modelProviders() {
      return modelProviderOperation((providers) => providers.list());
    },
    modelProviderAdd(payload) {
      return modelProviderOperation((providers) => {
        const parsed = addModelProviderInput.safeParse(payload);
        return parsed.success
          ? providers.add(parsed.data, authorize)
          : Promise.reject(new ModelProviderError('invalid-input'));
      });
    },
    modelProviderEdit(payload) {
      return modelProviderOperation((providers) => {
        const parsed = editModelProviderInput.safeParse(payload);
        return parsed.success
          ? providers.edit(parsed.data, authorize)
          : Promise.reject(new ModelProviderError('invalid-input'));
      });
    },
    modelProviderRemove(payload) {
      return modelProviderOperation((providers) => {
        const parsed = removeModelProviderInput.safeParse(payload);
        return parsed.success
          ? providers.remove(parsed.data, authorize)
          : Promise.reject(new ModelProviderError('invalid-input'));
      });
    },
  };
}
