import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

import { searchAppBarHeight } from '../design/material-search';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import type { ChatsSearchBarProps, ChatsSearchResult } from './chats-search-bar';

type NativeSearchBarProps = ViewProps & {
  placeholder: string;
  navigationLabel: string;
  closeLabel: string;
  clearLabel: string;
  emptyText: string;
  busy: boolean;
  results: ChatsSearchResult[];
  dark: boolean;
  surfaceContent: string;
  muted: string;
  surface: string;
  base: string;
  accent: string;
  accentContent: string;
  onQueryChange(event: { nativeEvent: { value: string } }): void;
  onExpandedChange(event: { nativeEvent: { expanded: boolean } }): void;
  onPick(event: { nativeEvent: { key: string } }): void;
  onNavigation(): void;
};

const NativeSearchBar = requireNativeView<NativeSearchBarProps>('MaterialSearchBar');

export function ChatsSearchBar(props: ChatsSearchBarProps) {
  const t = useStrings();
  const theme = useDesignTheme();
  return (
    <NativeSearchBar
      testID="chats-search-bar"
      style={{ flex: 1, height: searchAppBarHeight(theme.fontScale) }}
      placeholder={props.placeholder}
      navigationLabel={t.workspaces}
      closeLabel={t.closeSearch}
      clearLabel={t.activityClearSearch}
      emptyText={t.searchNoResults}
      busy={props.busy}
      results={props.results}
      dark={theme.scheme === 'dark'}
      surfaceContent={theme.color.fg}
      muted={theme.color.muted}
      surface={theme.layer.raised.fill}
      base={theme.color.base}
      accent={theme.color.accent}
      accentContent={theme.color.onAccent}
      onQueryChange={(event) => props.onQuery(event.nativeEvent.value)}
      onExpandedChange={(event) => props.onExpanded(event.nativeEvent.expanded)}
      onPick={(event) => props.onPick(event.nativeEvent.key)}
      onNavigation={props.onNavigation}
    />
  );
}
