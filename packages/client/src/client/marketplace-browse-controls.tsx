import { useId, type ReactElement } from 'react';
import { Input } from './ds/input.js';
import { SegmentedControl, type SegmentedControlOption } from './ds/segmented.js';
import { Select } from './ds/select.js';
import type { BotHarnessTranslate } from './locale.js';
import { committedEnter } from './marketplace-submit.js';
import type { Filters } from './marketplace.js';

const MAX_QUERY_LENGTH = 100;

export function MarketplaceSearchField({
  label,
  placeholder,
  maxLength = MAX_QUERY_LENGTH,
  value,
  onChange,
  onSearch,
}: {
  label: string;
  placeholder: string;
  maxLength?: number;
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
}): ReactElement {
  return (
    <Input
      type="search"
      aria-label={label}
      placeholder={placeholder}
      autoComplete="off"
      enterKeyHint="search"
      maxLength={maxLength}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (!committedEnter(event)) return;
        event.preventDefault();
        onSearch();
      }}
    />
  );
}

export function MarketplaceBotSort({
  value,
  disabled,
  onChange,
  t,
}: {
  value: Filters['sort'];
  disabled: boolean;
  onChange: (value: Filters['sort']) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const options = [
    { value: 'created' as const, label: t('market.sort.created') },
    { value: 'updated' as const, label: t('market.sort.updated') },
    { value: 'stars' as const, label: t('market.sort.stars') },
  ];
  return (
    <MarketplaceSortTabs
      value={value}
      options={options}
      disabled={disabled}
      onChange={onChange}
      label={t('market.sort.label')}
    />
  );
}

export function MarketplaceSortTabs<Value extends string>({
  value,
  options,
  disabled = false,
  onChange,
  label,
  separateTrack = false,
}: {
  value: Value;
  options: readonly SegmentedControlOption<Value>[];
  disabled?: boolean;
  onChange: (value: Value) => void;
  label: string;
  separateTrack?: boolean;
}): ReactElement {
  const sortId = useId();
  return (
    <div className="bh-market-sort">
      <SegmentedControl
        id={sortId}
        label={label}
        value={value}
        options={options}
        disabled={disabled}
        onChange={onChange}
        separateTrack={separateTrack}
      />
      <span className="bh-market-sort-menu">
        <Select
          label={label}
          value={value}
          options={options}
          disabled={disabled}
          align="start"
          onChange={onChange}
        />
      </span>
    </div>
  );
}
