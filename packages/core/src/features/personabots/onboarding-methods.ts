import { createModelRoutingHelpers, routingGroupFailure } from '../models/routing.js';
import {
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { modelFailure } from '../../models/provider-bridge.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import { type HumanContext } from '../../humans/context.js';

import type { OnboardingSnapshot, TutorialAction } from '../../onboarding/service.js';
import { type TelemetryEventName } from '../../telemetry/events.js';
import { DEFAULT_MODEL_PRESET_ID, ModelPresetError, isModelRoute } from '../../models/presets.js';
import { RoutingGroupError } from '../../models/routing-groups.js';
import { groupMemberRoute } from '../../models/catalog.js';
import type { BridgeMethods, BridgeMethodsDeps } from '../../bridge/methods.js';
const TUTORIAL_EVENTS: Record<TutorialAction, TelemetryEventName> = {
  start: 'onboarding:tutorial_start',
  pause: 'onboarding:tutorial_pause',
  skip: 'onboarding:tutorial_skip',
  continue: 'onboarding:tutorial_resume',
  restart: 'onboarding:tutorial_restart',
  finish: 'onboarding:tutorial_complete',
};

export interface OnboardingBridgeMethods {
  onboarding(payload: unknown): Promise<BridgeResult<OnboardingSnapshot>>;
  onboardingModel(
    payload: unknown,
  ): Promise<BridgeResult<{ revision: number; groupRevision?: number }>>;
}

export function createOnboardingBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  isHostOwner: () => boolean,
  modelRouting: ReturnType<typeof createModelRoutingHelpers>,
): OnboardingBridgeMethods {
  const { firstUsableRoute, requireGroupEfforts, requireGroupEngines, requireRoutes } =
    modelRouting;
  return {
    async onboarding(payload) {
      if (!isHostOwner()) {
        return {
          ok: true,
          value: {
            profileId: human.humanId,
            tutorial: 'skipped',
            completed: true,
            preparation: 'ready',
          },
        };
      }
      if (isHostOwner() && human.humanId !== OWNER_HUMAN_CONTEXT.humanId) {
        if (!deps.tob) return unavailable();
        const home = await deps.tob.ensure(human);
        return {
          ok: true,
          value: {
            profileId: human.humanId,
            tutorial: 'skipped',
            completed: true,
            preparation: 'ready',
            defaultBotSlug: home.botSlug,
            channelId: home.channelId,
          },
        };
      }
      if (deps.onboarding === undefined) return unavailable();
      const source = asObject(payload);
      const action = source['action'];
      if (
        action !== undefined &&
        !['start', 'pause', 'skip', 'continue', 'restart', 'finish'].includes(String(action))
      )
        return invalidInput('Invalid tutorial action');
      try {
        const value = await deps.onboarding.enter(
          asSlug(payload),
          action as TutorialAction | undefined,
        );
        if (action !== undefined)
          deps.telemetry?.capture?.(TUTORIAL_EVENTS[action as TutorialAction]);
        const newsAvailable =
          (await deps
            .onboardingNews?.(asSlug(payload) ?? value.defaultBotSlug)
            .catch(() => false)) ?? false;
        return { ok: true, value: { ...value, newsAvailable } };
      } catch (error) {
        return {
          ok: false,
          error: {
            code: error instanceof Error ? error.message : 'onboarding-unavailable',
            message: error instanceof Error ? error.message : 'Onboarding unavailable',
          },
        };
      }
    },
    async onboardingModel(this: Pick<BridgeMethods, 'modelPlanInherit'>, payload) {
      if (deps.modelCatalog === undefined) return unavailable();
      const source = asObject(payload);
      const slug = asSlug(payload);
      const groupId = source['groupId'];
      const groupEffort = source['groupEffort'];
      const revision = source['expectedRevision'];
      const defaultRevision = source['expectedDefaultRevision'];
      const defaultGroupRevision = source['expectedDefaultGroupRevision'];
      const defaultPreset =
        source['globalDefault'] === true
          ? deps.modelPresets?.get(DEFAULT_MODEL_PRESET_ID)
          : undefined;
      if (
        defaultGroupRevision !== undefined &&
        (!Number.isSafeInteger(defaultGroupRevision) ||
          Number(defaultGroupRevision) < 0 ||
          source['globalDefault'] !== true)
      )
        return invalidInput('A default Routing Group revision needs global scope');
      if (
        groupId !== undefined &&
        (typeof groupId !== 'string' ||
          !groupId.trim() ||
          source['route'] !== undefined ||
          source['globalDefault'] !== true ||
          deps.routingGroups === undefined)
      )
        return invalidInput('A default Routing Group replaces the route and needs global scope');
      if (
        groupEffort !== undefined &&
        (typeof groupEffort !== 'string' || !groupEffort.trim() || typeof groupId !== 'string')
      )
        return invalidInput('A default Routing Group effort needs a nonempty effort and a group');
      const effort = typeof groupEffort === 'string' ? groupEffort.trim() : undefined;
      let route = source['route'];
      if (typeof groupId === 'string') {
        try {
          if (deps.routingGroups?.get(groupId) === undefined)
            throw new RoutingGroupError('not-found', `Routing Group ${groupId} does not exist`);
          requireGroupEngines(groupId);
          if (effort !== undefined) await requireGroupEfforts(groupId, [effort]);
          const first = await firstUsableRoute(deps.routingGroups.routes(groupId));
          route =
            effort === undefined
              ? first
              : groupMemberRoute(first, effort, await deps.modelCatalog.list());
        } catch (error) {
          return routingGroupFailure(error);
        }
      }
      if (
        defaultRevision !== undefined &&
        (!Number.isSafeInteger(defaultRevision) ||
          Number(defaultRevision) < 0 ||
          source['globalDefault'] !== true ||
          slug !== undefined)
      )
        return invalidInput(
          'A nonnegative Default preset revision requires global scope without a Bot target',
        );
      if (
        !isModelRoute(route) ||
        typeof source['globalDefault'] !== 'boolean' ||
        !Number.isSafeInteger(revision)
      )
        return invalidInput('Model, scope and expected revision required');
      const bot = slug === undefined ? undefined : deps.registry.get(slug);
      if (slug !== undefined && bot === undefined) return unknownBot(slug);
      if ((bot?.modelPlan?.revision ?? bot?.modelPlanRevision ?? 0) !== revision)
        return invalidInput('Bot model changed; reopen before saving');
      try {
        if (slug !== undefined && !source['globalDefault']) requireRoutes(slug, [route]);
        await deps.modelCatalog.validate(route);
        if (typeof groupId === 'string') requireGroupEngines(groupId);
        if (source['globalDefault']) {
          const store = deps.modelPresets;
          if (store === undefined || defaultPreset === undefined) return unavailable();
          const expectedRevision =
            defaultRevision ?? defaultGroupRevision ?? defaultPreset.revision;
          if (defaultGroupRevision !== undefined && defaultGroupRevision !== expectedRevision)
            return modelFailure(
              new ModelPresetError(
                'stale-setting',
                'Default preset changed; read it again before saving',
              ),
            );
          const saved = store.setDefaultMain({
            expectedRevision: Number(expectedRevision),
            route,
            preserveSub: true,
            ...(typeof groupId === 'string' ? { groupId } : {}),
            ...(effort === undefined ? {} : { effort }),
          });
          if (slug === undefined)
            return { ok: true, value: { revision: saved.revision, groupRevision: saved.revision } };
          return this.modelPlanInherit({ slug, expectedRevision: revision });
        }
        if (slug === undefined) return invalidInput('Choose a Bot for an individual model');
        requireRoutes(slug, [route]);
        const result = deps.registry.setModelPlan(
          slug,
          {
            orchestrator: route,
            assignmentDefault: route,
            assignmentModels: [
              {
                provider: route.provider,
                model: route.model,
                allowedEfforts: [route.reasoningEffort ?? ''],
                defaultEffort: route.reasoningEffort ?? '',
              },
            ],
          },
          revision as number,
        );
        if (!result.ok) return invalidInput('Bot model changed; reopen before saving');
        return {
          ok: true,
          value: { revision: result.record.modelPlan!.revision },
        };
      } catch (error) {
        if (error instanceof RoutingGroupError) return routingGroupFailure(error);
        return modelFailure(error);
      }
    },
  };
}
