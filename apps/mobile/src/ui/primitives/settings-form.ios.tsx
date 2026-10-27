import { Form, Host, RNHostView, Section, VStack } from '@expo/ui/swift-ui';
import { listRowBackground, listRowInsets, tint } from '@expo/ui/swift-ui/modifiers';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { systemColors } from '../design/system-tokens';
import { useDesignTheme } from '../design/theme';
import { SettingsFormContext, useSettingsFormPlace } from './settings-form-context';
import type { SettingsFormProps } from './settings-form';

export function SettingsForm({ header, testID, children }: SettingsFormProps) {
  const theme = useDesignTheme();
  return (
    <View style={{ flex: 1, backgroundColor: systemColors.groupedBackground }}>
      {header}
      <Host style={{ flex: 1 }} colorScheme={theme.scheme}>
        <Form {...(testID === undefined ? {} : { testID })} modifiers={[tint(theme.color.accent)]}>
          <SettingsFormContext.Provider value="form">{children}</SettingsFormContext.Provider>
        </Form>
      </Host>
    </View>
  );
}

export function SettingsFormItem({ children }: { children: ReactElement }) {
  const place = useSettingsFormPlace();
  if (place === false) return children;
  const row = <HostedRow>{children}</HostedRow>;
  return place === 'section' ? row : <Section>{row}</Section>;
}

function HostedRow({ children }: { children: ReactElement }) {
  return (
    <VStack
      modifiers={[
        listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
        listRowBackground('clear'),
      ]}
    >
      <RNHostView matchContents={{ vertical: true }}>
        <SettingsFormContext.Provider value={false}>
          <View>{children}</View>
        </SettingsFormContext.Provider>
      </RNHostView>
    </VStack>
  );
}
