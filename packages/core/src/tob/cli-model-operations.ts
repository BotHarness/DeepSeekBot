import { isDeepStrictEqual } from 'node:util';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { ModelCatalog } from '../models/catalog.js';
import {
  assignmentModelsOf,
  isAssignmentModelOption,
  isModelRoute,
  validateAssignmentModels,
  type AssignmentModelOption,
  type ModelPresetStore,
  type ModelRoute,
} from '../models/presets.js';
import type { PreparedTobOperation } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_MODEL_CAPABILITIES = [
  ['list', 'List Bot names and identifiers', false],
  ['model-catalog', 'Read available models and the Host default revision', false],
  ['model-plan', 'Read one Bot model plan and revision', false],
  ['model-presets', 'List model presets and revisions', false],
  ['home-model-set', 'Set the Host default model without changing Bot overrides', true],
  ['model-plan-set', 'Set a Bot Orchestrator and Assignment model plan', true],
  ['model-plan-customize', 'Customize a Bot Orchestrator model', true],
  ['model-plan-inherit', 'Restore a Bot to the Host default model', true],
  ['model-plan-assignments-set', 'Set a Bot Assignment model choices', true],
  ['model-preset-create', 'Create a model preset', true],
  ['model-preset-update', 'Update a model preset at its reviewed revision', true],
  ['model-preset-apply', 'Apply reviewed preset and Bot revisions', true],
  ['settings', 'Discover or read supported live runtime settings', false],
  ['settings-set', 'Update supported live runtime settings at their reviewed revision', true],
].map(([command, description, write]) => ({
  command: String(command),
  description: String(description),
  write: Boolean(write),
}));

