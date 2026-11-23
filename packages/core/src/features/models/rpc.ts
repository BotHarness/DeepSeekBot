import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap, unwrapAsync, type AdminResult } from '../../bridge/rpc-result.js';
import type {
  ModelProvidersView,
  ModelProviderSave,
  ModelProviderRemoval,
} from '@botharness/host-client/model-providers';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import type { ModelCatalogEntry } from '../../models/catalog.js';
import type { ModelFavorite } from '../../models/favorites.js';
import type { ModelPlanState } from '../../models/readiness.js';
import type {
  AssignmentGroupOption,
  AssignmentModelOption,
  ModelPreset,
  ModelPresetUsage,
  ModelPresetEngine,
  ModelRoute,
  PersonaBotModelPlan,
  PresetSub,
} from '../../models/presets.js';
import type { RoutingGroup, RoutingGroupMember } from '../../models/routing-groups.js';
import type {
  ModelsBridgeMethods,
  ModelProviderBridgeMethods,
  EngineAccountBridgeMethods,
} from './methods.js';
import type { ModelPlanSubView, ModelPresetSubView } from './preset-sub-methods.js';
function presetGroupArgs(
  orchestratorGroupId: string | null | undefined,
  assignmentGroups: string[] | undefined,
  assignmentDefaultGroupId: string | null | undefined,
  assignmentGroupOptions: AssignmentGroupOption[] | null | undefined,
  orchestratorGroupEffort?: string | null,
): Record<string, unknown> {
  return {
    ...(orchestratorGroupId === undefined ? {} : { orchestratorGroupId }),
    ...(orchestratorGroupEffort === undefined ? {} : { orchestratorGroupEffort }),
    ...(assignmentGroups === undefined ? {} : { assignmentGroups }),
    ...(assignmentDefaultGroupId === undefined ? {} : { assignmentDefaultGroupId }),
    ...(assignmentGroupOptions === undefined ? {} : { assignmentGroupOptions }),
  };
}
export function modelPlanInherit(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  slug: string,
  expectedRevision: number,
): AdminResult<{ revision: number }> {
  return unwrap(methods.modelPlanInherit({ slug, expectedRevision }));
}

export function modelProviders(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
): Promise<ModelProvidersView> {
  return unwrapAsync(methods.modelProviders({}));
}

export function modelProviderAdd(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  template: string,
  name: string,
  key: string,
  expectedRevision: number,
  endpoint?: string,
  model?: string,
): Promise<ModelProviderSave> {
  return unwrapAsync(
    methods.modelProviderAdd({ template, name, key, expectedRevision, endpoint, model }),
  );
}

export function modelProviderEdit(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
  name?: string,
  key?: string,
): Promise<ModelProviderSave> {
  return unwrapAsync(methods.modelProviderEdit({ id, expectedRevision, name, key }));
}

export function modelProviderRemove(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
): Promise<ModelProviderRemoval> {
  return unwrapAsync(methods.modelProviderRemove({ id, expectedRevision }));
}

export function engineAccounts(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  grantable?: boolean,
) {
  return unwrapAsync(methods.engineAccounts({ grantable }));
}

export function engineAccountQuotaRefresh(methods: EngineAccountBridgeMethods, id: string) {
  return unwrapAsync(methods.engineAccountQuotaRefresh({ id }));
}

export function engineSelection(
  methods: import('../../engines/engine-selection-bridge.js').EngineSelectionBridgeMethods,
  request: import('../../engines/engine-selection-bridge.js').EngineSelectionRequest,
) {
  return unwrapAsync(methods.engineSelection(request));
}

export function engineAccountAdd(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  engine: string,
  name: string,
  expectedRevision: number,
) {
  return unwrapAsync(methods.engineAccountAdd({ engine, name, expectedRevision }));
}

export function engineAccountRename(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  name: string,
  expectedRevision: number,
) {
  return unwrapAsync(methods.engineAccountRename({ id, name, expectedRevision }));
}

export function engineAccountRemove(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
  confirm: boolean,
) {
  return unwrapAsync(methods.engineAccountRemove({ id, expectedRevision, confirm }));
}

export function engineAccountLogin(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  engine?: string,
  mode?: 'device-auth',
) {
  return unwrapAsync(methods.engineAccountLogin({ id, engine, mode }));
}

