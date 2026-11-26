import { View } from 'react-native';
import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { groupUnavailableCopy, type GroupUnavailableProps } from './group-unavailable-copy';

export function GroupUnavailable({ onBack, reason }: GroupUnavailableProps) {
  const t = useStrings();
  if (reason === undefined) return <View testID="group-unavailable" style={{ flex: 1 }} />;
  const copy = groupUnavailableCopy(t, reason);
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
        {copy.title}
      </Text>
      <Text tone="muted" style={{ textAlign: 'center' }}>
        {copy.body}
      </Text>
      <Button label={t.backToChats} onPress={onBack} fit testID="group-unavailable-back" />
    </View>
  );
}
