import { CheckmarkRow } from './checkmark-row';
import type { ParticipantChoiceProps } from './participant-choice';

export function ParticipantChoice({
  id,
  label,
  checked,
  disabled,
  onChange,
}: ParticipantChoiceProps) {
  return (
    <CheckmarkRow
      testID={`create-channel-bot-${id}`}
      label={label}
      selected={checked}
      disabled={disabled}
      onPress={onChange}
    />
  );
}
