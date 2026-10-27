import { useState } from 'react';
import { View } from 'react-native';
import type { SceneRendererProps } from 'react-native-tab-view';
import { GestureDetector } from 'react-native-gesture-handler';

import { useDesignTheme } from '../design/theme';
import { PrimaryTabRow } from '../primitives/primary-tab-row.android';
import { useStrings } from '../strings';
import type { ActivitySection } from './activity-filters';
import { ACTIVITY_TABS, activityStripSwipe, type ActivityTab } from './activity-tab-strip';

export { ACTIVITY_TABS, type ActivityTab } from './activity-tab-strip';

export function ActivityTabs({
  selected,
  onSelect,
}: {
  selected: ActivitySection;
  position: SceneRendererProps['position'];
  onSelect(section: ActivityTab['key']): void;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const [width, setWidth] = useState(0);
  const swipe = activityStripSwipe(selected, width / ACTIVITY_TABS.length, onSelect);
  return (
    <GestureDetector gesture={swipe}>
      <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
        <PrimaryTabRow
          testID="activity-tabs"
          tabs={ACTIVITY_TABS.map(({ key }) => ({ value: key, label: t.inboxSections[key] }))}
          value={selected}
          onChange={onSelect}
          containerColor={theme.color.base}
        />
      </View>
    </GestureDetector>
  );
}
