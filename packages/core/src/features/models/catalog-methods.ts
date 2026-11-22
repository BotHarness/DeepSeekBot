import { asObject, invalidInput, unavailable } from '../../bridge/method-utils.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import { modelFavorite } from '../../models/favorites.js';
import { DEFAULT_MODEL_PRESET_ID, type ModelRoute } from '../../models/presets.js';
import { modelFailure } from '../../models/provider-bridge.js';
import { allowsEngineAccount, allowsModel } from '../../team/permissions.js';
import type { ModelsBridgeDeps } from './deps.js';
import type { ModelsBridgeMethods } from './methods.js';
import { routeKey, type createModelRoutingHelpers } from './routing.js';

export function createModelCatalogMethods(
  human: HumanContext,
  deps: ModelsBridgeDeps & Pick<BridgeMethodsDeps, 'team'>,
  isHostOwner: () => boolean,
  {
    catalogRests,
    catalogEntry,
    catalogGroups,
    favoritesOf,
  }: ReturnType<typeof createModelRoutingHelpers>,
): Pick<ModelsBridgeMethods, 'modelCatalog' | 'modelFavoriteSet'> {
  return {
    async modelCatalog(payload) {
      if (deps.modelCatalog === undefined) return unavailable();
      try {
        const models = await deps.modelCatalog.list();
        const rests = catalogRests();
        const owner = isHostOwner();
        const allowed = !owner ? deps.team?.roles.modelsAllowed(human) : undefined;
        const isAllowed = (route: ModelRoute) =>
          allowed === undefined || allowsModel(allowed, route);
        const credentialGated = owner
          ? new Set<string>()
          : new Set(models.filter((route) => route.credential !== undefined).map(routeKey));
        const isListed = (route: ModelRoute) =>
          isAllowed(route) && !credentialGated.has(routeKey(route));
        const defaultPreset = deps.modelPresets?.get(DEFAULT_MODEL_PRESET_ID);
        const defaultRoute =
          defaultPreset?.orchestrator ??
          deps.defaultModel?.currentSelection() ??
          deps.modelCatalog.defaultRoute?.();
        const defaultRevision = defaultPreset?.revision;
        const defaultGroupId = defaultPreset?.orchestratorGroupId;
        const defaultGroupEffort = defaultPreset?.orchestratorGroupEffort;
        const canUseEngine = (id: string) =>
          deps.localSubscriptionEngines !== false &&
          (owner || (allowed !== undefined && allowsEngineAccount(allowed, id)));
        const groups = catalogGroups(rests, isListed, canUseEngine);
        const defaultGroupVisible = groups.groups?.some((group) => group.id === defaultGroupId);
        return {
          ok: true,
          value: {
            models: models.filter(isListed).map((entry) => {
              if (owner) return catalogEntry(entry, rests);
              const { credential: _credential, ...route } = entry;
              return catalogEntry(route, rests);
            }),
            ...(defaultRoute === undefined ? {} : { default: defaultRoute }),
            ...(defaultRevision === undefined ? {} : { defaultRevision }),
            ...(!defaultGroupVisible || defaultGroupId === undefined ? {} : { defaultGroupId }),
            ...(!defaultGroupVisible || defaultGroupEffort === undefined
              ? {}
              : { defaultGroupEffort }),
            ...(defaultRevision === undefined ? {} : { defaultGroupRevision: defaultRevision }),
            ...favoritesOf(),
            ...groups,
            ...(asObject(payload)['includeRoutingGroupEngines'] === true &&
            (owner || deps.team?.roles.permissions(human).includes('models.configure')) &&
            deps.routingGroupEngineOptions !== undefined
              ? { routingGroupEngines: await deps.routingGroupEngineOptions(canUseEngine) }
              : {}),
          },
        };
      } catch (error) {
        return !deps.team || deps.team.isOwner(human)
          ? modelFailure(error)
          : invalidInput('model-unavailable');
      }
    },
    modelFavoriteSet(payload) {
      if (deps.modelFavorites === undefined) return unavailable();
      const input = asObject(payload);
      const favorite = modelFavorite(input['choice']);
      if (favorite === undefined || typeof input['favorite'] !== 'boolean')
        return invalidInput(
          "modelFavoriteSet needs {choice: {kind: 'model', provider, model} | {kind: 'group', id} | {kind: 'preset', id}, favorite: boolean}",
        );
      try {
        return {
          ok: true,
          value: {
            favorites: deps.modelFavorites.set(human.humanId, favorite, input['favorite']),
          },
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
  };
}
