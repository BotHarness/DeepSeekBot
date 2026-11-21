import {
  routingGroupInput,
  presetGroupsInput,
  assignmentGroupOptionsInput,
  presetEnginesInput,
} from './inputs.js';
import {
  asObject,
  asSlug,
  invalidInput,
  unavailable,
  unknownBot,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { sessionTarget } from '../../bridge/session-target.js';
import { EngineRefusal } from '../../engines/engine-session.js';
import { modelFailure } from '../../models/provider-bridge.js';
import { type RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import { allowsEngineAccount, allowsModel } from '../../team/permissions.js';
import { TeamError } from '../../team/error.js';
import { ownsBot } from '../../team/bot-access.js';
import { type HumanContext } from '../../humans/context.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import {
  isAssignmentModelOption,
  hasPresetGroups,
  hasPresetEngines,
  isModelRoute,
  type ModelRoute,
  type ModelPresetUsage,
  type ModelPreset,
  type PersonaBotModelPlan,
} from '../../models/presets.js';
import { modelFavorite, type ModelFavorite } from '../../models/favorites.js';
import { RoutingGroupError, type RoutingGroup } from '../../models/routing-groups.js';
import type { ModelCatalogEntry } from '../../models/catalog.js';
import type { ModelPlanState } from '../../models/readiness.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { ModelsBridgeDeps } from './deps.js';
import {
  routeKey,
  routingGroupFailure,
  type ModelCatalogGroup,
  type createModelRoutingHelpers,
} from './routing.js';
export interface ModelsBridgeMethods {
  modelPlanInherit(payload: unknown): BridgeResult<{ revision: number }>;
  modelCatalog(payload: unknown): Promise<
    BridgeResult<{
      models: ModelCatalogEntry[];
      default?: ModelRoute;
      defaultRevision?: number;
      defaultGroupId?: string;
      favorites?: ModelFavorite[];
      groups?: ModelCatalogGroup[];
      routingGroupEngines?: RoutingGroupEngineOptions[];
    }>
  >;
  modelFavoriteSet(payload: unknown): BridgeResult<{ favorites: ModelFavorite[] }>;
  modelPresets(
    payload: unknown,
  ): BridgeResult<{ presets: ModelPreset[]; usage?: ModelPresetUsage[] }>;
  modelPresetDelete(payload: unknown): BridgeResult<{ id: string }>;
  modelPresetCreate(payload: unknown): Promise<BridgeResult<{ preset: ModelPreset }>>;
  modelPresetUpdate(payload: unknown): Promise<BridgeResult<{ preset: ModelPreset }>>;
  modelPresetApply(payload: unknown): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
  modelGroups(payload: unknown): BridgeResult<{
    groups: RoutingGroup[];
    rests: import('../../models/route-rest.js').RestingRoute[];
  }>;
  modelGroup(payload: unknown): BridgeResult<{ group: RoutingGroup; routes: ModelRoute[] }>;
  modelGroupCreate(payload: unknown): Promise<BridgeResult<{ group: RoutingGroup }>>;
  modelGroupUpdate(payload: unknown): Promise<BridgeResult<{ group: RoutingGroup }>>;
  modelGroupDelete(payload: unknown): BridgeResult<{ group: RoutingGroup }>;
  modelPlan(payload: unknown): Promise<BridgeResult<ModelPlanState>>;
  modelPlanCustomize(
    payload: unknown,
    beforeCommit?: () => void,
  ): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
  modelPlanAssignmentsSet(payload: unknown): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
  modelPlanSet(payload: unknown): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
}

const presetClientOutdated: BridgeResult<never> = {
  ok: false,
  error: {
    code: 'client-update-required',
    message: 'This Model Preset uses Routing Groups; update the client before editing it',
  },
};

export function createModelsBridgeMethods(
  human: HumanContext,
  deps: ModelsBridgeDeps &
    Pick<BridgeMethodsDeps, 'registry' | 'runtime' | 'team' | 'describeEngineSession'>,
  globalRegistry: PersonaBotRegistry,
  isHostOwner: () => boolean,
  requireOwnedBot: (slug: string) => void,
  routing: ReturnType<typeof createModelRoutingHelpers>,
) {
  const {
    catalogRests,
    catalogEntry,
    catalogGroups,
    favoritesOf,
    groupEngineChoices,
    memberEngineChoices,
    engineChoiceFilter,
    requireEngineChoices,
    requireGroupEngines,
    validateGroupMembers,
    assertEngineAccounts,
    firstUsableRoute,
    requireRoutes,
    groupRoutes,
    presetEngineChoices,
    checkPresetEngines,
    presetGroupIds,
    presetGroupRoutes,
    requireGroupEfforts,
    validateGroupOptions,
    validateGroupEffort,
    presetOrchestrator,
    validateAssignmentCatalog,
  } = routing;
  return {
    modelInheritance: {
      modelPlanInherit(payload) {
        const slug = asSlug(payload);
        const revision = asObject(payload)['expectedRevision'];
        if (slug === undefined || !Number.isSafeInteger(revision))
          return invalidInput('Bot and expected revision required');
        try {
          const route =
            deps.defaultModel?.currentSelection() ?? deps.modelCatalog?.defaultRoute?.();
          requireOwnedBot(slug);
          if (route) requireRoutes(slug, [route]);
        } catch (error) {
          return modelFailure(error);
        }
        const result = deps.registry.inheritModel(slug, revision as number);
        if (!result.ok) return invalidInput('Bot model changed; reopen before saving');
        return {
          ok: true,
          value: { revision: result.record.modelPlanRevision ?? 0 },
        };
      },
    } satisfies Pick<ModelsBridgeMethods, 'modelPlanInherit'>,
    modelSettings: {
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
          const defaultRoute =
            deps.defaultModel?.currentSelection() ?? deps.modelCatalog.defaultRoute?.();
          const defaultRevision = deps
            .defaultModelSettings?.()
            ?.describe({ redactSecrets: true })
            .find((entry) => entry.ns === 'agent-default-model')?.revision;
          const defaultGroup = deps.routingGroups?.defaultGroup();
          const canUseEngine = (id: string) =>
            deps.localSubscriptionEngines !== false &&
            (owner || (allowed !== undefined && allowsEngineAccount(allowed, id)));
          const groups = catalogGroups(rests, isListed, canUseEngine);
          const defaultGroupVisible = groups.groups?.some(
            (group) => group.id === defaultGroup?.groupId,
          );
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
              ...(!defaultGroupVisible || defaultGroup?.groupId === undefined
                ? {}
                : { defaultGroupId: defaultGroup.groupId }),
              ...(!defaultGroupVisible || defaultGroup?.effort === undefined
                ? {}
                : { defaultGroupEffort: defaultGroup.effort }),
              ...(defaultGroup === undefined
                ? {}
                : { defaultGroupRevision: defaultGroup.revision }),
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
      modelPresets(payload) {
        if (deps.modelPresets === undefined) return unavailable();
        const owner = isHostOwner();
        const engineAllowed = engineChoiceFilter();
        const presets = deps.modelPresets.list().filter((preset) => {
          if (owner) return true;
          try {
            return [
              ...presetEngineChoices(preset),
              ...presetGroupIds(preset).flatMap(groupEngineChoices),
            ].every(engineAllowed);
          } catch {
            return false;
          }
        });
        if (asObject(payload)['includeUsage'] !== true) return { ok: true, value: { presets } };
        const entries = new Map<string, ModelPresetUsage>(
          presets.map(({ id }) => [id, { presetId: id, count: 0, botNames: [] }]),
        );
        if (entries.size === 0) return { ok: true, value: { presets, usage: [] } };
        const canSeeAllBots =
          isHostOwner() || deps.team?.roles.permissions(human).includes('bots.manageAll');
        for (const bot of globalRegistry.list()) {
          const id = bot.modelPlan?.sourcePresetId;
          const usage = id === undefined ? undefined : entries.get(id);
          if (usage === undefined) continue;
          usage.count += 1;
          if (canSeeAllBots || ownsBot(human, bot) || deps.team?.bots.canReach(human, bot.slug))
            usage.botNames.push(bot.displayName);
        }
        return { ok: true, value: { presets, usage: [...entries.values()] } };
      },
      modelPresetDelete(payload) {
        const store = deps.modelPresets;
        if (store === undefined) return unavailable();
        const { id, expectedRevision, confirmed } = asObject(payload);
        if (confirmed !== true)
          return {
            ok: false,
            error: { code: 'confirmation-required', message: 'Confirm the Model Preset deletion.' },
          };
        if (
          typeof id !== 'string' ||
          id.trim() === '' ||
          typeof expectedRevision !== 'number' ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 1
        )
          return invalidInput('A Model Preset id and expected revision are required');
        try {
          return store.delete(id, expectedRevision)
            ? { ok: true, value: { id } }
            : {
                ok: false,
                error: {
                  code: 'stale-setting',
                  message: 'The Model Preset changed; reload the list.',
                },
              };
        } catch (error) {
          return modelFailure(error);
        }
      },
      async modelPresetCreate(payload) {
        if (deps.modelPresets === undefined || deps.modelCatalog === undefined)
          return unavailable();
        const source = asObject(payload);
        const name = source['name'];
        const assignmentDefault = source['assignmentDefault'];
        const assignmentModels = source['assignmentModels'];
        const openAssignmentModels = source['openAssignmentModels'];
        const groupInput = presetGroupsInput(source);
        if ('invalid' in groupInput) return invalidInput('Model Preset Routing Groups are invalid');
        const groups = groupInput.given ? groupInput.groups : undefined;
        if (
          groups?.orchestratorGroupId === undefined
            ? !isModelRoute(source['orchestrator'])
            : source['orchestrator'] !== undefined
        )
          return invalidInput(
            'Choose either an Orchestrator route or an Orchestrator Routing Group',
          );
        if (
          typeof name !== 'string' ||
          (openAssignmentModels !== undefined && typeof openAssignmentModels !== 'boolean') ||
          !isModelRoute(assignmentDefault) ||
          (assignmentModels !== undefined &&
            (!Array.isArray(assignmentModels) || !assignmentModels.every(isAssignmentModelOption)))
        )
          return invalidInput('A name and valid Orchestrator and Assignment routes are required');
        try {
          const engines = presetEnginesInput(source);
          await checkPresetEngines(engines);
          if (groups !== undefined) presetGroupRoutes(groups);
          await validateGroupOptions(groups?.assignmentGroupOptions);
          await validateGroupEffort(groups);
          const orchestrator = (await presetOrchestrator(source['orchestrator'], groups))!;
          await deps.modelCatalog.validate(orchestrator);
          await validateAssignmentCatalog(
            assignmentDefault,
            assignmentModels ?? [
              {
                provider: assignmentDefault.provider,
                model: assignmentDefault.model,
                allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
                defaultEffort: assignmentDefault.reasoningEffort ?? '',
              },
            ],
          );
          if (groups !== undefined) presetGroupRoutes(groups);
          requireEngineChoices(presetEngineChoices(engines));
          assertEngineAccounts(presetEngineChoices(engines));
          const preset = deps.modelPresets.create({
            name,
            orchestrator,
            assignmentDefault,
            ...(assignmentModels === undefined ? {} : { assignmentModels }),
            ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
            ...(groups === undefined ? {} : { groups }),
            ...(Object.keys(engines).length === 0 ? {} : { engines }),
          });
          return { ok: true, value: { preset } };
        } catch (error) {
          if (error instanceof RoutingGroupError) return routingGroupFailure(error);
          return error instanceof TeamError ||
            error instanceof EngineRefusal ||
            !deps.team ||
            deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
      },
      async modelPresetUpdate(payload) {
        if (deps.modelPresets === undefined || deps.modelCatalog === undefined)
          return unavailable();
        const source = asObject(payload);
        const id = source['id'];
        const expectedRevision = source['expectedRevision'];
        const name = source['name'];
        const assignmentDefault = source['assignmentDefault'];
        const assignmentModels = source['assignmentModels'];
        const openAssignmentModels = source['openAssignmentModels'];
        const groupInput = presetGroupsInput(source);
        if ('invalid' in groupInput) return invalidInput('Model Preset Routing Groups are invalid');
        const given = groupInput.given ? groupInput.groups : undefined;
        if (
          given?.orchestratorGroupId === undefined
            ? !isModelRoute(source['orchestrator'])
            : source['orchestrator'] !== undefined
        )
          return invalidInput(
            'Choose either an Orchestrator route or an Orchestrator Routing Group',
          );
        if (
          typeof id !== 'string' ||
          (openAssignmentModels !== undefined && typeof openAssignmentModels !== 'boolean') ||
          typeof expectedRevision !== 'number' ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 1 ||
          typeof name !== 'string' ||
          !isModelRoute(assignmentDefault) ||
          (assignmentModels !== undefined &&
            (!Array.isArray(assignmentModels) || !assignmentModels.every(isAssignmentModelOption)))
        )
          return invalidInput(
            'An id, expected revision, name, and valid Orchestrator and Assignment routes are required',
          );
        const current = deps.modelPresets.get(id);
        if (current === undefined) return invalidInput('Model Preset was not found');
        if (!groupInput.given && hasPresetGroups(current)) return presetClientOutdated;
        const groups =
          given === undefined || ('optionsGiven' in groupInput && groupInput.optionsGiven)
            ? given
            : current.assignmentGroupOptions === undefined
              ? given
              : { ...given, assignmentGroupOptions: current.assignmentGroupOptions };
        try {
          const engines = presetEnginesInput(source);
          await checkPresetEngines(engines);
          if (groups !== undefined) presetGroupRoutes(groups);
          await validateGroupOptions(groups?.assignmentGroupOptions);
          await validateGroupEffort(groups);
          const orchestrator = (await presetOrchestrator(source['orchestrator'], groups))!;
          await deps.modelCatalog.validate(orchestrator);
          await validateAssignmentCatalog(
            assignmentDefault,
            assignmentModels ??
              current.assignmentModels ?? [
                {
                  provider: assignmentDefault.provider,
                  model: assignmentDefault.model,
                  allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
                  defaultEffort: assignmentDefault.reasoningEffort ?? '',
                },
              ],
          );
          if (groups !== undefined) presetGroupRoutes(groups);
          requireEngineChoices(presetEngineChoices(engines));
          assertEngineAccounts(presetEngineChoices(engines));
          const preset = deps.modelPresets.update(id, {
            expectedRevision,
            name,
            orchestrator,
            assignmentDefault,
            ...(assignmentModels === undefined ? {} : { assignmentModels }),
            ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
            ...(groups === undefined ? {} : { groups }),
            ...(Object.keys(engines).length === 0 ? {} : { engines }),
          });
          if (preset === undefined) return invalidInput('Model Preset was not found');
          return { ok: true, value: { preset } };
        } catch (error) {
          if (error instanceof RoutingGroupError) return routingGroupFailure(error);
          return error instanceof TeamError ||
            error instanceof EngineRefusal ||
            !deps.team ||
            deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
      },
      async modelPresetApply(payload) {
        if (deps.modelPresets === undefined || deps.modelCatalog === undefined)
          return unavailable();
        const source = asObject(payload);
        const slug = source['slug'];
        const presetId = source['presetId'];
        if (typeof slug !== 'string' || typeof presetId !== 'string') {
          return invalidInput('slug and presetId are required');
        }
        if (deps.registry.get(slug) === undefined) return unknownBot(slug);
        const expectedRevision = source['expectedRevision'];
        const expectedPresetRevision = source['expectedPresetRevision'];
        if (
          [expectedRevision, expectedPresetRevision].some(
            (value) => value !== undefined && (!Number.isSafeInteger(value) || Number(value) < 0),
          )
        )
          return invalidInput('Expected revisions must be nonnegative integers');
        const preset = deps.modelPresets.get(presetId);
        if (preset === undefined) return invalidInput('Model Preset was not found');
        const changed = () => {
          const current = deps.registry.get(slug);
          return (
            (expectedRevision !== undefined &&
              (current?.modelPlan?.revision ?? current?.modelPlanRevision ?? 0) !==
                expectedRevision) ||
            deps.modelPresets?.get(presetId)?.revision !==
              (expectedPresetRevision ?? preset.revision)
          );
        };
        const stale = (): BridgeResult<{ plan: PersonaBotModelPlan }> => ({
          ok: false,
          error: {
            code: 'stale-setting',
            message: 'Bot plan or Model Preset changed; read both again before applying',
          },
        });
        if (changed()) return stale();
        try {
          requireRoutes(slug, [
            preset.orchestrator,
            preset.assignmentDefault,
            ...(preset.assignmentModels ?? []),
            ...presetGroupRoutes(preset, slug),
          ]);
          const orchestrator =
            preset.orchestratorGroupId === undefined
              ? preset.orchestrator
              : await firstUsableRoute(groupRoutes(preset.orchestratorGroupId));
          await deps.modelCatalog.validate(orchestrator);
          await deps.modelCatalog.validate(preset.assignmentDefault);
          if (preset.assignmentModels !== undefined)
            await validateAssignmentCatalog(preset.assignmentDefault, preset.assignmentModels);
          if (hasPresetEngines(preset)) await checkPresetEngines(preset, slug);
          await validateGroupOptions(preset.assignmentGroupOptions);
          await validateGroupEffort(preset);
          if (changed()) return stale();
          requireRoutes(slug, [
            orchestrator,
            preset.orchestrator,
            preset.assignmentDefault,
            ...(preset.assignmentModels ?? []),
            ...presetGroupRoutes(preset, slug),
          ]);
          requireEngineChoices(presetEngineChoices(preset), slug);
          assertEngineAccounts(presetEngineChoices(preset));
          const result = deps.registry.applyModelPreset(slug, { ...preset, orchestrator });
          if (!result.ok || result.record.modelPlan === undefined) return unknownBot(slug);
          const engines = deps.subscriptionEngines;
          if (engines !== undefined) {
            for (const [role, selection] of [
              ['orchestrator', preset.orchestratorEngine],
              ['assignment', preset.assignmentEngine],
            ] as const) {
              if (selection === undefined && engines.store.selection(slug, role) === undefined)
                continue;
              const { engine, ...choice } = selection ?? {};
              engines.use(
                slug,
                role,
                engine,
                role === 'orchestrator'
                  ? { ...choice, fallback: engine !== undefined && engines.fallsBack(slug) }
                  : choice,
              );
              if (role === 'orchestrator') deps.releaseEngineQuotaHold?.(slug);
            }
          }
          return { ok: true, value: { plan: result.record.modelPlan } };
        } catch (error) {
          if (error instanceof RoutingGroupError) return routingGroupFailure(error);
          return error instanceof TeamError ||
            error instanceof EngineRefusal ||
            !deps.team ||
            deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
      },
      modelGroups() {
        if (deps.routingGroups === undefined) return unavailable();
        const owner = isHostOwner();
        const engineAllowed = engineChoiceFilter();
        return {
          ok: true,
          value: {
            groups: deps.routingGroups.list().filter((group) => {
              if (owner) return true;
              try {
                return groupEngineChoices(group.id).every(engineAllowed);
              } catch {
                return false;
              }
            }),
            rests: deps.routeRests?.list() ?? [],
          },
        };
      },
      modelGroup(payload) {
        if (deps.routingGroups === undefined) return unavailable();
        const id = asObject(payload)['id'];
        if (typeof id !== 'string' || !id.trim())
          return invalidInput('A Routing Group id is required');
        try {
          const group = deps.routingGroups.get(id.trim());
          if (group === undefined)
            throw new RoutingGroupError('not-found', `Routing Group ${id} does not exist`);
          if (!isHostOwner()) requireGroupEngines(group.id);
          return { ok: true, value: { group, routes: deps.routingGroups.routes(group.id) } };
        } catch (error) {
          return routingGroupFailure(error);
        }
      },
      async modelGroupCreate(payload) {
        if (deps.routingGroups === undefined || deps.modelCatalog === undefined)
          return unavailable();
        const source = asObject(payload);
        try {
          const input = routingGroupInput(source);
          await validateGroupMembers(input.members);
          requireEngineChoices(memberEngineChoices(input.members));
          assertEngineAccounts(input.members.filter((member) => member.kind === 'engine'));
          return { ok: true, value: { group: deps.routingGroups.create(input) } };
        } catch (error) {
          return routingGroupFailure(error);
        }
      },
      async modelGroupUpdate(payload) {
        if (deps.routingGroups === undefined || deps.modelCatalog === undefined)
          return unavailable();
        const source = asObject(payload);
        const id = source['id'];
        const expectedRevision = source['expectedRevision'];
        if (
          typeof id !== 'string' ||
          !Number.isSafeInteger(expectedRevision) ||
          (expectedRevision as number) < 1
        )
          return invalidInput('A Routing Group id and expected revision are required');
        try {
          const input = routingGroupInput(source);
          const current = deps.routingGroups.get(id);
          await validateGroupMembers(
            input.members,
            current?.revision === expectedRevision ? current?.members : undefined,
          );
          requireEngineChoices(memberEngineChoices(input.members));
          assertEngineAccounts(input.members.filter((member) => member.kind === 'engine'));
          const group = deps.routingGroups.update(id, {
            ...input,
            expectedRevision: expectedRevision as number,
          });
          return { ok: true, value: { group } };
        } catch (error) {
          return routingGroupFailure(error);
        }
      },
      modelGroupDelete(payload) {
        if (deps.routingGroups === undefined) return unavailable();
        const source = asObject(payload);
        const id = source['id'];
        const expectedRevision = source['expectedRevision'];
        if (
          typeof id !== 'string' ||
          !Number.isSafeInteger(expectedRevision) ||
          (expectedRevision as number) < 1
        )
          return invalidInput('A Routing Group id and expected revision are required');
        try {
          return {
            ok: true,
            value: { group: deps.routingGroups.delete(id, expectedRevision as number) },
          };
        } catch (error) {
          return routingGroupFailure(error);
        }
      },
      async modelPlan(payload) {
        const slug = asSlug(payload);
        if (slug === undefined) return invalidInput('slug is required');
        const bot = deps.registry.get(slug);
        if (bot === undefined) return unknownBot(slug);
        try {
          requireOwnedBot(slug);
        } catch (error) {
          return error instanceof TeamError || !deps.team || deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
        const sessionId = deps.runtime?.currentOrchestratorSessionId?.(slug);
        const currentTarget = sessionTarget(
          deps.runtime?.currentTurnTarget?.(slug),
          sessionId === undefined ? undefined : deps.describeEngineSession?.(sessionId),
        );
        const executed = currentTarget === undefined ? {} : { currentTarget };
        if (deps.modelReadiness !== undefined && (!deps.team || deps.team.isOwner(human))) {
          try {
            const state = await deps.modelReadiness.inspect(slug);
            const current = deps.registry.get(slug);
            return {
              ok: true,
              value: {
                ...state,
                ...executed,
                revision: current?.modelPlan?.revision ?? current?.modelPlanRevision ?? 0,
              },
            };
          } catch (failure) {
            return invalidInput(failure instanceof Error ? failure.message : String(failure));
          }
        }
        return {
          ok: true,
          value: {
            ...executed,
            revision: bot.modelPlan?.revision ?? bot.modelPlanRevision ?? 0,
            ...(bot.modelPlan === undefined ? {} : { plan: bot.modelPlan }),
          },
        };
      },
      async modelPlanCustomize(payload, beforeCommit) {
        if (deps.modelCatalog === undefined) return unavailable();
        const source = asObject(payload);
        const slug = source['slug'];
        const groupId = source['orchestratorGroupId'];
        const groupEffort = source['orchestratorGroupEffort'] ?? undefined;
        if (
          (groupEffort !== undefined &&
            (typeof groupEffort !== 'string' ||
              groupEffort.trim() === '' ||
              groupId === undefined)) ||
          typeof slug !== 'string' ||
          (groupId === undefined
            ? !isModelRoute(source['orchestrator'])
            : typeof groupId !== 'string' ||
              !groupId.trim() ||
              source['orchestrator'] !== undefined)
        ) {
          return invalidInput(
            'slug and either a valid Orchestrator route or an Orchestrator Routing Group are required',
          );
        }
        const bot = deps.registry.get(slug);
        if (bot === undefined) return unknownBot(slug);
        if (bot.model !== undefined)
          return invalidInput('Repair the legacy model before customizing');
        const expectedRevision =
          source['expectedRevision'] ?? bot.modelPlan?.revision ?? bot.modelPlanRevision ?? 0;
        if (
          typeof expectedRevision !== 'number' ||
          !Number.isSafeInteger(expectedRevision) ||
          expectedRevision < 0
        )
          return invalidInput('A valid expected revision is required');
        try {
          const group =
            typeof groupId === 'string'
              ? (() => {
                  if (deps.routingGroups === undefined)
                    throw new RoutingGroupError('not-found', 'Routing Groups are unavailable');
                  const found = deps.routingGroups.get(groupId.trim());
                  if (found === undefined)
                    throw new RoutingGroupError(
                      'not-found',
                      `Routing Group ${groupId} does not exist`,
                    );
                  return found;
                })()
              : undefined;
          const candidates =
            group === undefined
              ? [source['orchestrator'] as ModelRoute]
              : deps.routingGroups!.routes(group.id);
          if (group !== undefined) requireGroupEngines(group.id, slug);
          requireRoutes(slug, candidates);
          if (group !== undefined && typeof groupEffort === 'string')
            await requireGroupEfforts(group.id, [groupEffort.trim()]);
          const orchestrator = await firstUsableRoute(candidates);
          beforeCommit?.();
          if (group !== undefined) requireGroupEngines(group.id, slug);
          requireRoutes(slug, candidates);
          if (group !== undefined && deps.routingGroups!.get(group.id)?.revision !== group.revision)
            return invalidInput('Routing Group changed; read it again before saving');
          const result = deps.registry.customizeModelPlan(
            slug,
            orchestrator,
            expectedRevision,
            group?.id,
            typeof groupEffort === 'string' ? groupEffort.trim() : undefined,
          );
          if (!result.ok)
            return result.reason === 'not-found'
              ? unknownBot(slug)
              : invalidInput('Bot Model Plan changed; reopen Profile before saving');
          if (result.record.modelPlan === undefined)
            return invalidInput('Apply a Model Preset first');
          return { ok: true, value: { plan: result.record.modelPlan } };
        } catch (error) {
          if (error instanceof RoutingGroupError) return routingGroupFailure(error);
          return error instanceof TeamError ||
            error instanceof EngineRefusal ||
            !deps.team ||
            deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
      },
      async modelPlanAssignmentsSet(payload) {
        if (deps.modelCatalog === undefined) return unavailable();
        const source = asObject(payload);
        const slug = source['slug'];
        const assignmentDefault = source['assignmentDefault'];
        const assignmentModels = source['assignmentModels'];
        const expectedRevision = source['expectedRevision'];
        const openAssignmentModels = source['openAssignmentModels'];
        const assignmentGroups = source['assignmentGroups'];
        const assignmentDefaultGroupId = source['assignmentDefaultGroupId'];
        const groupOptions = assignmentGroupOptionsInput(
          source['assignmentGroupOptions'],
          assignmentGroups ?? deps.registry.get(String(slug))?.modelPlan?.assignmentGroups ?? [],
        );
        if (
          typeof slug !== 'string' ||
          groupOptions === 'invalid' ||
          (openAssignmentModels !== undefined && typeof openAssignmentModels !== 'boolean') ||
          (assignmentGroups !== undefined &&
            (!Array.isArray(assignmentGroups) ||
              !assignmentGroups.every((id) => typeof id === 'string' && id.trim() !== '') ||
              new Set(assignmentGroups).size !== assignmentGroups.length)) ||
          (assignmentDefaultGroupId !== undefined &&
            (typeof assignmentDefaultGroupId !== 'string' ||
              !Array.isArray(assignmentGroups) ||
              !assignmentGroups.includes(assignmentDefaultGroupId))) ||
          !isModelRoute(assignmentDefault) ||
          !Array.isArray(assignmentModels) ||
          !assignmentModels.every(isAssignmentModelOption) ||
          typeof expectedRevision !== 'number' ||
          !Number.isSafeInteger(expectedRevision)
        )
          return invalidInput(
            'A Bot, expected revision, and valid Assignment choices are required',
          );
        const bot = deps.registry.get(slug);
        if (bot === undefined) return unknownBot(slug);
        if (bot.modelPlan === undefined) return invalidInput('Apply a Model Preset first');
        try {
          requireRoutes(slug, [assignmentDefault, ...assignmentModels]);
          await validateAssignmentCatalog(assignmentDefault, assignmentModels);
          await validateGroupOptions(groupOptions);
          requireRoutes(slug, [
            assignmentDefault,
            ...assignmentModels,
            ...presetGroupRoutes(
              {
                assignmentGroups:
                  (assignmentGroups as string[] | undefined) ??
                  bot.modelPlan.assignmentGroups ??
                  [],
              },
              slug,
            ),
          ]);
          const result = deps.registry.setAssignmentModels(
            slug,
            assignmentDefault,
            assignmentModels,
            expectedRevision,
            typeof openAssignmentModels === 'boolean' ? openAssignmentModels : undefined,
            assignmentGroups === undefined && groupOptions === undefined
              ? undefined
              : {
                  ids:
                    (assignmentGroups as string[] | undefined) ??
                    bot.modelPlan.assignmentGroups ??
                    [],
                  ...(assignmentGroups === undefined
                    ? bot.modelPlan.assignmentDefaultGroupId === undefined
                      ? {}
                      : { defaultId: bot.modelPlan.assignmentDefaultGroupId }
                    : typeof assignmentDefaultGroupId === 'string'
                      ? { defaultId: assignmentDefaultGroupId }
                      : {}),
                  ...(groupOptions === undefined ? {} : { options: groupOptions }),
                },
          );
          if (!result.ok)
            return result.reason === 'not-found'
              ? unknownBot(slug)
              : invalidInput('Bot Model Plan changed; reopen Profile before saving');
          if (result.record.modelPlan === undefined)
            return invalidInput('Apply a Model Preset first');
          return { ok: true, value: { plan: result.record.modelPlan } };
        } catch (error) {
          if (error instanceof RoutingGroupError) return routingGroupFailure(error);
          return error instanceof TeamError ||
            error instanceof EngineRefusal ||
            !deps.team ||
            deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
      },
    } satisfies Pick<
      ModelsBridgeMethods,
      | 'modelCatalog'
      | 'modelFavoriteSet'
      | 'modelPresets'
      | 'modelPresetDelete'
      | 'modelPresetCreate'
      | 'modelPresetUpdate'
      | 'modelPresetApply'
      | 'modelGroups'
      | 'modelGroup'
      | 'modelGroupCreate'
      | 'modelGroupUpdate'
      | 'modelGroupDelete'
      | 'modelPlan'
      | 'modelPlanCustomize'
      | 'modelPlanAssignmentsSet'
    >,
    modelPlan: {
      async modelPlanSet(payload) {
        if (deps.modelCatalog === undefined) return unavailable();
        const source = asObject(payload);
        const slug = source['slug'];
        const orchestrator = source['orchestrator'];
        const assignmentDefault = source['assignmentDefault'];
        const assignmentModels = source['assignmentModels'];
        const expectedRevision = source['expectedRevision'];
        const openAssignmentModels = source['openAssignmentModels'];
        const groupInput = presetGroupsInput(source);
        if ('invalid' in groupInput) return invalidInput('Model Plan Routing Groups are invalid');
        const groups = groupInput.given ? groupInput.groups : undefined;
        if (
          typeof slug !== 'string' ||
          (openAssignmentModels !== undefined && typeof openAssignmentModels !== 'boolean') ||
          (groups?.orchestratorGroupId === undefined
            ? !isModelRoute(orchestrator)
            : orchestrator !== undefined) ||
          !isModelRoute(assignmentDefault) ||
          !Array.isArray(assignmentModels) ||
          !assignmentModels.every(isAssignmentModelOption) ||
          typeof expectedRevision !== 'number' ||
          !Number.isSafeInteger(expectedRevision)
        )
          return invalidInput(
            'A Bot, expected revision, and valid Orchestrator and Assignment choices are required',
          );
        const bot = deps.registry.get(slug);
        if (bot === undefined) return unknownBot(slug);
        try {
          const grouped = groups === undefined ? [] : presetGroupRoutes(groups, slug);
          requireRoutes(slug, grouped);
          await validateGroupOptions(groups?.assignmentGroupOptions);
          await validateGroupEffort(groups);
          const route = (await presetOrchestrator(orchestrator, groups))!;
          requireRoutes(slug, [route]);
          await deps.modelCatalog.validate(route);
          requireRoutes(slug, [assignmentDefault, ...assignmentModels]);
          await validateAssignmentCatalog(assignmentDefault, assignmentModels);
          requireRoutes(slug, [
            route,
            assignmentDefault,
            ...assignmentModels,
            ...(groups === undefined ? grouped : presetGroupRoutes(groups, slug)),
          ]);
          const result = deps.registry.setModelPlan(
            slug,
            {
              orchestrator: route,
              assignmentDefault,
              assignmentModels,
              ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
              ...(groups === undefined ? {} : { groups }),
            },
            expectedRevision,
          );
          if (!result.ok)
            return result.reason === 'not-found'
              ? unknownBot(slug)
              : invalidInput('Bot Model Plan changed; reopen it before saving');
          if (result.record.modelPlan === undefined) return unknownBot(slug);
          return { ok: true, value: { plan: result.record.modelPlan } };
        } catch (error) {
          if (error instanceof RoutingGroupError) return routingGroupFailure(error);
          return error instanceof TeamError ||
            error instanceof EngineRefusal ||
            !deps.team ||
            deps.team.isOwner(human)
            ? modelFailure(error)
            : invalidInput('model-unavailable');
        }
      },
    } satisfies Pick<ModelsBridgeMethods, 'modelPlanSet'>,
  };
}

export {
  createEngineAccountBridge,
  type EngineAccountBridgeMethods,
} from '../../engines/engine-account-bridge.js';
export {
  createEngineSelectionBridge,
  type EngineSelectionBridgeMethods,
} from '../../engines/engine-selection-bridge.js';
export {
  createModelProviderBridge,
  type ModelProviderBridgeMethods,
} from '../../models/provider-bridge.js';
