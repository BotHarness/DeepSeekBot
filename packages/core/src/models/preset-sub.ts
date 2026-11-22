import {
  matchesPresetSubChoice,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type PresetSub,
  type PresetSubChoice,
  type PresetSubEngineChoice,
  type PresetSubEngineSelection,
} from '@botharness/host-protocol/preset-sub';
import type { RoutingTarget } from './routing-groups.js';
import type { ModelPreset, ModelPresetEngine, ModelRoute, PersonaBotModelPlan } from './presets.js';

export {
  ASSIGNMENT_MODEL_NOTE_MAX,
  isAssignmentGroupChoice,
  isAssignmentGroupOption,
  isAssignmentModelOption,
  isPresetSub,
  isPresetSubEngineSelection,
  matchesPresetSubChoice,
  type AssignmentGroupChoice,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type PresetSub,
  type PresetSubChoice,
  type PresetSubEngineChoice,
  type PresetSubEngineSelection,
  type PresetSubSelection,
} from '@botharness/host-protocol/preset-sub';

export function presetSubEngineTarget(
  choice: PresetSubEngineChoice,
): Extract<RoutingTarget, { kind: 'engine' }> {
  const { engine, accountId, model, effort } = choice;
  return {
    kind: 'engine',
    engine,
    ...(accountId === undefined ? {} : { accountId }),
    ...(model === undefined ? {} : { model }),
    ...(effort === undefined ? {} : { reasoningEffort: effort }),
  };
}

export function assignmentGroupOption(option: AssignmentGroupOption): AssignmentGroupOption {
  return {
    group: option.group,
    ...(option.allowedEfforts === undefined
      ? {}
      : { allowedEfforts: [...option.allowedEfforts], defaultEffort: option.defaultEffort! }),
    ...(option.note === undefined ? {} : { note: option.note }),
  };
}

export function assignmentModelsOf(
  plan: Pick<PersonaBotModelPlan, 'assignmentDefault' | 'assignmentModels' | 'sub'>,
): AssignmentModelOption[] {
  if (plan.sub !== undefined)
    return plan.sub.choices.flatMap((choice) => {
      if (choice.kind !== 'model') return [];
      const { kind: _kind, ...model } = choice;
      return [model];
    });
  if (plan.assignmentDefault === undefined) return [];
  return (
    plan.assignmentModels ?? [
      {
        provider: plan.assignmentDefault.provider,
        model: plan.assignmentDefault.model,
        allowedEfforts: [plan.assignmentDefault.reasoningEffort ?? ''],
        defaultEffort: plan.assignmentDefault.reasoningEffort ?? '',
      },
    ]
  );
}

export function presetSubFromLegacy(
  preset: Pick<
    ModelPreset,
    | 'assignmentFollowsMain'
    | 'assignmentModels'
    | 'assignmentGroups'
    | 'assignmentDefaultGroupId'
    | 'assignmentGroupOptions'
  > &
    Pick<PersonaBotModelPlan, 'assignmentDefault'>,
): PresetSub {
  const route = preset.assignmentDefault;
  if (preset.assignmentFollowsMain === true || route === undefined)
    return { choices: [], default: null };
  return {
    choices: [
      ...assignmentModelsOf({
        assignmentDefault: route,
        ...(preset.assignmentModels === undefined
          ? {}
          : { assignmentModels: preset.assignmentModels }),
      }).map((model) => ({ ...model, kind: 'model' as const })),
      ...(preset.assignmentGroups ?? []).map((group) => ({
        ...preset.assignmentGroupOptions?.find((option) => option.group === group),
        kind: 'group' as const,
        group,
      })),
    ],
    default:
      preset.assignmentDefaultGroupId === undefined
        ? { kind: 'model', provider: route.provider, model: route.model }
        : { kind: 'group', group: preset.assignmentDefaultGroupId },
  };
}

