import { Host, type PrimitiveBaseProps } from '@expo/ui/jetpack-compose';
import { testID } from '@expo/ui/jetpack-compose/modifiers';
import { requireNativeView } from 'expo';

import { searchAppBarHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { ChatsSearchBarProps, ChatsSearchResult } from './chats-search-bar';

type NativeSearchBarProps = PrimitiveBaseProps & {
  placeholder: string;
  navigationLabel: string;
  closeLabel: string;
  clearLabel: string;
  emptyText: string;
  busy: boolean;
  notice: string;
  retryLabel: string;
  onRetry(): void;
  results: ChatsSearchResult[];
  onQueryChange(event: { nativeEvent: { value: string } }): void;
  onExpandedChange(event: { nativeEvent: { expanded: boolean } }): void;
  onPick(event: { nativeEvent: { key: string } }): void;
  onNavigation(): void;
};

const NativeSearchBar = requireNativeView<NativeSearchBarProps>(
  'MaterialSearchBar',
  'MaterialSearchBarView',
);

export function ChatsSearchBar(props: ChatsSearchBarProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      style={{ flex: 1, height: searchAppBarHeight(theme.fontScale) }}
    >
      <NativeSearchBar
        modifiers={[testID('chats-search-bar')]}
        placeholder={props.placeholder}
        navigationLabel={t.workspaces}
        closeLabel={t.closeSearch}
        clearLabel={t.activityClearSearch}
        emptyText={t.searchNoResults}
        busy={props.busy}
        notice={props.notice ?? ''}
        retryLabel={props.retryLabel ?? ''}
        onRetry={() => props.onRetry?.()}
        results={props.results}
        onQueryChange={(event) => props.onQuery(event.nativeEvent.value)}
        onExpandedChange={(event) => props.onExpanded(event.nativeEvent.expanded)}
        onPick={(event) => props.onPick(event.nativeEvent.key)}
        onNavigation={props.onNavigation}
      />
    </Host>
  );
}
