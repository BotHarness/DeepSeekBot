import { View } from 'react-native';

import { space } from '../design/tokens';
import { Button } from '../primitives/button';

export function WorkspaceAddButton({
  label,
  onPress,
}: {
  label: string;
  glass?: boolean;
  onPress(): void;
}) {
  return (
    <View style={{ marginHorizontal: space.x5, marginVertical: space.x3 }}>
      <Button testID="workspace-add" label={label} symbol="plus" onPress={onPress} />
    </View>
  );
}
