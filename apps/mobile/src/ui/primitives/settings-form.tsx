import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useFloatingTabInset } from '../shell/floating-tab-inset';

export type SettingsFormProps = {
  header?: ReactNode;
  testID?: string;
  children: ReactNode;
};

export function SettingsForm({ header, testID, children }: SettingsFormProps) {
  const theme = useDesignTheme();
  const tabInset = useFloatingTabInset();
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      {header}
      <ScrollView
        testID={testID}
        nestedScrollEnabled
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: space.x6,
          padding: space.x5,
          paddingBottom: space.x5 + tabInset,
        }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function SettingsFormItem({ children }: { children: ReactElement }) {
  return children;
}
