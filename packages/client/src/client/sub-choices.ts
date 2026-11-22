import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import type { SubChoice, SubChoices, SubSelection } from '@botharness/host-client/preset-sub';

export type { SubChoice, SubChoices, SubSelection };

export function cleanSubChoices(sub: SubChoices): SubChoices {
  return {
    choices: sub.choices.map((choice) => {
      if (choice.note === undefined || choice.note.trim() !== '') return choice;
      const { note: _note, ...rest } = choice;
      return rest as SubChoice;
    }),
    default: sub.default,
  };
}

export function subSelectionOf(choice: SubChoice): SubSelection {
  switch (choice.kind) {
    case 'model':
      return { kind: 'model', provider: choice.provider, model: choice.model };
    case 'group':
      return { kind: 'group', group: choice.group };
    case 'engine':
      return {
        kind: 'engine',
        engine: choice.engine,
        ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
        ...(choice.model === undefined ? {} : { model: choice.model }),
      };
  }
}

export function sameSubSelection(
  choice: SubChoice | SubSelection,
  selection: SubSelection,
): boolean {
  switch (selection.kind) {
    case 'model':
      return (
        choice.kind === 'model' &&
        choice.provider === selection.provider &&
        choice.model === selection.model
      );
    case 'group':
      return choice.kind === 'group' && choice.group === selection.group;
    case 'engine':
      return (
        choice.kind === 'engine' &&
        choice.engine === selection.engine &&
        choice.accountId === selection.accountId &&
        choice.model === selection.model
      );
  }
}

export interface LegacySubSource {
  sub?: SubChoices | undefined;
  assignmentDefault?: { provider: string; model: string; reasoningEffort?: string } | undefined;
  assignmentFollowsMain?: true | undefined;
  assignmentModels?: readonly {
    provider: string;
    model: string;
    allowedEfforts: string[];
    defaultEffort: string;
    note?: string;
  }[];
  assignmentGroups?: readonly string[] | undefined;
  assignmentDefaultGroupId?: string | undefined;
  assignmentGroupOptions?: readonly {
    group: string;
    allowedEfforts?: string[];
    defaultEffort?: string;
    note?: string;
  }[];
}

export function subOf(
  source: LegacySubSource | undefined,
  engine?: SubscriptionModel | null,
): SubChoices {
  if (source?.sub !== undefined) return source.sub;
  return withEngine(legacySubOf(source), engine);
}

export function withEngine(
  sub: SubChoices,
  engine: SubscriptionModel | null | undefined,
): SubChoices {
  if (engine == null || sub.choices.some((choice) => choice.kind === 'engine')) return sub;
  const selection = {
    kind: 'engine' as const,
    engine: engine.engine,
    ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
    ...(engine.model === undefined ? {} : { model: engine.model }),
  };
  return {
    choices: [
      ...sub.choices,
      { ...selection, ...(engine.effort === undefined ? {} : { effort: engine.effort }) },
    ],
    default: selection,
  };
}

function legacySubOf(source: LegacySubSource | undefined): SubChoices {
  const route = source?.assignmentDefault;
  if (source === undefined || source.assignmentFollowsMain === true || route === undefined)
    return { choices: [], default: null };
  const effort = route.reasoningEffort ?? '';
  const models = source.assignmentModels ?? [
    {
      provider: route.provider,
      model: route.model,
      allowedEfforts: [effort],
      defaultEffort: effort,
    },
  ];
  return {
    choices: [
      ...models.map((option) => ({ ...option, kind: 'model' as const })),
      ...(source.assignmentGroups ?? []).map((group) => ({
        ...source.assignmentGroupOptions?.find((option) => option.group === group),
        kind: 'group' as const,
        group,
      })),
    ],
    default:
      source.assignmentDefaultGroupId === undefined
        ? { kind: 'model', provider: route.provider, model: route.model }
        : { kind: 'group', group: source.assignmentDefaultGroupId },
  };
}
