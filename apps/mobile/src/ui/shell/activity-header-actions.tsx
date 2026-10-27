import type { ActivityFilter, ActivitySort } from './activity-filters';
import { useStrings } from '../strings';
import { HeaderAction } from './header-action';

export type ActivityOptions = {
  bots: ReadonlyArray<{ slug: string; name: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
  filter: ActivityFilter;
  sort: ActivitySort;
  onFilter(next: ActivityFilter): void;
  onSort(next: ActivitySort): void;
};

export type ActivityHeaderActionsProps = {
  filtered: boolean;
  searching: boolean;
  options: ActivityOptions;
  onFilter(): void;
  onSearch(): void;
};

export function ActivityHeaderActions({
  filtered,
  searching,
  onFilter,
  onSearch,
}: ActivityHeaderActionsProps) {
  const t = useStrings();
  return (
    <>
      <HeaderAction
        icon="filter"
        label={t.activityOptions}
        testID="activity-filter-button"
        active={filtered}
        onPress={onFilter}
      />
      <HeaderAction
        icon="search"
        label={t.activitySearch}
        testID="activity-search-button"
        active={searching}
        onPress={onSearch}
      />
    </>
  );
}
