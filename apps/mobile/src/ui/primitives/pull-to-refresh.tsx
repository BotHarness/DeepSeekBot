import type { ReactElement } from 'react';
import { RefreshControl, type ScrollViewProps } from 'react-native';

export type PullToRefreshScrollProps = Pick<
  ScrollViewProps,
  'refreshControl' | 'nestedScrollEnabled'
>;

export type PullToRefreshProps = {
  refreshing: boolean;
  onRefresh: () => void;
  /** Renders the list; spread the props onto its scroll view. */
  children: (scroll: PullToRefreshScrollProps) => ReactElement;
};

/** iOS keeps the system UIRefreshControl that RefreshControl wraps. */
export function PullToRefresh({ refreshing, onRefresh, children }: PullToRefreshProps) {
  return children({
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />,
  });
}
