import { Checkbox, Host, Row, Text } from '@expo/ui/jetpack-compose';
import { fillMaxWidth, toggleable, weight, testID } from '@expo/ui/jetpack-compose/modifiers';
import { useDesignTheme } from '../design/theme';
import type { ParticipantChoiceProps } from './participant-choice';
export function ParticipantChoice({
  id,
  label,
  checked,
  disabled,
  onChange,
}: ParticipantChoiceProps) {
  const theme = useDesignTheme();
  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
    >
      <Row
        verticalAlignment="center"
        modifiers={[
          fillMaxWidth(),
          testID(`create-channel-bot-${id}`),
          toggleable(checked, onChange, { role: 'checkbox', enabled: !disabled }),
        ]}
      >
        <Checkbox value={checked} enabled={!disabled} />
        <Text modifiers={[weight(1)]}>{label}</Text>
      </Row>
    </Host>
  );
}
