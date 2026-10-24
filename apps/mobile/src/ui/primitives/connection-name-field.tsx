import { View } from 'react-native';
import { space } from '../design/tokens';
import { Text } from './text';
import { TextField } from './text-field';
import { useStrings } from '../strings';

export function ConnectionNameField({
  value,
  onChange,
  maxLength,
  disabled = false,
}: {
  value: string;
  onChange(value: string): void;
  maxLength: number;
  disabled?: boolean;
}) {
  const t = useStrings();
  return (
    <View style={{ gap: space.x2 }}>
      <Text variant="meta" tone="muted">
        {t.connectionName}
      </Text>
      <TextField
        accessibilityLabel={t.connectionName}
        value={value}
        onChangeText={onChange}
        placeholder={t.connectionNameOptional}
        maxLength={maxLength}
        editable={!disabled}
        returnKeyType="done"
      />
    </View>
  );
}