export function engineAccountLoginStatus(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  attemptId: string,
) {
  return unwrapAsync(methods.engineAccountLoginStatus({ id, attemptId }));
}

export function engineAccountLoginCancel(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  attemptId?: string,
) {
  return unwrapAsync(methods.engineAccountLoginCancel({ id, attemptId }));
}

export function engineAccountSubmitCode(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  code: string,
) {
  return unwrapAsync(methods.engineAccountSubmitCode({ id, code }));
}

export function modelCatalog(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  includeRoutingGroupEngines?: boolean,
): Promise<{
  models: ModelCatalogEntry[];
  default?: ModelRoute;
  defaultRevision?: number;
  favorites?: ModelFavorite[];
  routingGroupEngines?: RoutingGroupEngineOptions[];
}> {
  return unwrapAsync(
    methods.modelCatalog(includeRoutingGroupEngines === true ? { includeRoutingGroupEngines } : {}),
  );
}

export function modelFavoriteSet(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  choice: ModelFavorite,
  favorite: boolean,
): { favorites: ModelFavorite[] } {
  return unwrap(methods.modelFavoriteSet({ choice, favorite }));
}

export function modelPresets(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  includeUsage?: boolean,
): { presets: ModelPreset[]; defaultPresetId?: string; usage?: ModelPresetUsage[] } {
  return unwrap(methods.modelPresets({ includeUsage }));
}

export function modelPresetDelete(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
  confirmed: boolean,
): { id: string } {
  return unwrap(methods.modelPresetDelete({ id, expectedRevision, confirmed }));
}

export function modelPlanSub(
  methods: ModelsBridgeMethods,
  slug: string,
): AdminResult<ModelPlanSubView> {
  return unwrap(methods.modelPlanSub({ slug }));
}

export function modelPlanSubSet(
  methods: ModelsBridgeMethods,
  slug: string,
  expectedRevision: number,
  sub: PresetSub,
): Promise<AdminResult<ModelPlanSubView>> {
  return unwrapAsync(methods.modelPlanSubSet({ slug, expectedRevision, sub }));
}

export function modelPresetSub(methods: ModelsBridgeMethods, id: string): ModelPresetSubView {
  return unwrap(methods.modelPresetSub({ id }));
}

export function modelPresetSubSet(
  methods: ModelsBridgeMethods,
  id: string,
  expectedRevision: number,
  sub: PresetSub,
): Promise<ModelPresetSubView> {
  return unwrapAsync(methods.modelPresetSubSet({ id, expectedRevision, sub }));
}

export function modelPresetCreate(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  name: string,
  orchestrator: ModelRoute | undefined,
  assignmentDefault: ModelRoute | undefined,
  assignmentModels?: AssignmentModelOption[],
  openAssignmentModels?: boolean,
  orchestratorGroupId?: string | null,
  assignmentGroups?: string[],
  assignmentDefaultGroupId?: string | null,
  assignmentGroupOptions?: AssignmentGroupOption[] | null,
  orchestratorGroupEffort?: string | null,
  orchestratorEngine?: ModelPresetEngine | null,
  assignmentEngine?: ModelPresetEngine | null,
  sub?: PresetSub,
): Promise<{ preset: ModelPreset }> {
  return unwrapAsync(
    methods.modelPresetCreate({
      name,
      ...(orchestrator === undefined ? {} : { orchestrator }),
      ...(assignmentDefault === undefined ? {} : { assignmentDefault }),
      ...(orchestratorEngine === undefined ? {} : { orchestratorEngine }),
      ...(assignmentEngine === undefined ? {} : { assignmentEngine }),
      ...(assignmentModels === undefined ? {} : { assignmentModels }),
      ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
      ...(sub === undefined ? {} : { sub }),
      ...presetGroupArgs(
        orchestratorGroupId,
        assignmentGroups,
        assignmentDefaultGroupId,
        assignmentGroupOptions,
        orchestratorGroupEffort,
      ),
    }),
  );
}

