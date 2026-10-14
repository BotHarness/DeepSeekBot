import { View } from 'react-native';

import { space } from '../design/tokens';
import { Text } from '../primitives/text';
import { t } from '../strings';
import { separatorLabel } from './message-groups';

export function TimeSeparator({ at, now }: { at: string; now: Date }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: space.x5, paddingBottom: space.x1 }}>
      <Text variant="meta" tone="subtle">
        {separatorLabel(at, now, t.yesterday)}
      </Text>
    </View>
  );
}
