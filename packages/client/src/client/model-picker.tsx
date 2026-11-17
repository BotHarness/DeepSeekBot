import { SegmentedControl } from './ds/segmented.js';
import { useId, type ReactElement, type ReactNode } from 'react';
import type { ModelCatalogEntryView } from './bridge.js';
import type { ComboboxOption } from './combobox.js';
import { ModelTrigger } from './model-trigger.js';
import { modelMenuItems } from './model-menu.js';
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
  onChange: (choice: ModelChoice) => void;
  disabled: boolean;
  action?: ReactNode;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const entry = catalog.find((item) => JSON.stringify([item.provider, item.model]) === choice.key);
  const items = modelMenuItems(options, catalog);
  const efforts = [
    { value: '', label: t('modelPreset.providerDefault') },
    ...(entry?.efforts ?? []).map((effort) => ({
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
          entry === undefined && !options.some((option) => option.value === choice.key)
            ? t('modelPreset.routeUnavailable')
            : t('modelPreset.chooseModel')
        }
        invalid={entry === undefined && !options.some((option) => option.value === choice.key)}
        disabled={disabled}
        onSelect={(key) => onChange({ key, effort: '' })}
        t={t}
      />
      {entry !== undefined && efforts.length > 1 && (
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
