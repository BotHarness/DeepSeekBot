import { Pressable } from 'react-native';
import { Text } from './text';
export interface ParticipantChoiceProps {
  id: string;
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange(): void;
}
export function ParticipantChoice({
  id,
  label,
  checked,
  disabled,
  onChange,
}: ParticipantChoiceProps) {
  return (
    <Pressable
      testID={`create-channel-bot-${id}`}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={onChange}
    >
      <Text>{`${checked ? '✓ ' : ''}${label}`}</Text>
    </Pressable>
  );
}