export function presetSubWithEngine(
  sub: PresetSub,
  engine: ModelPresetEngine | undefined,
): PresetSub {
  if (engine === undefined || sub.choices.some((choice) => choice.kind === 'engine')) return sub;
  const { effort: _effort, ...selection } = engine;
  return {
    choices: [...sub.choices, { kind: 'engine', ...engine }],
    default: { kind: 'engine', ...selection },
  };
}

export function storedPresetSub(preset: ModelPreset): PresetSub {
  return preset.sub ?? presetSubWithEngine(presetSubFromLegacy(preset), preset.assignmentEngine);
}

export function storedPlanSub(plan: PersonaBotModelPlan): PresetSub {
  return plan.sub ?? presetSubFromLegacy(plan);
}

export function mergeLegacyPresetSub(
  previous: PresetSub | undefined,
  next: PresetSub,
  keepModelFreeSub: boolean,
): PresetSub {
  const remaining = next.choices.filter((choice) => !keepModelFreeSub || choice.kind !== 'model');
  const retained: PresetSubChoice[] = [];
  for (const saved of previous?.choices ?? []) {
    const index = remaining.findIndex((choice) => matchesPresetSubChoice(choice, saved));
    const replacement = remaining[index];
    if (replacement !== undefined) {
      remaining.splice(index, 1);
      retained.push(
        saved.kind === 'engine' && replacement.kind === 'engine' && saved.note !== undefined
          ? { ...replacement, note: saved.note }
          : replacement,
      );
    } else if (
      saved.kind === 'engine' &&
      (previous?.default == null || !matchesPresetSubChoice(saved, previous.default))
    ) {
      retained.push(saved);
    }
  }
  return { ...next, choices: [...retained, ...remaining] };
}

export function effectivePresetSub(preset: ModelPreset): PresetSub {
  return effectiveSubForMain(preset, storedPresetSub(preset));
}

export function effectiveSubForMain(
  preset: Pick<
    ModelPreset,
    'orchestrator' | 'orchestratorGroupId' | 'orchestratorGroupEffort' | 'orchestratorEngine'
  >,
  sub: PresetSub,
): PresetSub {
  if (sub.default !== null) return sub;
  if (preset.orchestratorEngine !== undefined)
    return presetSubWithEngine(sub, preset.orchestratorEngine);
  const group = preset.orchestratorGroupId;
  if (group === undefined) return presetSubFromLegacy({ assignmentDefault: preset.orchestrator });
  const effort = preset.orchestratorGroupEffort;
  return {
    choices: [
      {
        kind: 'group',
        group,
        ...(effort === undefined
          ? {}
          : {
              allowedEfforts: [effort],
              defaultEffort: effort,
            }),
      },
    ],
    default: { kind: 'group', group },
  };
}

export function presetSubProjection(sub: PresetSub, main: ModelRoute) {
  const models = assignmentModelsOf({ sub });
  const groups = sub.choices.flatMap((choice) => {
    if (choice.kind !== 'group') return [];
    const { kind: _kind, ...option } = choice;
    return [option];
  });
  const selected = sub.default;
  const engine =
    selected?.kind === 'engine'
      ? sub.choices.find(
          (choice) => choice.kind === 'engine' && matchesPresetSubChoice(choice, selected),
        )
      : undefined;
  const model =
    selected?.kind === 'model'
      ? models.find(
          (choice) => choice.provider === selected.provider && choice.model === selected.model,
        )
      : models[0];
  const assignmentDefault =
    model === undefined
      ? main
      : {
          provider: model.provider,
          model: model.model,
          ...(model.defaultEffort === '' ? {} : { reasoningEffort: model.defaultEffort }),
        };
  return {
    assignmentDefault,
    ...(selected === null ? { assignmentFollowsMain: true as const } : {}),
    ...(models.length === 0 ? {} : { assignmentModels: models }),
    ...(groups.length === 0
      ? {}
      : {
          assignmentGroups: groups.map(({ group }) => group),
          assignmentGroupOptions: groups.filter(
            (option) => option.allowedEfforts !== undefined || option.note !== undefined,
          ),
        }),
    ...(selected?.kind === 'group' ? { assignmentDefaultGroupId: selected.group } : {}),
    ...(engine?.kind === 'engine' ? { assignmentEngine: cleanPresetSubEngine(engine) } : {}),
  };
}