export interface TobNativeSettings {
  describe(options: { redactSecrets: boolean }): { ns: string; value: unknown; revision: number }[];
  update(ns: string, patch: object, expectedRevision: number): Promise<void>;
  replace(ns: string, value: object, expectedRevision: number): Promise<void>;
}
export interface TobModelOperationDependencies {
  registry: PersonaBotRegistry;
  presets: ModelPresetStore;
  catalog: ModelCatalog;
  settings: () => TobNativeSettings | undefined;
  defaultModel?: { currentSelection(): ModelRoute };
  runtimeChanged?: (patch: Record<string, unknown>) => void;
}
const runtimeFields = [
  'assignmentConcurrencyLimit',
  'developerMode',
  'showBotSessions',
  'showApprovalReviewSessions',
];
const routeFields = ['provider', 'model', 'reasoningEffort'];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || value !== value.trim())
    throw new TobError('invalid-input');
  return value;
}
function revision(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new TobError('invalid-input');
  return Number(value);
}
function route(value: unknown): ModelRoute {
  keys(object(value), routeFields);
  if (!isModelRoute(value)) throw new TobError('invalid-input');
  text(value.provider);
  text(value.model);
  return structuredClone(value);
}
function choices(value: unknown): AssignmentModelOption[] {
  if (!Array.isArray(value) || !value.every(isAssignmentModelOption))
    throw new TobError('invalid-input');
  for (const item of value)
    keys(object(item), ['provider', 'model', 'allowedEfforts', 'defaultEffort', 'note']);
  return structuredClone(value);
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function same(actual: unknown, expected: unknown) {
  if (!isDeepStrictEqual(actual, expected)) throw new TobError('stale-setting');
}
export function createTobModelOperations(deps: TobModelOperationDependencies) {
  const native = () => {
    const owner = deps.settings();
    if (!owner) throw new TobError('settings-unavailable');
    return owner;
  };
  const settings = (ns: string) => {
    if (!['botharness-client', 'agent-default-model'].includes(ns))
      throw new TobError('unsupported-setting');
    const row = native()
      .describe({ redactSecrets: true })
      .find((entry) => entry.ns === ns);
    if (!row) throw new TobError('settings-unavailable');
    const source = object(row.value);
    const fields = ns === 'botharness-client' ? runtimeFields : routeFields;
    const value = Object.fromEntries(
      fields.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]),
    );
    if (ns === 'botharness-client') {
      value.assignmentConcurrencyLimit ??= 8;
      for (const key of runtimeFields.slice(1)) value[key] ??= key === 'showBotSessions';
    } else {
      if (isModelRoute(value) && deps.defaultModel)
        same(value, deps.defaultModel.currentSelection());
    }
    return { scope: 'global' as const, ns, revision: row.revision, value };
  };
  const bot = (slug: string) => {
    const record = deps.registry.get(slug);
    if (!record) throw new TobError('unknown-bot');
    return record;
  };
  const plan = (slug: string) => {
    const record = bot(slug);
    return {
      revision: record.modelPlan?.revision ?? record.modelPlanRevision ?? 0,
      ...(record.modelPlan ? { plan: structuredClone(record.modelPlan) } : {}),
      ...(record.model
        ? { legacyModel: record.model, repair: { code: 'legacy-model-repair-required' } }
        : {}),
    };
  };
  const validate = async (routes: ModelRoute[]) => {
    try {
      await Promise.all(routes.map((item) => deps.catalog.validate(item)));
    } catch {
      throw new TobError('model-unavailable');
    }
  };
  const assignmentRoutes = (defaultRoute: ModelRoute, options: AssignmentModelOption[]) => {
    try {
      validateAssignmentModels(defaultRoute, options);
    } catch {
      throw new TobError('invalid-input');
    }
    return options.flatMap((option) =>
      option.allowedEfforts.map((effort) => ({
        provider: option.provider,
        model: option.model,
        ...(effort ? { reasoningEffort: effort } : {}),
      })),
    );
  };
  const prepared = (
    command: string,
    target: string,
    previousValue: unknown,
    patch: unknown,
    expectedRevision: number | undefined,
    run: PreparedTobOperation['run'],
  ): PreparedTobOperation => ({
    proposal: freeze(
      structuredClone({
        command,
        target,
        previousValue,
        patch,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      }),
    ),
    run,
  });
  return async (command: string, raw: unknown): Promise<PreparedTobOperation | undefined> => {
    if (!TOB_MODEL_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const args = structuredClone(object(raw));
    if (command === 'list') {
      keys(args, []);
      return {
        run: (guard) => {
          guard();
          return {
            bots: deps.registry.list().map(({ slug, displayName }) => ({ slug, displayName })),
          };
        },
      };
    }
    if (command === 'model-catalog') {
      keys(args, []);
      return {
        run: async (guard) => {
          guard();
          const models = await deps.catalog.list();
          guard();
          const current = settings('agent-default-model');
          return {
            models,
            ...(isModelRoute(current.value) ? { default: current.value } : {}),
            defaultRevision: current.revision,
          };
        },
      };
    }
    if (command === 'model-plan') {
      keys(args, ['slug']);
      const slug = text(args.slug);
      return {
        run: (guard) => {
          guard();
          return plan(slug);
        },
      };
    }
    if (command === 'model-presets') {
      keys(args, []);
      return {
        run: (guard) => {
          guard();
          return { presets: deps.presets.list() };
        },
      };
    }
    if (command === 'settings') {
      keys(args, ['ns']);
      const ns = args.ns === undefined ? undefined : text(args.ns);
      return {
        run: (guard) => {
          guard();
          return ns
            ? settings(ns)
            : { namespaces: [settings('botharness-client'), settings('agent-default-model')] };
        },
      };
    }
    if (command === 'settings-set' || command === 'home-model-set') {
      const isDefault = command === 'home-model-set';
      keys(
        args,
        isDefault
          ? ['route', 'expectedRevision']
          : ['ns', 'patch', 'expectedRevision', 'previousValue'],
      );
      const ns = isDefault ? 'agent-default-model' : text(args.ns);
      if (!isDefault && ns !== 'botharness-client') throw new TobError('unsupported-setting');
      const expected = revision(args.expectedRevision);
      const current = settings(ns);
      same(current.revision, expected);
      const patch = isDefault ? object(route(args.route)) : object(args.patch);
      if (!isDefault) {
        keys(patch, runtimeFields);
        if (!Object.keys(patch).length) throw new TobError('invalid-input');
        for (const [key, value] of Object.entries(patch)) {
          if (
            key === 'assignmentConcurrencyLimit'
              ? !Number.isInteger(value) || Number(value) < 1 || Number(value) > 32
              : typeof value !== 'boolean'
          )
            throw new TobError('invalid-setting');
        }
        const previous = object(args.previousValue);
        same(Object.keys(previous).sort(), Object.keys(patch).sort());
        same(
          previous,
          Object.fromEntries(Object.keys(patch).map((key) => [key, current.value[key]])),
        );
      } else await validate([route(patch)]);
      return prepared(
        command,
        ns,
        isDefault ? current.value : args.previousValue,
        patch,
        expected,
        async (guard, beforeEffect) => {
          if (isDefault) await validate([route(patch)]);
          guard();
          same(settings(ns), current);
          try {
            beforeEffect?.();
            if (isDefault) await native().replace(ns, patch, expected);
            else await native().update(ns, patch, expected);
          } catch (error) {
            if ((error as { code?: string }).code === 'SETTINGS_CONFLICT')
              throw new TobError('stale-setting');
            throw new TobError('setting-outcome-uncertain');
          }
          try {
            guard();
          } catch {
            throw new TobError('setting-outcome-uncertain');
          }
          const saved = settings(ns);
          if (
            Object.entries(patch).some(
              ([key, value]) => !isDeepStrictEqual(saved.value[key], value),
            ) ||
            (isDefault && !isDeepStrictEqual(saved.value, patch))
          )
            throw new TobError('setting-readback-mismatch');
          if (!isDefault) deps.runtimeChanged?.(patch);
          return isDefault ? { route: saved.value, revision: saved.revision } : saved;
        },
      );
    }
    if (command.startsWith('model-preset-') && command !== 'model-preset-apply') {
      const update = command === 'model-preset-update';
      keys(args, [
        'name',
        'orchestrator',
        'assignmentDefault',
        'assignmentModels',
        ...(update ? ['id', 'expectedRevision'] : []),
      ]);
      const id = update ? text(args.id) : undefined;
      const current = id ? deps.presets.get(id) : undefined;
      if (update && !current) throw new TobError('unknown-preset');
      const expected = update ? revision(args.expectedRevision) : undefined;
      if (current) same(current.revision, expected);
      const name = text(args.name);
      if (name.length > 100) throw new TobError('invalid-input');
      const orchestrator = route(args.orchestrator),
        assignmentDefault = route(args.assignmentDefault);
      const assignmentModels =
        args.assignmentModels === undefined
          ? current?.assignmentModels
          : choices(args.assignmentModels);
      const patch = {
        name,
        orchestrator,
        assignmentDefault,
        ...(assignmentModels ? { assignmentModels } : {}),
      };
      const routes = [
        orchestrator,
        ...assignmentRoutes(
          assignmentDefault,
          assignmentModels ?? assignmentModelsOf({ assignmentDefault }),
        ),
      ];
      await validate(routes);
      return prepared(
        command,
        id ?? 'model-presets',
        current ?? null,
        patch,
        expected,
        async (guard, beforeEffect) => {
          await validate(routes);
          guard();
          if (id) same(deps.presets.get(id), current);
          if (
            deps.presets
              .list()
              .some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase())
          )
            throw new TobError('preset-name-conflict');
          beforeEffect?.();
          const saved = id
            ? deps.presets.update(id, { ...patch, expectedRevision: expected! })
            : deps.presets.create(patch);
          if (!saved) throw new TobError('unknown-preset');
          return { preset: saved };
        },
      );
    }
    const slug = text(args.slug),
      current = plan(slug),
      expected = revision(args.expectedRevision);
    same(current.revision, expected);
    let routes: ModelRoute[] = [];
    let patch: Record<string, unknown>;
    let apply: () => ReturnType<PersonaBotRegistry['inheritModel']>;
    let checkExtra = () => {};
    if (command === 'model-preset-apply') {
      keys(args, ['slug', 'presetId', 'expectedRevision', 'expectedPresetRevision']);
      const id = text(args.presetId),
        preset = deps.presets.get(id);
      if (!preset) throw new TobError('unknown-preset');
      same(preset.revision, revision(args.expectedPresetRevision));
      patch = { presetId: id, presetRevision: preset.revision, plan: preset };
      routes = [
        preset.orchestrator,
        ...assignmentRoutes(preset.assignmentDefault, assignmentModelsOf(preset)),
      ];
      checkExtra = () => same(deps.presets.get(id), preset);
      apply = () => deps.registry.applyModelPreset(slug, preset);
    } else if (command === 'model-plan-inherit') {
      keys(args, ['slug', 'expectedRevision']);
      patch = { inherit: true };
      apply = () => deps.registry.inheritModel(slug, expected);
    } else if (command === 'model-plan-customize') {
      keys(args, ['slug', 'orchestrator', 'expectedRevision']);
      if (current.legacyModel) throw new TobError('legacy-model-repair-required');
      const orchestrator = route(args.orchestrator);
      patch = { orchestrator };
      routes = [orchestrator];
      apply = () => deps.registry.customizeModelPlan(slug, orchestrator, expected);
    } else {
      const full = command === 'model-plan-set';
      keys(args, [
        'slug',
        'assignmentDefault',
        'assignmentModels',
        'expectedRevision',
        ...(full ? ['orchestrator'] : []),
      ]);
      const assignmentDefault = route(args.assignmentDefault),
        assignmentModels = choices(args.assignmentModels);
      const orchestrator = full ? route(args.orchestrator) : undefined;
      if (!full && !current.plan) throw new TobError('model-plan-required');
      patch = { assignmentDefault, assignmentModels, ...(orchestrator ? { orchestrator } : {}) };
      routes = [
        ...(orchestrator ? [orchestrator] : []),
        ...assignmentRoutes(assignmentDefault, assignmentModels),
      ];
      apply = () =>
        orchestrator
          ? deps.registry.setModelPlan(
              slug,
              { orchestrator, assignmentDefault, assignmentModels },
              expected,
            )
          : deps.registry.setAssignmentModels(slug, assignmentDefault, assignmentModels, expected);
    }
    await validate(routes);
    return prepared(command, slug, current, patch, expected, async (guard, beforeEffect) => {
      await validate(routes);
      guard();
      same(plan(slug), current);
      checkExtra();
      beforeEffect?.();
      const result = apply();
      if (!result.ok)
        throw new TobError(result.reason === 'not-found' ? 'unknown-bot' : 'stale-setting');
      return plan(slug);
    });
  };
}
