import { useId, type ReactElement } from 'react';
import { Input } from './ds/input.js';
import { SegmentedControl } from './ds/segmented.js';
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
  const sortId = useId();
  const sortOptions = [
    { value: 'created' as const, label: t('market.sort.created') },
    { value: 'updated' as const, label: t('market.sort.updated') },
    { value: 'stars' as const, label: t('market.sort.stars') },
  ];
  return (
    <div className="bh-market-sort">
      <SegmentedControl
        id={sortId}
        label={t('market.sort.label')}
        value={value}
        options={sortOptions}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="bh-market-sort-menu">
        <Select
          label={t('market.sort.label')}
          value={value}
          options={sortOptions}
          disabled={disabled}
          align="start"
          onChange={onChange}
        />
      </span>
    </div>
  );
}
