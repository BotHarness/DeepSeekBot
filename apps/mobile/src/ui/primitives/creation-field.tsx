import type { ComponentProps } from 'react';
import { Platform, View } from 'react-native';
import { space } from '../design/tokens';
import { TextField } from './text-field';
import { SettingsSection } from './settings-row';
import { Text } from './text';

export function CreationField(props: ComponentProps<typeof TextField>) {
  if (Platform.OS !== 'android')
    return (
      <View style={{ gap: space.x2 }}>
        {props.accessibilityLabel ? <Text strong>{props.accessibilityLabel}</Text> : null}
        <TextField {...props} />
      </View>
    );
  return (
    <SettingsSection {...(props.accessibilityLabel ? { title: props.accessibilityLabel } : {})}>
      <View style={{ padding: space.x4 }}>
        <TextField {...props} />
      </View>
    </SettingsSection>
  );
}
