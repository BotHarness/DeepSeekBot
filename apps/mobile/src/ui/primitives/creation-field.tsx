import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';
import { space } from '../design/tokens';
import { TextField } from './text-field';
import { SettingsSection } from './settings-row';
import { Text } from './text';

export type CreationFieldProps = ComponentProps<typeof TextField> & {
  onSubmitValue?(value: string): void;
};

export function CreationField({ onSubmitValue, ...props }: CreationFieldProps) {
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
      </View>
    );
  return (
    <SettingsSection {...(props.accessibilityLabel ? { title: props.accessibilityLabel } : {})}>
      <View style={{ padding: space.x4 }}>{field}</View>
    </SettingsSection>
  );
}
