import { useId, type ReactElement, type ReactNode } from 'react';
import { SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ModelCatalogEntryView } from './bridge.js';
import { Combobox, type ComboboxOption } from './combobox.js';
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
  const efforts = [
    { value: '', label: t('modelPreset.providerDefault') },
    ...(entry?.efforts ?? []).map((effort) => ({ value: effort.id, label: effort.name })),
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
      <Combobox
        value={entry === undefined ? '' : choice.key}
        options={options}
        onSelect={(key) => onChange({ key, effort: '' })}
        label={title}
        toggleLabel={t('modelPreset.showModels')}
        placeholder={
          entry === undefined ? t('modelPreset.routeUnavailable') : t('modelPreset.chooseModel')
        }
        emptyLabel={t('modelPreset.noMatch')}
        disabled={disabled}
        invalid={entry === undefined}
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