export function modelPresetUpdate(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
  name: string,
  orchestrator: ModelRoute | undefined,
  assignmentDefault: ModelRoute | undefined,
  assignmentModels?: AssignmentModelOption[],
  openAssignmentModels?: boolean,
  orchestratorGroupId?: string | null,
  assignmentGroups?: string[],
  assignmentDefaultGroupId?: string | null,
  assignmentGroupOptions?: AssignmentGroupOption[] | null,
  orchestratorGroupEffort?: string | null,
  orchestratorEngine?: ModelPresetEngine | null,
  assignmentEngine?: ModelPresetEngine | null,
  assignmentFollowsMain?: boolean,
  sub?: PresetSub,
): Promise<{ preset: ModelPreset }> {
  return unwrapAsync(
    methods.modelPresetUpdate({
      id,
      expectedRevision,
      name,
      ...(orchestrator === undefined ? {} : { orchestrator }),
      ...(assignmentDefault === undefined ? {} : { assignmentDefault }),
      ...(assignmentFollowsMain === undefined ? {} : { assignmentFollowsMain }),
      ...(orchestratorEngine === undefined ? {} : { orchestratorEngine }),
      ...(assignmentEngine === undefined ? {} : { assignmentEngine }),
      ...(assignmentModels === undefined ? {} : { assignmentModels }),
      ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
      ...(sub === undefined ? {} : { sub }),
      ...presetGroupArgs(
        orchestratorGroupId,
        assignmentGroups,
        assignmentDefaultGroupId,
        assignmentGroupOptions,
        orchestratorGroupEffort,
      ),
    }),
  );
}

export function modelPresetApply(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  slug: string,
  presetId: string,
  expectedRevision?: number,
  expectedPresetRevision?: number,
): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
  return unwrapAsync(
    methods.modelPresetApply({
      slug,
      presetId,
      expectedRevision,
      expectedPresetRevision,
    }),
  );
}

export function modelGroups(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
): { groups: RoutingGroup[] } {
  return unwrap(methods.modelGroups({}));
}

export function modelGroup(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
): { group: RoutingGroup; routes: ModelRoute[] } {
  return unwrap(methods.modelGroup({ id }));
}

export function modelGroupCreate(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  name: string,
  members: RoutingGroupMember[],
): Promise<{ group: RoutingGroup }> {
  return unwrapAsync(methods.modelGroupCreate({ name, members }));
}

export function modelGroupUpdate(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
  name: string,
  members: RoutingGroupMember[],
): Promise<{ group: RoutingGroup }> {
  return unwrapAsync(methods.modelGroupUpdate({ id, expectedRevision, name, members }));
}

export function modelGroupDelete(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  id: string,
  expectedRevision: number,
): { group: RoutingGroup } {
  return unwrap(methods.modelGroupDelete({ id, expectedRevision }));
}

export function modelPlan(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  slug: string,
): Promise<AdminResult<ModelPlanState>> {
  return unwrapAsync(methods.modelPlan({ slug }));
}

export function modelPlanCustomize(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  slug: string,
  orchestrator?: ModelRoute,
  expectedRevision?: number,
  orchestratorGroupId?: string,
  orchestratorGroupEffort?: string,
): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
  return unwrapAsync(
    methods.modelPlanCustomize({
      slug,
      ...(orchestrator === undefined ? {} : { orchestrator }),
      expectedRevision,
      ...(orchestratorGroupId === undefined ? {} : { orchestratorGroupId }),
      ...(orchestratorGroupEffort === undefined ? {} : { orchestratorGroupEffort }),
    }),
  );
}

export function modelPlanAssignmentsSet(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  slug: string,
  expectedRevision: number,
  assignmentDefault: ModelRoute,
  assignmentModels: AssignmentModelOption[],
  openAssignmentModels?: boolean,
  assignmentGroups?: string[],
  assignmentDefaultGroupId?: string,
  assignmentGroupOptions?: AssignmentGroupOption[] | null,
): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
  return unwrapAsync(
    methods.modelPlanAssignmentsSet({
      slug,
      expectedRevision,
      assignmentDefault,
      assignmentModels,
      ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
      ...(assignmentGroups === undefined ? {} : { assignmentGroups }),
      ...(assignmentDefaultGroupId === undefined ? {} : { assignmentDefaultGroupId }),
      ...(assignmentGroupOptions === undefined ? {} : { assignmentGroupOptions }),
    }),
  );
}

