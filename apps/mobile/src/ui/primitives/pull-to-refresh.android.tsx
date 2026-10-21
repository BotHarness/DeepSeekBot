import { Host, PullToRefreshBox, RNHostView } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import type { PullToRefreshProps } from './pull-to-refresh';

/**
 * Compose's Material 3 PullToRefreshBox, whose indicator is the same expressive LoadingIndicator a
 * page shows while it waits. RefreshControl would draw SwipeRefreshLayout's older spinner. The
 * hosted list scrolls with nested scrolling on, so its overscroll at the top reaches the box.
 */
export function PullToRefresh({ refreshing, onRefresh, children }: PullToRefreshProps) {
  const theme = useDesignTheme();
  return (
    <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={{ flex: 1 }}>
      <PullToRefreshBox
        isRefreshing={refreshing}
        onRefresh={onRefresh}
        // The indicator's own align modifier is a no-op outside BoxScope; the box centres it.
        contentAlignment="topCenter"
        indicator={{ color: theme.color.accent }}
      >
        <RNHostView>
          <View style={{ flex: 1 }}>{children({ nestedScrollEnabled: true })}</View>
        </RNHostView>
      </PullToRefreshBox>
    </Host>
  );
}
