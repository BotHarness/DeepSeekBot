import type { ActivityFilter, ActivitySort } from './activity-filters';
import { useStrings } from '../strings';
import { showActionMenu } from '../primitives/app-dialog';
import { HeaderAction } from './header-action';
import { ArchiveIcon, CheckIcon } from './icons';

export type ActivityOptions = {
  bots: ReadonlyArray<{ slug: string; name: string }>;
  channels: ReadonlyArray<{ id: string; name: string }>;
  filter: ActivityFilter;
  sort: ActivitySort;
  onFilter(next: ActivityFilter): void;
  onSort(next: ActivitySort): void;
};

export type ActivityManageItem = {
  key: string;
  label: string;
  icon: 'read' | 'clear';
  destructive?: boolean;
};

export type ActivityManage = {
  items: readonly ActivityManageItem[];
  run(key: string): void;
};

export type ActivityHeaderActionsProps = {
  filtered: boolean;
  searching: boolean;
  options: ActivityOptions;
  onFilter(): void;
  onSearch(): void;
  manage?: ActivityManage | undefined;
};

export function ActivityHeaderActions({
  filtered,
  searching,
  onFilter,
  onSearch,
  manage,
}: ActivityHeaderActionsProps) {
  const t = useStrings();
  return (
    <>
      {manage ? (
        <HeaderAction
          icon="more"
          label={t.activityMore}
          testID="activity-more"
          onPress={() =>
            showActionMenu(
              t.activityMore,
              manage.items.map((item) => ({
                text: item.label,
                icon: item.icon === 'read' ? CheckIcon : ArchiveIcon,
                ...(item.destructive === true ? { style: 'destructive' as const } : {}),
                onPress: () => manage.run(item.key),
              })),
            )
          }
        />
      ) : null}
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