export function modelPlanSet(
  methods: ModelsBridgeMethods & ModelProviderBridgeMethods & EngineAccountBridgeMethods,
  slug: string,
  expectedRevision: number,
  orchestrator: ModelRoute | undefined,
  assignmentDefault: ModelRoute | undefined,
  assignmentModels: AssignmentModelOption[] | undefined,
  openAssignmentModels?: boolean,
  orchestratorGroupId?: string | null,
  assignmentGroups?: string[],
  assignmentDefaultGroupId?: string | null,
  assignmentGroupOptions?: AssignmentGroupOption[] | null,
  orchestratorGroupEffort?: string | null,
  sub?: PresetSub,
): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
  return unwrapAsync(
    methods.modelPlanSet({
      slug,
      expectedRevision,
      ...(orchestrator === undefined ? {} : { orchestrator }),
      ...(assignmentDefault === undefined ? {} : { assignmentDefault }),
      ...(assignmentModels === undefined ? {} : { assignmentModels }),
      ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
      ...(sub === undefined ? {} : { sub }),
      ...presetGroupArgs(
        orchestratorGroupId,
        assignmentGroups,
        assignmentDefaultGroupId,
        assignmentGroupOptions,
        orchestratorGroupEffort,
      ),
    }),
  );
}

export const modelsRpcMethods = {
  modelPlanInherit(slug: string, expectedRevision: number): AdminResult<{ revision: number }> {
    return modelPlanInherit(this.methods, slug, expectedRevision);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const modelConfigurationRpc = {
  modelProviders(): Promise<ModelProvidersView> {
    return modelProviders(this.methods);
  },

  modelProviderAdd(
    template: string,
    name: string,
    key: string,
    expectedRevision: number,
    endpoint?: string,
    model?: string,
  ): Promise<ModelProviderSave> {
    return modelProviderAdd(this.methods, template, name, key, expectedRevision, endpoint, model);
  },

  modelProviderEdit(
    id: string,
    expectedRevision: number,
    name?: string,
    key?: string,
  ): Promise<ModelProviderSave> {
    return modelProviderEdit(this.methods, id, expectedRevision, name, key);
  },

  modelProviderRemove(id: string, expectedRevision: number): Promise<ModelProviderRemoval> {
    return modelProviderRemove(this.methods, id, expectedRevision);
  },

  engineAccounts(grantable?: boolean) {
    return engineAccounts(this.methods, grantable);
  },

  engineAccountQuotaRefresh(id: string) {
    return engineAccountQuotaRefresh(this.methods, id);
  },

  engineSelection(
    request: import('../../engines/engine-selection-bridge.js').EngineSelectionRequest,
  ) {
    return engineSelection(this.methods, request);
  },

  engineAccountAdd(engine: string, name: string, expectedRevision: number) {
    return engineAccountAdd(this.methods, engine, name, expectedRevision);
  },

  engineAccountRename(id: string, name: string, expectedRevision: number) {
    return engineAccountRename(this.methods, id, name, expectedRevision);
  },

  engineAccountRemove(id: string, expectedRevision: number, confirm: boolean) {
    return engineAccountRemove(this.methods, id, expectedRevision, confirm);
  },

  engineAccountLogin(id: string, engine?: string, mode?: 'device-auth') {
    return engineAccountLogin(this.methods, id, engine, mode);
  },

  engineAccountLoginStatus(id: string, attemptId: string) {
    return engineAccountLoginStatus(this.methods, id, attemptId);
  },

  engineAccountLoginCancel(id: string, attemptId?: string) {
    return engineAccountLoginCancel(this.methods, id, attemptId);
  },

  engineAccountSubmitCode(id: string, code: string) {
    return engineAccountSubmitCode(this.methods, id, code);
  },

  modelCatalog(includeRoutingGroupEngines?: boolean): Promise<{
    models: ModelCatalogEntry[];
    default?: ModelRoute;
    defaultRevision?: number;
    favorites?: ModelFavorite[];
    routingGroupEngines?: RoutingGroupEngineOptions[];
  }> {
    return modelCatalog(this.methods, includeRoutingGroupEngines);
  },

  modelFavoriteSet(choice: ModelFavorite, favorite: boolean): { favorites: ModelFavorite[] } {
    return modelFavoriteSet(this.methods, choice, favorite);
  },

  modelPresets(includeUsage?: boolean): {
    presets: ModelPreset[];
    defaultPresetId?: string;
    usage?: ModelPresetUsage[];
  } {
    return modelPresets(this.methods, includeUsage);
  },

  modelPresetDelete(id: string, expectedRevision: number, confirmed: boolean): { id: string } {
    return modelPresetDelete(this.methods, id, expectedRevision, confirmed);
  },

  modelPlanSub(slug: string) {
    return modelPlanSub(this.methods, slug);
  },

  modelPlanSubSet(slug: string, expectedRevision: number, sub: PresetSub) {
    return modelPlanSubSet(this.methods, slug, expectedRevision, sub);
  },

  modelPresetSub(id: string) {
    return modelPresetSub(this.methods, id);
  },

  modelPresetSubSet(id: string, expectedRevision: number, sub: PresetSub) {
    return modelPresetSubSet(this.methods, id, expectedRevision, sub);
  },

  modelPresetCreate(
    name: string,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute | undefined,
    assignmentModels?: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    orchestratorEngine?: ModelPresetEngine | null,
    assignmentEngine?: ModelPresetEngine | null,
    sub?: PresetSub,
  ): Promise<{ preset: ModelPreset }> {
    return modelPresetCreate(
      this.methods,
      name,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      orchestratorGroupId,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
      orchestratorGroupEffort,
      orchestratorEngine,
      assignmentEngine,
      sub,
    );
  },

  modelPresetUpdate(
    id: string,
    expectedRevision: number,
    name: string,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute | undefined,
    assignmentModels?: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    orchestratorEngine?: ModelPresetEngine | null,
    assignmentEngine?: ModelPresetEngine | null,
    assignmentFollowsMain?: boolean,
    sub?: PresetSub,
  ): Promise<{ preset: ModelPreset }> {
    return modelPresetUpdate(
      this.methods,
      id,
      expectedRevision,
      name,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      orchestratorGroupId,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
      orchestratorGroupEffort,
      orchestratorEngine,
      assignmentEngine,
      assignmentFollowsMain,
      sub,
    );
  },

  modelPresetApply(
    slug: string,
    presetId: string,
    expectedRevision?: number,
    expectedPresetRevision?: number,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelPresetApply(this.methods, slug, presetId, expectedRevision, expectedPresetRevision);
  },

  modelGroups(): { groups: RoutingGroup[] } {
    return modelGroups(this.methods);
  },

  modelGroup(id: string): { group: RoutingGroup; routes: ModelRoute[] } {
    return modelGroup(this.methods, id);
  },

  modelGroupCreate(name: string, members: RoutingGroupMember[]): Promise<{ group: RoutingGroup }> {
    return modelGroupCreate(this.methods, name, members);
  },

  modelGroupUpdate(
    id: string,
    expectedRevision: number,
    name: string,
    members: RoutingGroupMember[],
  ): Promise<{ group: RoutingGroup }> {
    return modelGroupUpdate(this.methods, id, expectedRevision, name, members);
  },

  modelGroupDelete(id: string, expectedRevision: number): { group: RoutingGroup } {
    return modelGroupDelete(this.methods, id, expectedRevision);
  },

  modelPlan(slug: string): Promise<AdminResult<ModelPlanState>> {
    return modelPlan(this.methods, slug);
  },

  modelPlanCustomize(
    slug: string,
    orchestrator?: ModelRoute,
    expectedRevision?: number,
    orchestratorGroupId?: string,
    orchestratorGroupEffort?: string,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelPlanCustomize(
      this.methods,
      slug,
      orchestrator,
      expectedRevision,
      orchestratorGroupId,
      orchestratorGroupEffort,
    );
  },

  modelPlanAssignmentsSet(
    slug: string,
    expectedRevision: number,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
    openAssignmentModels?: boolean,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelPlanAssignmentsSet(
      this.methods,
      slug,
      expectedRevision,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
    );
  },

  modelPlanSet(
    slug: string,
    expectedRevision: number,
    orchestrator: ModelRoute | undefined,
    assignmentDefault: ModelRoute | undefined,
    assignmentModels: AssignmentModelOption[] | undefined,
    openAssignmentModels?: boolean,
    orchestratorGroupId?: string | null,
    assignmentGroups?: string[],
    assignmentDefaultGroupId?: string | null,
    assignmentGroupOptions?: AssignmentGroupOption[] | null,
    orchestratorGroupEffort?: string | null,
    sub?: PresetSub,
  ): Promise<AdminResult<{ plan: PersonaBotModelPlan }>> {
    return modelPlanSet(
      this.methods,
      slug,
      expectedRevision,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      orchestratorGroupId,
      assignmentGroups,
      assignmentDefaultGroupId,
      assignmentGroupOptions,
      orchestratorGroupEffort,
      sub,
    );
  },
} satisfies ThisType<BridgeRpcReceiver>;
