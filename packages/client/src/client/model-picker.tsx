import { SegmentedControl } from './ds/segmented.js';
import { useId, type ReactElement, type ReactNode } from 'react';
import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import type { ComboboxOption } from './combobox.js';
import { ModelTrigger } from './model-trigger.js';
import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import { engineModelKey, type EngineId, type EngineModels } from './engine-choice.js';
import {
  catalogMenuItems,
  engineMenuKey,
  engineSignInKey,
  groupMenuId,
  modelMenuItems,
  selectedEngineMenuItem,
  type ModelMenuItem,
} from './model-menu.js';
import { modelCatalogGroupEfforts } from '@botharness/host-client/model-catalog';
import type { BotHarnessTranslate } from './locale.js';

interface ModelChoice {
  key: string;
  effort: string;
}

export function ModelPicker({
  title,
  hint,
  choice,
  catalog,
  options,
  groups = [],
  groupEffort = false,
  onChange,
  disabled,
  action,
  subscription,
  t,
}: {
  title: string;
  hint: string;
  choice: ModelChoice;
  catalog: readonly ModelCatalogEntryView[];
  options: readonly ComboboxOption[];
  groups?: readonly ModelCatalogGroupView[];
  groupEffort?: boolean;
  onChange: (choice: ModelChoice) => void;
  disabled: boolean;
  action?: ReactNode;
  subscription?:
    | {
        choice: SubscriptionModel | null;
        items: readonly ModelMenuItem[];
        models: EngineModels;
        onChange(choice: SubscriptionModel): void;
        signIn(engine: EngineId, accountId?: string): void;
      }
    | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const engine = subscription?.choice ?? null;
  const models =
    engine === null
      ? []
      : (subscription?.models[engineModelKey(engine.engine, engine.accountId)] ?? []);
  const selectedModel =
    engine?.model === undefined
      ? (models.find((model) => model.isDefault) ?? models[0])
      : models.find((model) => model.id === engine.model);
  const selectedEngine =
    engine === null ? undefined : selectedEngineMenuItem(engine, selectedModel, t);
  const shown =
    selectedEngine === undefined
      ? choice
      : { key: selectedEngine.value, effort: engine?.effort ?? '' };
  const entry = catalog.find((item) => JSON.stringify([item.provider, item.model]) === choice.key);
  const effortsOf = (key: string) => {
    const groupId = groupMenuId(key);
    const group = groups.find((item) => item.id === groupId);
    if (groupId !== undefined)
      return group === undefined || !groupEffort
        ? []
        : modelCatalogGroupEfforts(group, [...catalog]);
    return (
      catalog.find((item) => JSON.stringify([item.provider, item.model]) === key)?.efforts ?? []
    ).filter((effort) => effort.id !== '');
  };
  const items = [
    ...catalogMenuItems(catalog, t, groups).filter((item) => item.group !== undefined),
    ...modelMenuItems(options, catalog),
    ...(subscription?.items ?? []),
  ];
  if (selectedEngine !== undefined && !items.some((item) => item.value === shown.key))
    items.push(selectedEngine);
  const known = items.some((item) => item.value === shown.key);
  const efforts = [
    { value: '', label: t('modelPreset.providerDefault') },
    ...(engine === null ? effortsOf(choice.key) : (selectedModel?.efforts ?? [])).map((effort) => ({
      value: effort.id,
      label: effort.name,
    })),
  ];
  const heading = (
    <div className="bh-model-picker-heading">
      <strong>{title}</strong>
      <span>{hint}</span>
    </div>
  );
  return (
    <div className="bh-model-picker">
      {action === undefined ? (
        heading
      ) : (
        <div className="bh-model-picker-heading-row">
          {heading}
          {action}
        </div>
      )}
      <ModelTrigger
        label={title}
        items={items}
        value={shown.key}
        placeholder={
          entry === undefined && !known
            ? t('modelPreset.routeUnavailable')
            : t('modelPreset.chooseModel')
        }
        invalid={entry === undefined && !known}
        disabled={disabled}
        onSelect={(key) => {
          const item = items.find((entry) => entry.value === key);
          if (item?.engine !== undefined && subscription !== undefined) {
            if (key === engineSignInKey(item.engine, item.accountId))
              subscription.signIn(item.engine, item.accountId);
            else if (
              item.model !== undefined &&
              key === engineMenuKey(item.engine, item.model, item.accountId)
            ) {
              const accountKey = engineModelKey(item.engine, item.accountId);
              if (
                engine !== null &&
                engineModelKey(engine.engine, engine.accountId) === accountKey &&
                engine.model === item.model
              )
                return;
              const model = subscription.models[accountKey]?.find(
                (entry) => entry.id === item.model,
              );
              if (model === undefined) return;
              const effort = model.efforts.find((option) => option.id === model.defaultEffort);
              subscription.onChange({
                engine: item.engine,
                ...(item.accountId === undefined ? {} : { accountId: item.accountId }),
                model: model.id,
                ...(effort === undefined ? {} : { effort: effort.id }),
              });
            }
            return;
          }
          const kept = effortsOf(key).some((effort) => effort.id === choice.effort);
          const fallback = catalog.find(
            (item) => JSON.stringify([item.provider, item.model]) === key,
          )?.defaultEffort;
          onChange({ key, effort: kept ? choice.effort : (fallback ?? '') });
        }}
        t={t}
      />
      {efforts.length > 1 && (
        <div className="bh-model-picker-effort">
          <span>{t('modelPreset.effort')}</span>
          <SegmentedControl
            id={id}
            value={efforts.some((effort) => effort.value === shown.effort) ? shown.effort : ''}
            options={efforts}
            onChange={(effort) => {
              if (engine === null) onChange({ ...choice, effort });
              else if (subscription !== undefined) {
                const { effort: _removed, ...selected } = engine;
                subscription.onChange({
                  ...selected,
                  ...(selectedModel === undefined ? {} : { model: selectedModel.id }),
                  ...(effort === '' ? {} : { effort }),
                });
              }
            }}
            label={`${title} · ${t('modelPreset.effort')}`}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
