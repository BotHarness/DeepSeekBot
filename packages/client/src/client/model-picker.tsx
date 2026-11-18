import { SegmentedControl } from './ds/segmented.js';
import { useId, type ReactElement, type ReactNode } from 'react';
import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import type { ComboboxOption } from './combobox.js';
import { ModelTrigger } from './model-trigger.js';
import { catalogMenuItems, groupMenuId, modelMenuItems } from './model-menu.js';
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
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
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
  ];
  const known = items.some((item) => item.value === choice.key);
  const efforts = [
    { value: '', label: t('modelPreset.providerDefault') },
    ...effortsOf(choice.key).map((effort) => ({
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
        value={choice.key}
        placeholder={
          entry === undefined && !known
            ? t('modelPreset.routeUnavailable')
            : t('modelPreset.chooseModel')
        }
        invalid={entry === undefined && !known}
        disabled={disabled}
        onSelect={(key) => {
          const kept = effortsOf(key).some((effort) => effort.id === choice.effort);
          const fallback = catalog.find(
            (item) => JSON.stringify([item.provider, item.model]) === key,
          )?.defaultEffort;
          onChange({ key, effort: kept ? choice.effort : (fallback ?? '') });
        }}
        t={t}
      />
      {(entry !== undefined || groupMenuId(choice.key) !== undefined) && efforts.length > 1 && (
        <div className="bh-model-picker-effort">
          <span>{t('modelPreset.effort')}</span>
          <SegmentedControl
            id={id}
            value={efforts.some((effort) => effort.value === choice.effort) ? choice.effort : ''}
            options={efforts}
            onChange={(effort) => onChange({ ...choice, effort })}
            label={`${title} · ${t('modelPreset.effort')}`}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}
