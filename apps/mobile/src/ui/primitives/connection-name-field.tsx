import { View } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { edge, radius, space } from '../design/tokens';
import { Text } from './text';
import { TextInput } from './system-text';
import { t } from '../strings';

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
  const theme = useDesignTheme();
  return (
    <View style={{ gap: space.x2 }}>
      <Text variant="meta" tone="muted">
        {t.connectionName}
      </Text>
      <TextInput
        accessibilityLabel={t.connectionName}
        value={value}
        onChangeText={onChange}
        placeholder={t.connectionNameOptional}
        placeholderTextColor={theme.color.subtle}
        maxLength={maxLength}
        editable={!disabled}
        returnKeyType="done"
        style={{
          minHeight: theme.touch,
          padding: space.x3,
          borderWidth: edge.hairline,
          borderColor: theme.layer.raised.edge,
          borderRadius: radius.md,
          color: theme.color.fg,
          backgroundColor: theme.layer.raised.fill,
          fontSize: theme.type.body.size,
        }}
      />
    </View>
  );
}
