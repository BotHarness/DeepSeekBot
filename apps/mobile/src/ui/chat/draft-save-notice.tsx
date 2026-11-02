import { View } from 'react-native';

import { space } from '../design/tokens';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

export function DraftSaveNotice({ busy, onRetry }: { busy: boolean; onRetry(): void }) {
  const t = useStrings();
  return (
    <View style={{ paddingHorizontal: space.x3, gap: space.x2 }}>
      <Text selectable accessibilityLiveRegion="polite" variant="meta" tone="warning">
        {t.draftSaveFailed}
      </Text>
      <Button
        label={t.retry}
        testID="composer-draft-save-retry"
        variant="text"
        busy={busy}
        onPress={onRetry}
      />
    </View>
  );
}
