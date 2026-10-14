import { memo } from 'react';
import { View } from 'react-native';

import { space } from '../design/tokens';
import { useMinuteClock } from '../minute-clock';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { separatorLabel } from './message-groups';

export const TimeSeparator = memo(function TimeSeparator({ at }: { at: string }) {
  const now = useMinuteClock();
  return (
    <View style={{ alignItems: 'center', paddingTop: space.x5, paddingBottom: space.x1 }}>
      <Text variant="meta" tone="subtle">
        {separatorLabel(at, now, t.yesterday)}
      </Text>
    </View>
  );
});
