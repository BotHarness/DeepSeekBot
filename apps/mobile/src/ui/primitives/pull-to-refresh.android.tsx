import { Host, PullToRefreshBox, RNHostView } from '@expo/ui/jetpack-compose';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import type { PullToRefreshProps } from './pull-to-refresh';

export function PullToRefresh({ refreshing, onRefresh, children }: PullToRefreshProps) {
  const theme = useDesignTheme();
  return (
    <Host colorScheme={theme.scheme} seedColor={theme.color.accent} style={{ flex: 1 }}>
      <PullToRefreshBox
        isRefreshing={refreshing}
        onRefresh={onRefresh}
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
