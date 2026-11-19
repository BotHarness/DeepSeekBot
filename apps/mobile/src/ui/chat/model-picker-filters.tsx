import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { space } from '../design/tokens';
import { useStrings } from '../strings';

export function ModelPickerFilters({ children }: { children: ReactNode }) {
  const t = useStrings();
  return (
    <ScrollView
      horizontal
      testID="model-family-filters"
      accessibilityLabel={t.modelSettings.families}
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{
        gap: space.x2,
        paddingHorizontal: space.x5,
        paddingVertical: space.x2,
      }}
    >
      {children}
    </ScrollView>
  );
}
