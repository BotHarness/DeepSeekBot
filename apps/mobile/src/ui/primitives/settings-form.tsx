import type { ReactElement, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { space } from '../design/tokens';
import { useFloatingTabInset } from '../shell/floating-tab-inset';
import { useSettingsScroll } from './settings-scroll';

export type SettingsFormProps = {
  header?: ReactNode;
  testID?: string;
  children: ReactNode;
};

export function SettingsForm({ header, testID, children }: SettingsFormProps) {
  const theme = useDesignTheme();
  const tabInset = useFloatingTabInset();
  const scroll = useSettingsScroll();
  const Scroll = scroll?.ScrollView ?? ScrollView;
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      {header}
      <Scroll
        testID={testID}
        nestedScrollEnabled
        contentInsetAdjustmentBehavior="automatic"
        onScroll={scroll?.onScroll}
        scrollEventThrottle={scroll === undefined ? undefined : 1}
        style={{ flex: 1 }}
        contentContainerStyle={{
          gap: space.x6,
          padding: space.x5,
          paddingBottom: space.x5 + tabInset + (scroll?.travel ?? 0),
        }}
      >
        {children}
      </Scroll>
    </View>
  );
}

export function SettingsFormItem({ children }: { children: ReactElement }) {
  return children;
}
