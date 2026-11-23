import { View } from 'react-native';
import { space } from '../design/tokens';
import { SettingsSection } from './settings-row';
import { TextField, type TextFieldProps } from './text-field';

export function CardField(props: TextFieldProps) {
  return (
    <SettingsSection on="raised">
      <View style={{ padding: space.x4 }}>
        <TextField {...(props.multiline ? { numberOfLines: 3 } : {})} {...props} />
      </View>
    </SettingsSection>
  );
}
