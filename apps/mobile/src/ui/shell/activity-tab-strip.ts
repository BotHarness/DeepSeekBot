import { I18nManager } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { swipeRow } from '../design/tokens';
import type { ActivitySection } from './activity-filters';

export const ACTIVITY_TABS = [{ key: 'action' }, { key: 'replies' }, { key: 'unread' }] as const;
export type ActivityTab = (typeof ACTIVITY_TABS)[number];

export function steppedActivityTab(
  selected: ActivitySection,
  forward: boolean,
): ActivityTab['key'] | undefined {
  const current = Math.max(
    0,
    ACTIVITY_TABS.findIndex((tab) => tab.key === selected),
  );
  return ACTIVITY_TABS[current + (forward ? 1 : -1)]?.key;
}

export function activityStripSwipe(
  selected: ActivitySection,
  tabWidth: number,
  onSelect: (section: ActivityTab['key']) => void,
) {
  const direction = I18nManager.isRTL ? -1 : 1;
  const step = (forward: boolean) => {
    const next = steppedActivityTab(selected, forward);
    if (next !== undefined) onSelect(next);
  };
  return Gesture.Pan()
    .activeOffsetX([-swipeRow.start, swipeRow.start])
    .failOffsetY([-swipeRow.verticalFail, swipeRow.verticalFail])
    .onEnd((event) => {
      const travel = event.translationX * direction;
      const velocity = event.velocityX * direction;
      if (Math.abs(travel) < tabWidth / 3 && Math.abs(velocity) < swipeRow.flick) return;
      runOnJS(step)(travel < 0);
    });
}
