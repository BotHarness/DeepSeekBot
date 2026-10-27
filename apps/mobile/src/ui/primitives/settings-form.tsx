import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';

export type SettingsFormProps = {
  header?: ReactNode;
  testID?: string;
  children: ReactNode;
};

export function SettingsForm({ header, testID, children }: SettingsFormProps) {
  const theme = useDesignTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      {header}
      <ScrollView
        testID={testID}
        nestedScrollEnabled
        contentInsetAdjustmentBehavior="automatic"
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space.x6, padding: space.x5 }}
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function SettingsFormItem({ children }: { children: ReactElement }) {
  return children;
}
