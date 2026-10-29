import { Form, Host, RNHostView, Section, VStack } from '@expo/ui/swift-ui';
import {
  listRowBackground,
  listRowInsets,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import type { ReactElement } from 'react';
import { View } from 'react-native';

import { useDesignTheme } from '../design/theme';
import { useFloatingTabInset } from '../shell/floating-tab-inset';
import { SettingsFormContext, useSettingsFormPlace } from './settings-form-context';
import type { SettingsFormProps } from './settings-form';

export function SettingsForm({ header, testID, children }: SettingsFormProps) {
  const theme = useDesignTheme();
  const tabInset = useFloatingTabInset();
  const form = (
    <Host style={{ flex: 1, backgroundColor: theme.overlay.fill }} colorScheme={theme.scheme}>
      <Form
        {...(testID === undefined ? {} : { testID })}
        modifiers={[scrollContentBackground('hidden'), tint(theme.color.accent)]}
      >
        <SettingsFormContext.Provider value="form">
          {children}
          {tabInset > 0 ? (
            <SettingsFormItem>
              <View style={{ height: tabInset }} />
            </SettingsFormItem>
          ) : null}
        </SettingsFormContext.Provider>
      </Form>
    </Host>
  );
  if (header === undefined) return form;
  return (
    <View style={{ flex: 1, backgroundColor: theme.overlay.fill }}>
      {header}
      {form}
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
