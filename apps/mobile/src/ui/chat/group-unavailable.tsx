import { View } from 'react-native';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export type GroupUnavailableProps = { onBack(): void };

export function GroupUnavailable({ onBack }: GroupUnavailableProps) {
  const t = useStrings();
  return (
    <View
      testID="group-unavailable"
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: space.x6,
        gap: space.x5,
      }}
    >
      <Text variant="display" style={{ textAlign: 'center' }}>
        {t.groupUnavailableTitle}
      </Text>
      <Text tone="muted" style={{ textAlign: 'center' }}>
        {t.groupUnavailableBody}
      </Text>
      <Button label={t.backToChats} onPress={onBack} fit testID="group-unavailable-back" />
    </View>
  );
}
