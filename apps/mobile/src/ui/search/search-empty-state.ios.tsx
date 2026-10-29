import { ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import { accessibilityIdentifier } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import type { SearchEmptyStateProps } from './search-empty-state';
export function SearchEmptyState({ title }: SearchEmptyStateProps) {
  const theme = useDesignTheme();
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme}>
      <ContentUnavailableView
        title={title}
        systemImage="magnifyingglass"
        modifiers={[accessibilityIdentifier('search-empty-state')]}
      />
    </Host>
  );
}
