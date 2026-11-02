import type { ReactElement } from 'react';
import { RefreshControl, type ScrollViewProps } from 'react-native';

export type PullToRefreshScrollProps = Pick<
  ScrollViewProps,
  'refreshControl' | 'nestedScrollEnabled'
>;

export type PullToRefreshProps = {
  refreshing: boolean;
  onRefresh: () => void;
  children: (scroll: PullToRefreshScrollProps) => ReactElement;
};

export function PullToRefresh({ refreshing, onRefresh, children }: PullToRefreshProps) {
  return children({
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
  });
}