export function resolveBotModelPlan(
  bot: { modelPlan?: PersonaBotModelPlan; model?: string },
  inherited: () => PersonaBotModelPlan | undefined,
): PersonaBotModelPlan | undefined {
  const plan = bot.modelPlan;
  if (plan === undefined) return bot.model === undefined ? inherited() : undefined;
  if (plan.assignmentDefault !== undefined)
    return plan.sub?.default === null
      ? { ...plan, sub: effectiveSubForMain(plan, plan.sub) }
      : plan;
  const defaults = inherited();
  if (defaults === undefined) return plan;
  const {
    revision: _revision,
    sourcePresetId: _sourcePresetId,
    sourcePresetName: _sourcePresetName,
    orchestrator: _orchestrator,
    orchestratorGroupId: _group,
    orchestratorGroupEffort: _effort,
    appliedAt: _appliedAt,
    ...assignment
  } = defaults;
  return { ...assignment, ...plan };
}

export function planSubProjection(
  sub: PresetSub,
  plan: Pick<
    PersonaBotModelPlan,
    'orchestrator' | 'orchestratorGroupId' | 'orchestratorGroupEffort'
  >,
) {
  const {
    assignmentFollowsMain,
    assignmentEngine: _engine,
    ...projection
  } = presetSubProjection(sub, plan.orchestrator);
  const group = plan.orchestratorGroupId;
  const effort = plan.orchestratorGroupEffort;
  return {
    ...projection,
    ...(assignmentFollowsMain && group !== undefined
      ? {
          assignmentGroups: [group],
          assignmentDefaultGroupId: group,
          ...(effort === undefined
            ? {}
            : {
                assignmentGroupOptions: [
                  { group, allowedEfforts: [effort], defaultEffort: effort },
                ],
              }),
        }
      : {}),
  };
}

function cleanPresetSubEngineSelection({
  engine,
  accountId,
  model,
}: PresetSubEngineSelection): PresetSubEngineSelection {
  return {
    kind: 'engine',
    engine,
    ...(accountId === undefined ? {} : { accountId }),
    ...(model === undefined ? {} : { model }),
  };
}

function cleanPresetSubEngine(choice: PresetSubEngineChoice): ModelPresetEngine {
  const { kind: _kind, ...selection } = cleanPresetSubEngineSelection(choice);
  return { ...selection, ...(choice.effort === undefined ? {} : { effort: choice.effort }) };
}

export function cleanPresetSub(sub: PresetSub): PresetSub {
  return {
    choices: sub.choices.map((choice) =>
      choice.kind === 'group'
        ? { kind: 'group', ...assignmentGroupOption(choice) }
        : choice.kind === 'engine'
          ? {
              kind: 'engine',
              ...cleanPresetSubEngine(choice),
              ...(choice.note === undefined ? {} : { note: choice.note }),
            }
          : {
              kind: 'model',
              provider: choice.provider,
              model: choice.model,
              allowedEfforts: [...choice.allowedEfforts],
              defaultEffort: choice.defaultEffort,
              ...(choice.note === undefined ? {} : { note: choice.note }),
            },
    ),
    default:
      sub.default === null
        ? null
        : sub.default.kind === 'group'
          ? { kind: 'group', group: sub.default.group }
          : sub.default.kind === 'engine'
            ? cleanPresetSubEngineSelection(sub.default)
            : { kind: 'model', provider: sub.default.provider, model: sub.default.model },
  };
}
