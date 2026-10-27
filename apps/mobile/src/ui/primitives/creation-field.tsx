import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';
import { space } from '../design/tokens';
import { TextField } from './text-field';
import { SettingsSection } from './settings-row';
import { Text } from './text';

export type CreationFieldProps = ComponentProps<typeof TextField> & {
  onSubmitValue?(value: string): void;
  supportingText?: string;
};

export function CreationField({ onSubmitValue, supportingText, ...props }: CreationFieldProps) {
  const field = (
    <TextField
      {...props}
      {...(onSubmitValue
        ? {
            submitBehavior: 'submit' as const,
            onSubmitEditing: (event) => onSubmitValue(event.nativeEvent.text),
          }
        : {})}
    />
  );
  if (Platform.OS !== 'android')
    return (
      <View style={{ gap: space.x2 }}>
        {props.accessibilityLabel ? <Text strong>{props.accessibilityLabel}</Text> : null}
        {field}
        {supportingText ? (
          <Text variant="meta" tone="muted">
            {supportingText}
          </Text>
        ) : null}
      </View>
    );
  return (
    <SettingsSection {...(props.accessibilityLabel ? { title: props.accessibilityLabel } : {})}>
      <View style={{ padding: space.x4 }}>
        {field}
        {supportingText ? (
          <Text variant="meta" tone="muted">
            {supportingText}
          </Text>
        ) : null}
      </View>
    </SettingsSection>
  );
}
