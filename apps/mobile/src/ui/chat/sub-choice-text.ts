import { sameModel } from '@botharness/host-client/bot-settings';
import {
  engineCatalogModel,
  modelCatalogGroupEfforts,
  modelCatalogGroupFront,
  routingGroupEngineChoices,
  routingGroupEnginePresentation,
} from '@botharness/host-client/model-catalog';
import type {
  AssignmentEffortTarget,
  ModelSettingsState,
} from '@botharness/host-client/model-settings';
import { subSelectionOf, type SubChoice } from '@botharness/host-client/preset-sub';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';

import { t } from '../strings';
import { modelEntryLabel } from './composer-labels';

export function subChoiceKey(choice: SubChoice): string {
  return JSON.stringify(subSelectionOf(choice));
}

export function subChoiceTarget(choice: SubChoice): AssignmentEffortTarget {
  if (choice.kind === 'group') return { kind: 'group', id: choice.group };
  const selection = subSelectionOf(choice);
  return selection.kind === 'group' ? { kind: 'group', id: selection.group } : selection;
}

export interface SubChoiceView {
  title: string;
  detail: string;
  brand: ModelBrand | undefined;
  external: boolean;
}

function effortName(efforts: readonly { id: string; name: string }[], effort: string | undefined) {
  if (effort === undefined || effort === '') return t.modelSettings.providerDefault;
  return efforts.find((entry) => entry.id === effort)?.name ?? effort;
}

export function subChoiceView(
  value: ModelSettingsState,
  choice: SubChoice,
  engines: readonly RoutingGroupEngineOptions[] = [],
): SubChoiceView {
  switch (choice.kind) {
    case 'model': {
      const entry = value.models.find((item) => sameModel(item, choice));
      return {
        title: entry?.modelName ?? choice.model,
        detail: [
          entry?.providerName ?? choice.provider,
          effortName(entry?.efforts ?? [], choice.defaultEffort),
        ].join(' · '),
        brand: entry === undefined ? undefined : modelEntryLabel(entry).brand,
        external: false,
      };
    }
    case 'group': {
      const group = value.groups?.find((item) => item.id === choice.group);
      const front =
        group === undefined
          ? undefined
          : value.models.find((item) =>
              sameModel(item, modelCatalogGroupFront(group, value.models)),
            );
      return {
        title: group?.name ?? choice.group,
        detail: [
          front === undefined ? undefined : t.modelSettings.groupFront(front.modelName),
          effortName(
            group === undefined ? [] : modelCatalogGroupEfforts(group, value.models),
            choice.defaultEffort,
          ),
        ]
          .filter(Boolean)
          .join(' · '),
        brand: front === undefined ? undefined : modelEntryLabel(front).brand,
        external: false,
      };
    }
    case 'engine': {
      const accounts = engines.filter(
        (entry) =>
          entry.available &&
          entry.engine === choice.engine &&
          (choice.accountId === undefined || entry.accountId === choice.accountId),
      );
      const model =
        choice.model === undefined
          ? routingGroupEngineChoices(accounts).find((entry) => entry.isDefault)?.model
          : engineCatalogModel(accounts, { engine: choice.engine, model: choice.model });
      const account = accounts.find((entry) => entry.accountId === choice.accountId)?.accountName;
      const view = routingGroupEnginePresentation(
        {
          kind: 'engine',
          engine: choice.engine,
          ...(choice.model === undefined ? {} : { model: choice.model }),
          ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
        },
        t.routingGroup.engineRow,
        model?.name,
        account,
      );
      return {
        title: view.title,
        detail: [view.detail, effortName(model?.efforts ?? [], choice.effort)].join(' · '),
        brand: view.brand,
        external: true,
      };
    }
  }
}
