import { Button, ContentUnavailableView, Host } from '@expo/ui/swift-ui';
import { accessibilityIdentifier, buttonStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { useDesignTheme } from '../design/theme';
import { useStrings } from '../strings';
import { View } from 'react-native';
import { groupUnavailableCopy, type GroupUnavailableProps } from './group-unavailable-copy';

export function GroupUnavailable({ onBack, reason }: GroupUnavailableProps) {
  const theme = useDesignTheme();
  const t = useStrings();
  if (reason === undefined) return <View testID="group-unavailable" style={{ flex: 1 }} />;
  const copy = groupUnavailableCopy(t, reason);
  return (
    <Host style={{ flex: 1 }} colorScheme={theme.scheme}>
      <ContentUnavailableView
        title={copy.title}
        systemImage={reason === 'removed' ? 'lock' : 'bubble.left.and.bubble.right'}
        description={copy.body}
        actions={
          <Button
            label={t.backToChats}
            onPress={onBack}
            modifiers={[
              accessibilityIdentifier('group-unavailable-back'),
              buttonStyle('borderedProminent'),
              tint(theme.color.accent),
            ]}
          />
        }
      />
    </Host>
  );
}
