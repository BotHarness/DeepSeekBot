import {
  asObject,
  invalidInput,
  unavailable,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import {
  effectivePresetSub,
  isPresetSub,
  presetSubProjection,
  storedPresetSub,
  type PresetSub,
} from '../../models/preset-sub.js';
import { ModelPresetError, type ModelPreset } from '../../models/presets.js';
import { modelFailure } from '../../models/provider-bridge.js';
import { RoutingGroupError } from '../../models/routing-groups.js';
import { TeamError } from '../../team/error.js';
import type { ModelsBridgeDeps } from './deps.js';
import { routingGroupFailure, type createModelRoutingHelpers } from './routing.js';

export interface ModelPresetSubView {
  id: string;
  revision: number;
  sub: PresetSub;
  legacyOpen?: true;
}

export interface PresetSubBridgeMethods {
  modelPresetSub(payload: unknown): BridgeResult<ModelPresetSubView>;
  modelPresetSubSet(payload: unknown): Promise<BridgeResult<ModelPresetSubView>>;
}

export function createPresetSubMethods(
  human: HumanContext,
  deps: ModelsBridgeDeps & Pick<BridgeMethodsDeps, 'team'>,
  isHostOwner: () => boolean,
  {
    groupRoutes,
    requireGroupEngines,
    requireEngineChoices,
    checkPresetEngines,
    assertEngineAccounts,
    validateGroupOptions,
    validateAssignmentCatalog,
  }: ReturnType<typeof createModelRoutingHelpers>,
): PresetSubBridgeMethods {
  const requirePresetSub = (preset: ModelPreset, sub: PresetSub): void => {
    const choices =
      sub.default === null ? effectivePresetSub({ ...preset, sub }).choices : sub.choices;
    for (const choice of choices) {
      if (choice.kind === 'model') deps.team?.roles.requireModel(human, choice);
      else if (choice.kind === 'engine') requireEngineChoices([choice]);
      else {
        requireGroupEngines(choice.group);
        for (const route of groupRoutes(choice.group)) deps.team?.roles.requireModel(human, route);
      }
    }
  };
  const subView = (preset: ModelPreset): ModelPresetSubView => ({
    id: preset.id,
    revision: preset.revision,
    sub: storedPresetSub(preset),
    ...(preset.openAssignmentModels === true ? { legacyOpen: true } : {}),
  });
  return {
    modelPresetSub(payload) {
      const store = deps.modelPresets;
      if (store === undefined) return unavailable();
      const id = asObject(payload)['id'];
      if (typeof id !== 'string') return invalidInput('A Model Preset id is required');
      try {
        if (!isHostOwner()) {
          if (deps.team === undefined)
            throw new TeamError('permission-required', undefined, { permission: 'models.use' });
          deps.team.roles.require(human, 'models.use');
        }
        const preset = store.get(id);
        if (preset === undefined) return invalidInput('Model Preset was not found');
        const view = subView(preset);
        if (!isHostOwner()) requirePresetSub(preset, view.sub);
        return { ok: true, value: view };
      } catch (error) {
        if (error instanceof RoutingGroupError) return routingGroupFailure(error);
        return modelFailure(error);
      }
    },
    async modelPresetSubSet(payload) {
      const store = deps.modelPresets;
      if (store === undefined || deps.modelCatalog === undefined) return unavailable();
      const { id, expectedRevision, sub } = asObject(payload);
      if (
        typeof id !== 'string' ||
        typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        !isPresetSub(sub)
      )
        return invalidInput(
          'A Model Preset id, revision and valid sub choices and default are required',
        );
      try {
        if (human.caller === 'bot' || (!isHostOwner() && deps.team === undefined))
          throw new TeamError('permission-required', undefined, {
            permission: 'models.configure',
          });
        if (!isHostOwner()) deps.team?.roles.require(human, 'models.configure');
        const preset = store.get(id);
        if (preset === undefined) return invalidInput('Model Preset was not found');
        if (preset.revision !== expectedRevision)
          throw new ModelPresetError(
            'stale-setting',
            'Model Preset changed; read it again before saving',
          );
        if (!isHostOwner()) requirePresetSub(preset, subView(preset).sub);
        requirePresetSub(preset, sub);
        const engineChoices = sub.choices.filter((choice) => choice.kind === 'engine');
        await checkPresetEngines({ sub });
        const projection = presetSubProjection(sub, preset.orchestrator);
        await validateGroupOptions(projection.assignmentGroupOptions);
        if (projection.assignmentModels !== undefined)
          await validateAssignmentCatalog(
            projection.assignmentDefault,
            projection.assignmentModels,
          );
        if (!isHostOwner()) deps.team?.roles.require(human, 'models.configure');
        if (!isHostOwner()) requirePresetSub(preset, subView(preset).sub);
        requirePresetSub(preset, sub);
        assertEngineAccounts(engineChoices);
        return { ok: true, value: subView(store.setSub(id, expectedRevision, sub)) };
      } catch (error) {
        if (error instanceof RoutingGroupError) return routingGroupFailure(error);
        return modelFailure(error);
      }
    },
  };
}
